import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import { DomainError } from "./domain.js";

export interface HostSnapshot {
  sessionId: string;
  project: string;
  state: "running" | "idle" | "question" | "permission" | "failed" | "unknown";
  signature: string;
  summary: string;
  turns: unknown[];
  userMessage?: { id: string; text: string; delegatedFrom?: string };
}
export interface AppHostTransport {
  readonly callerThreadId: string | null;
  info(): { available: boolean; transport: string; limitations: string[] };
  read(sessionId: string, project: string): Promise<HostSnapshot>;
  assertCanSend(project?: string): Promise<void>;
  send(
    sessionId: string,
    prompt: string,
    canSend: () => boolean,
  ): Promise<{ accepted: boolean; nativeId?: string }>;
  close(): Promise<void>;
}

function findServer() {
  const base = join(
    process.env.CODEX_HOME ?? join(homedir(), ".codex"),
    "plugins",
    "cache",
    "openai-bundled",
    "codex-app-tools",
  );
  if (!existsSync(base)) return null;
  const versions = readdirSync(base)
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  return (
    versions.map((v) => join(base, v, "server.mjs")).find(existsSync) ?? null
  );
}
function canonical(path: string) {
  const value = resolve(path).replace(/\\/g, "/");
  return process.platform === "win32" ? value.toLowerCase() : value;
}
export function subscriptionAuthAllowed(auth: any, configurations: string[]) {
  return (
    auth?.auth_mode === "chatgpt" &&
    !auth.OPENAI_API_KEY &&
    configurations.every(
      (text) =>
        !/^\s*model_provider\s*=\s*["'](?!openai["'])/m.test(text) &&
        !/^\s*(?:base_url|experimental_bearer_token)\s*=/m.test(text),
    )
  );
}

/** Uses the installed app tool server and real executor context; never starts an AI thread. */
export class LocalAppHost implements AppHostTransport {
  readonly callerThreadId = process.env.CODEX_THREAD_ID ?? null;
  private server = findServer();
  private pipe = process.env.CODEX_APP_TOOLS_PIPE_PATH;
  private client: Client | null = null;
  private opening: Promise<Client> | null = null;
  private closed = false;
  private projects = new Map<string, string>();
  info() {
    return {
      available: Boolean(
        this.server && this.pipe && this.callerThreadId && !this.closed,
      ),
      transport: "installed-codex-app-tools-stdio",
      limitations: [
        "Requires real executor-provided app context",
        "Installed app-tool version dependent",
        "Idle check is not an atomic host reservation",
        "Unattended Dots acceptance remains unverified",
      ],
    };
  }
  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    if (this.opening) return this.opening;
    if (!this.info().available)
      throw new DomainError(
        "app_host_unavailable",
        "Start kingdots from an existing Codex chat with official app context; no context is fabricated",
      );
    this.opening = (async () => {
      const env: Record<string, string> = Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      );
      for (const key of ["OPENAI_API_KEY", "CODEX_API_KEY", "OPENAI_BASE_URL"])
        delete env[key];
      const client = new Client({
        name: "kingdots-app-host",
        version: "0.1.2",
      });
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [this.server!],
        env,
        stderr: "pipe",
      });
      try {
        await client.connect(transport);
        (transport.stderr as Readable | null)?.resume();
        const list = await client.listTools();
        if (
          !["read_thread", "send_message_to_thread"].every((name) =>
            list.tools.some((t) => t.name === name),
          )
        )
          throw new Error("Required official app tools are missing");
        if (this.closed) throw new Error("App connection closed");
        this.client = client;
        return client;
      } catch (error) {
        await client.close();
        throw error;
      }
    })();
    try {
      return await this.opening;
    } finally {
      this.opening = null;
    }
  }
  private async call(
    name: string,
    args: Record<string, unknown>,
    canSend?: () => boolean,
  ) {
    const client = await this.connect();
    if (canSend && !canSend())
      throw new DomainError(
        "app_host_not_sent",
        "Management stopped before native dispatch",
      );
    const result = (await client.callTool(
      {
        name,
        arguments: args,
        _meta: { "x-codex-turn-metadata": { thread_id: this.callerThreadId! } },
      },
      undefined,
      { timeout: 30_000 },
    )) as { isError?: boolean; content: { type: string; text: string }[] };
    if (!Array.isArray(result.content))
      throw new DomainError(
        "app_host_response",
        "Official host returned an invalid receipt",
      );
    if (result.isError)
      throw new DomainError(
        "app_host_rejected",
        "Official host rejected the request: " +
          result.content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n"),
      );
    const text = result.content.find((c) => c.type === "text");
    if (!text || text.type !== "text")
      throw new DomainError(
        "app_host_response",
        "Official host returned no structured receipt",
      );
    return JSON.parse(text.text);
  }
  async read(sessionId: string, project: string): Promise<HostSnapshot> {
    const data = await this.call("read_thread", {
      threadId: sessionId,
      hostId: "local",
      turnLimit: 6,
      includeOutputs: false,
      maxOutputCharsPerItem: 4000,
    });
    const thread = data.thread;
    if (
      thread?.id !== sessionId ||
      thread.hostId !== "local" ||
      thread.kind !== "codex" ||
      canonical(thread.cwd ?? "") !== canonical(project)
    )
      throw new DomainError(
        "app_host_target",
        "Host result does not match the enrolled local Codex project and session",
      );
    const flags = (thread.status?.activeFlags ?? []).map((v: string) =>
      v.toLowerCase(),
    );
    const state: HostSnapshot["state"] = flags.some((v: string) =>
      /approval|permission/.test(v),
    )
      ? "permission"
      : flags.some((v: string) => /input|question/.test(v))
        ? "question"
        : thread.status?.type === "active"
          ? "running"
          : thread.status?.type === "idle"
            ? "idle"
            : thread.status?.type === "systemError"
              ? "failed"
              : "unknown";
    const turns = data.turns ?? [];
    const user = turns
      .flatMap((t: any) => t.items ?? [])
      .find((i: any) => i.type === "userMessage");
    const content = user?.content ?? [];
    const delegation = content.find(
      (c: any) => c.codexDelegation,
    )?.codexDelegation;
    const userMessage = user
      ? {
          id: user.id,
          text:
            delegation?.input ??
            content
              .filter((c: any) => c.type === "text")
              .map((c: any) => c.text)
              .join("\n"),
          delegatedFrom: delegation?.sourceThreadId,
        }
      : undefined;
    const signature = createHash("sha256")
      .update(
        JSON.stringify({
          status: thread.status,
          latest: turns[0]?.id,
          latestStatus: turns[0]?.status,
          user: userMessage?.id,
        }),
      )
      .digest("hex");
    this.projects.set(sessionId, project);
    return {
      sessionId,
      project,
      state,
      signature,
      summary: "Official local host state: " + state,
      turns,
      userMessage,
    };
  }
  async assertCanSend(project?: string) {
    const home = process.env.CODEX_HOME ?? join(homedir(), ".codex");
    try {
      const auth = JSON.parse(await readFile(join(home, "auth.json"), "utf8"));
      const configuration = (path: string) =>
        readFile(path, "utf8").catch((error) => {
          if (error.code === "ENOENT") return "";
          throw error;
        });
      const configs = [await configuration(join(home, "config.toml"))];
      if (project)
        configs.push(
          await configuration(join(project, ".codex", "config.toml")),
        );
      if (
        process.env.OPENAI_API_KEY ||
        process.env.CODEX_API_KEY ||
        process.env.OPENAI_BASE_URL ||
        !subscriptionAuthAllowed(auth, configs)
      )
        throw new Error("No verified ChatGPT subscription context");
    } catch {
      throw new DomainError(
        "api_billing_forbidden",
        "App-host writes require the existing ChatGPT login and standard provider; API/unknown authentication is blocked",
      );
    }
  }
  async send(sessionId: string, prompt: string, canSend: () => boolean) {
    await this.assertCanSend(this.projects.get(sessionId));
    let data;
    try {
      data = await this.call(
        "send_message_to_thread",
        {
          threadId: sessionId,
          hostId: "local",
          prompt,
        },
        canSend,
      );
    } catch (error) {
      if (error instanceof DomainError && error.code === "app_host_not_sent")
        return { accepted: false };
      throw error;
    }
    if (data.threadId !== sessionId)
      throw new DomainError(
        "app_host_response",
        "Host send receipt does not identify the selected session",
      );
    return { accepted: true, nativeId: data.threadId as string };
  }
  async close() {
    this.closed = true;
    await this.opening?.catch(() => {});
    await this.client?.close();
    this.client = null;
  }
}
