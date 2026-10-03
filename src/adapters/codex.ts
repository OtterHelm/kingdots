import { createInterface } from "node:readline";
import { spawnTool, run, killTree } from "../process.js";
import { DomainError } from "../domain.js";
import {
  capabilities,
  type Adapter,
  type BackendInfo,
  type Session,
} from "./types.js";
type RPC = {
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: { message: string; code: number };
};
export class CodexAdapter implements Adapter {
  readonly id = "codex-cli" as const;
  private child: ReturnType<typeof spawnTool> | null = null;
  private opening: Promise<void> | null = null;
  private sequence = 0;
  private pending = new Map<
    string,
    {
      resolve: (v: any) => void;
      reject: (e: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  constructor(
    private command = "codex",
    private extraArgs: string[] = [],
  ) {}
  async connect() {
    if (this.opening) return this.opening;
    if (this.child) return;
    this.opening = (async () => {
      const environment = { ...process.env };
      // The service never inherits API billing credentials into a worker.
      for (const key of ["OPENAI_API_KEY", "CODEX_API_KEY", "OPENAI_BASE_URL"])
        delete environment[key];
      const child = spawnTool(
        this.command,
        [
          ...this.extraArgs,
          "-c",
          'model_provider="openai"',
          "--disable",
          "plugins",
          "app-server",
          "--listen",
          "stdio://",
        ],
        { stdio: ["pipe", "pipe", "pipe"], env: environment },
      );
      this.child = child;
      // stderr is deliberately not retained: provider diagnostics can contain private configuration.
      child.stderr?.resume();
      createInterface({ input: child.stdout! }).on("line", (line) => {
        try {
          this.message(JSON.parse(line));
        } catch {}
      });
      const disconnect = () => {
        if (this.child !== child) return;
        this.child = null;
        for (const p of this.pending.values()) {
          clearTimeout(p.timer);
          p.reject(
            new DomainError(
              "uncertain_delivery",
              "App Server disconnected; reconcile before retrying",
            ),
          );
        }
        this.pending.clear();
      };
      child.once("error", disconnect);
      child.once("close", disconnect);
      await this.rpc("initialize", {
        clientInfo: { name: "kingdots", title: "kingdots", version: "0.1.4" },
        capabilities: { experimentalApi: false },
      });
      child.stdin!.write(JSON.stringify({ method: "initialized" }) + "\n");
    })();
    try {
      await this.opening;
    } catch (e) {
      await this.close();
      throw e;
    } finally {
      this.opening = null;
    }
  }
  private rpc(
    method: string,
    params: unknown = {},
    timeoutMs = 30_000,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const child = this.child;
      if (!child?.stdin?.writable) {
        reject(new DomainError("disconnected", "App Server is unavailable"));
        return;
      }
      const id = "kd-" + ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new DomainError(
            "uncertain_delivery",
            `Timed out awaiting ${method}; do not blindly repeat`,
          ),
        );
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, method, params }) + "\n", (e) => {
        if (e) {
          const p = this.pending.get(id);
          if (p) {
            clearTimeout(timer);
            this.pending.delete(id);
            p.reject(
              new DomainError("uncertain_delivery", "Transport write failed"),
            );
          }
        }
      });
    });
  }

  private message(message: RPC) {
    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(String(message.id));
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(String(message.id));
        message.error
          ? pending.reject(new Error(message.error.message))
          : pending.resolve(message.result);
      }
    } else if (message.id !== undefined && message.method) {
      this.child?.stdin?.write(
        JSON.stringify({
          id: message.id,
          error: { code: -32601, message: "Read-only metadata client" },
        }) + "\n",
      );
    }
  }
  async probe(): Promise<BackendInfo> {
    let version: string | null = null;
    try {
      version = (
        await run([this.command, "--version"], process.cwd(), 10_000)
      ).stdout.trim();
    } catch {}
    const info: BackendInfo = {
      id: this.id,
      name: "Codex CLI",
      version,
      installed: Boolean(version),
      platform: process.platform,
      capabilities: capabilities("Awaiting a live test on this version"),
    };
    info.capabilities.find((c) => c.feature === "adopt_running")!.state =
      "unsupported";
    info.capabilities.find((c) => c.feature === "adopt_running")!.notes =
      "External active sessions cannot be safely acquired";
    if (version)
      try {
        await this.connect();
        const auth = await this.rpc("account/read", { refreshToken: false });
        if (auth.account?.type !== "chatgpt")
          info.executionBlockedReason =
            "API billing is forbidden: existing ChatGPT sign-in is required; execution is blocked.";
        await this.rpc("thread/list", { limit: 1, useStateDbOnly: true });
        const c = info.capabilities.find((c) => c.feature === "read_existing")!;
        c.state = "limited";
        c.testedAt = new Date().toISOString();
        c.evidence = "initialize + thread/list succeeded";
        c.notes =
          "Stored history only; does not establish external process ownership";
      } catch (e) {
        info.capabilities.forEach((c) => (c.notes = (e as Error).message));
      }
    return info;
  }

  private toSession(thread: any): Session {
    return {
      id: thread.id,
      backend: this.id,
      state: thread.status?.type === "active" ? "running" : "unknown",
      owned: false,
      project: thread.cwd ?? null,
      title: thread.name ?? thread.preview ?? thread.id,
    };
  }
  async list(project?: string): Promise<Session[]> {
    await this.connect();
    const result = await this.rpc("thread/list", {
      limit: 100,
      cwd: project,
      useStateDbOnly: true,
      sourceKinds: ["cli", "appServer", "exec", "vscode"],
    });
    return (result.data ?? []).map((thread: any) => this.toSession(thread));
  }
  async read(id: string): Promise<Session> {
    await this.connect();
    return this.toSession(
      (await this.rpc("thread/read", { threadId: id, includeTurns: false }))
        .thread,
    );
  }
  async close() {
    const child = this.child;
    this.child = null;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("Adapter closed"));
    }
    this.pending.clear();
    if (child) await killTree(child.pid);
  }
}
