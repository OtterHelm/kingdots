import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { join } from "node:path";
import { spawnTool, run, killTree, delay } from "../process.js";
import { DomainError } from "../domain.js";
import {
  capabilities,
  type Adapter,
  type BackendInfo,
  type Session,
} from "./types.js";
export class OpenCodeAdapter implements Adapter {
  readonly id = "opencode-cli" as const;
  private version: string | null = null;
  private client: any;
  private v2 = false;
  private child: ReturnType<typeof spawnTool> | null = null;
  private serviceFile: string;
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
            query: { directory: undefined },
          })
        ).data;
  }
  private async isRunning(id: string) {
    const statuses = this.v2
      ? await this.client.session.active()
      : (
          await this.client.session.status({
            query: { directory: undefined },
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
      owned: false,
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
      state: (await this.isRunning(id)) ? "running" : "unknown",
      owned: false,
      project: s.location?.directory ?? s.directory ?? null,
      title: s.title ?? id,
    };
  }

  async close() {
    // Only stop a process actually spawned by this adapter, never a reused service.
    if (this.child) await killTree(this.child.pid);
    this.child = null;
  }
}
