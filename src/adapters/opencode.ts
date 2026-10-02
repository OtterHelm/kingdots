import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { join } from "node:path";
import { spawnTool, run, killTree, delay } from "../process.js";
import { DomainError, unavailableUsage, type Task } from "../domain.js";
import {
  capabilities,
  type Adapter,
  type AdapterEvent,
  type BackendInfo,
  type Session,
} from "./types.js";

export class OpenCodeAdapter implements Adapter {
  readonly id = "opencode-cli" as const;
  onEvent: (event: AdapterEvent) => void = () => {};
  private version: string | null = null;
  private client: any;
  private v2 = false;
  private child: ReturnType<typeof spawnTool> | null = null;
  private control = new AbortController();
  private owned = new Map<string, string>();
  private active = new Map<string, string>();
  private approvals = new Map<
    string,
    { sessionId: string; requestId: string }
  >();
  private serviceFile: string;
  private reconciliationTimer: NodeJS.Timeout | null = null;
  constructor(private dataDir: string) {
    this.serviceFile = join(dataDir, "opencode-service.json");
  }
  async probe(): Promise<BackendInfo> {
    try {
      const result = await run(["opencode", "--version"], this.dataDir, 8_000);
      this.version = result.exitCode === 0 ? result.stdout.trim() : null;
    } catch {}
    const info: BackendInfo = {
      id: this.id,
      name: "OpenCode CLI",
      version: this.version,
      installed: Boolean(this.version),
      platform: process.platform,
      capabilities: capabilities("Awaiting version-specific live tests"),
    };
    const c = info.capabilities.find((c) => c.feature === "adopt_running")!;
    c.state = "unsupported";
    c.notes = "External writers cannot be fenced by kingdots";
    return info;
  }
  private async connect() {
    if (this.client) return;
    if (!this.version) await this.probe();
    if (!this.version)
      throw new DomainError(
        "not_installed",
        "OpenCode CLI executable is unavailable",
      );
    this.v2 = /(?:^|\s)2\./.test(this.version);
    if (!this.v2 && !/(?:^|\s)1\./.test(this.version))
      throw new DomainError(
        "unknown_version",
        "No adapter is selected for this OpenCode version",
      );
    if (this.v2) {
      const { Service } = await import("@opencode/client/service");
      const { OpenCode } = await import("@opencode/client");
      const endpoint = await Service.ensure({
        file: this.serviceFile,
        version: (v) => v.startsWith("2."),
      });
      this.client = OpenCode.make({
        baseUrl: endpoint.url,
        headers: Service.headers(endpoint),
      });
    } else {
      const port = await new Promise<number>((accept) => {
        const server = createServer();
        server.listen(0, "127.0.0.1", () => {
          const port = (server.address() as { port: number }).port;
          server.close(() => accept(port));
        });
      });
      const password = randomBytes(32).toString("base64url");
      this.child = spawnTool(
        "opencode",
        ["serve", "--hostname", "127.0.0.1", "--port", String(port)],
        {
          cwd: this.dataDir,
          stdio: "ignore",
          env: { ...process.env, OPENCODE_SERVER_PASSWORD: password },
        },
      );
      const { createOpencodeClient } = await import("@opencode-ai/sdk");
      const url = `http://127.0.0.1:${port}`;
      let healthy = false;
      for (let i = 0; i < 80; i++) {
        try {
          const response = await fetch(url + "/global/health", {
            headers: {
              authorization:
                "Basic " +
                Buffer.from("opencode:" + password).toString("base64"),
            },
            signal: AbortSignal.timeout(1_000),
          });
          if (response.ok) {
            healthy = true;
            break;
          }
        } catch {}
        await delay(100);
      }
      if (!healthy) {
        await killTree(this.child.pid);
        this.child = null;
        throw new DomainError(
          "connection_failed",
          "OpenCode server did not become ready",
        );
      }
      this.client = createOpencodeClient({
        baseUrl: url,
        headers: {
          authorization:
            "Basic " + Buffer.from("opencode:" + password).toString("base64"),
        },
        throwOnError: true,
      });
    }
    void this.stream();
    this.reconciliationTimer = setInterval(() => {
      for (const id of this.active.keys())
        void this.reconcile(id).catch(() => {});
    }, 2_000);
    this.reconciliationTimer.unref();
  }
  private async stream() {
    while (!this.control.signal.aborted) {
      try {
        const subscription = this.v2
          ? this.client.event.subscribe({ signal: this.control.signal })
          : (await this.client.event.subscribe({ signal: this.control.signal }))
              .stream;
        for await (const event of subscription) {
          if (this.control.signal.aborted) break;
          const data = event.data ?? event.properties ?? {},
            id = data.sessionID ?? data.sessionId;
          if (!id || !this.owned.has(id)) continue;
          if (
            event.type === "permission.asked" ||
            event.type === "permission.updated"
          ) {
            const approvalId = randomUUID();
            this.approvals.set(approvalId, {
              sessionId: id,
              requestId: data.id,
            });
            this.onEvent({
              type: "approval",
              sessionId: id,
              approvalId,
              description: JSON.stringify(data).slice(0, 20_000),
            });
          }
          if (
            [
              "session.idle",
              "session.execution.succeeded",
              "session.execution.failed",
              "session.execution.interrupted",
            ].includes(event.type) ||
            (event.type === "session.status" && data.status?.type === "idle")
          )
            await this.reconcile(id);
          if (event.type === "session.error") {
            this.active.delete(id);
            this.onEvent({
              type: "completed",
              sessionId: id,
              nativeId: null,
              status: "failed",
              text: JSON.stringify(data.error ?? data),
            });
          }
        }
        if (this.control.signal.aborted) break;
        throw new Error("Event subscription ended");
      } catch (e) {
        if (this.control.signal.aborted) break;
        for (const id of this.active.keys())
          this.onEvent({
            type: "disconnected",
            sessionId: id,
            reason: "Event gap: " + (e as Error).message,
          });
        await delay(1_000);
        for (const id of this.active.keys())
          await this.reconcile(id).catch(() => {});
      }
    }
  }
  private async nativeRead(id: string) {
    return this.v2
      ? this.client.session.get(
          { sessionID: id },
          { signal: AbortSignal.timeout(10_000) },
        )
      : (
          await this.client.session.get({
            path: { id },
            query: { directory: this.owned.get(id) },
          })
        ).data;
  }
  private async isRunning(id: string) {
    const statuses = this.v2
      ? await this.client.session.active()
      : (
          await this.client.session.status({
            query: { directory: this.owned.get(id) },
          })
        ).data;
    return this.v2
      ? Boolean(statuses[id])
      : statuses[id]?.type !== undefined && statuses[id]?.type !== "idle";
  }
  async list(project?: string): Promise<Session[]> {
    await this.connect();
    const result = this.v2
      ? await this.client.session.list({
          location: project ? { directory: project } : undefined,
        })
      : (await this.client.session.list({ query: { directory: project } }))
          .data;
    const rows = Array.isArray(result)
      ? result
      : (result.sessions ?? result.items ?? result.data ?? []);
    return rows.map((s: any) => ({
      id: s.id,
      backend: this.id,
      state: "unknown",
      owned: this.owned.has(s.id),
      project: s.location?.directory ?? s.directory ?? null,
      title: s.title ?? s.id,
    }));
  }
  async read(id: string): Promise<Session> {
    await this.connect();
    const s = await this.nativeRead(id);
    return {
      id,
      backend: this.id,
      state: (await this.isRunning(id)) ? "running" : "idle",
      owned: this.owned.has(id),
      project: s.location?.directory ?? s.directory ?? null,
      title: s.title ?? id,
    };
  }
  async create(task: Task): Promise<Session> {
    await this.connect();
    const result = this.v2
      ? await this.client.session.create({
          title: task.goal,
          location: { directory: task.worktree },
          metadata: { kingdotsTask: task.id },
          permissions: [{ action: "*", resource: "*", effect: "ask" }],
        })
      : (
          await this.client.session.create({
            query: { directory: task.worktree },
            body: {
              title: task.goal,
              permission: [{ permission: "*", pattern: "*", action: "ask" }],
            },
          })
        ).data;
    this.owned.set(result.id, task.worktree!);
    return {
      id: result.id,
      backend: this.id,
      state: "idle",
      owned: true,
      project: task.worktree,
      title: task.goal,
    };
  }
  async send(id: string, prompt: string, commandId: string, _task: Task) {
    if (!this.owned.has(id))
      throw new DomainError("external_session", "Session is not owned");
    if (this.active.has(id))
      throw new DomainError("session_busy", "Session is active");
    this.active.set(id, commandId);
    try {
      if (this.v2) {
        const result = await this.client.session.prompt({
          sessionID: id,
          text: prompt,
          metadata: { kingdotsCommand: commandId },
        });
        return { nativeId: result.id ?? commandId };
      }
      await this.client.session.promptAsync({
        path: { id },
        query: { directory: this.owned.get(id) },
        body: { parts: [{ type: "text", text: prompt }] },
      });
      return { nativeId: commandId };
    } catch (e) {
      throw new DomainError(
        "uncertain_delivery",
        `OpenCode prompt result is uncertain: ${(e as Error).message}`,
      );
    }
  }
  async steer(id: string, prompt: string, task: Task) {
    if (!this.v2)
      throw new DomainError("unsupported", "V1 steering is not verified");
    if (!this.owned.has(id) || !this.active.has(id))
      throw new DomainError("not_running", "No owned active session");
    const result = await this.client.session.prompt({
      sessionID: id,
      text: prompt,
      delivery: "steer",
    });
    return { nativeId: result.id as string };
  }
  private async reconcile(id: string) {
    const commandId = this.active.get(id);
    if (!commandId || (await this.isRunning(id))) return;
    const session = await this.nativeRead(id);
    const result = this.v2
      ? await this.client.message.list({
          sessionID: id,
          order: "desc",
          limit: 20,
        })
      : (
          await this.client.session.messages({
            path: { id },
            query: { directory: this.owned.get(id), limit: 20 },
          })
        ).data;
    const messages = Array.isArray(result)
      ? result
      : (result.messages ?? result.items ?? result.data ?? []);
    const assistant = messages.find(
      (m: any) => m.type === "assistant" || m.info?.role === "assistant",
    );
    if (!assistant) {
      this.onEvent({
        type: "disconnected",
        sessionId: id,
        reason:
          "Idle status has no recoverable assistant result; command remains unknown",
      });
      return;
    }
    const parts = assistant.parts ?? assistant.content ?? [];
    this.active.delete(id);
    const tokens = session.tokens;
    this.onEvent({
      type: "completed",
      sessionId: id,
      nativeId: commandId,
      status:
        session.outcome === "failed" || assistant.info?.error
          ? "failed"
          : session.outcome === "interrupted"
            ? "interrupted"
            : "completed",
      text: parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("\n"),
      usage:
        this.v2 && tokens
          ? {
              tokens:
                tokens.input +
                tokens.output +
                tokens.reasoning +
                tokens.cache.read +
                tokens.cache.write,
              costUsd: typeof session.cost === "number" ? session.cost : null,
              costKind: "provider_estimate",
              scope: "session",
              source: "OpenCode session totals",
              observedAt: new Date().toISOString(),
            }
          : unavailableUsage("OpenCode V1 totals not normalized"),
    });
  }
  async interrupt(id: string) {
    if (!this.owned.has(id))
      throw new DomainError(
        "external_session",
        "Cannot interrupt external sessions",
      );
    if (this.v2) await this.client.session.interrupt({ sessionID: id });
    else
      await this.client.session.abort({
        path: { id },
        query: { directory: this.owned.get(id) },
      });
    for (let i = 0; i < 100; i++) {
      if (!(await this.isRunning(id))) {
        this.active.delete(id);
        return;
      }
      await delay(100);
    }
    throw new DomainError("interrupt_unconfirmed", "OpenCode remains active");
  }
  async resume(task: Task) {
    if (!task.sessionId || !this.owned.has(task.sessionId))
      throw new DomainError(
        "ownership_unknown",
        "Cannot acquire a pre-existing OpenCode writer",
      );
    return this.read(task.sessionId);
  }
  async approve(id: string, accept: boolean) {
    const r = this.approvals.get(id);
    if (!r) throw new DomainError("approval_expired", "Request is unavailable");
    if (this.v2)
      await this.client.permission.reply({
        sessionID: r.sessionId,
        requestID: r.requestId,
        decision: accept ? "once" : "reject",
      });
    else
      await this.client.postSessionIdPermissionsPermissionId({
        path: { id: r.sessionId, permissionID: r.requestId },
        body: { response: accept ? "once" : "reject" },
      });
    this.approvals.delete(id);
  }
  async close() {
    this.control.abort();
    if (this.reconciliationTimer) clearInterval(this.reconciliationTimer);
    if (this.child) await killTree(this.child.pid);
    if (this.v2 && this.client) {
      const { Service } = await import("@opencode/client/service");
      await Service.stop({ file: this.serviceFile }).catch(() => {});
    }
  }
}
