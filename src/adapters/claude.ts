import { listSessions, getSessionInfo } from "@anthropic-ai/claude-agent-sdk";
import { DomainError } from "../domain.js";
import {
  capabilities,
  type Adapter,
  type BackendInfo,
  type Session,
} from "./types.js";
export class ClaudeAdapter implements Adapter {
  readonly id = "claude-code" as const;
  constructor(private metadata = { listSessions, getSessionInfo }) {}
  async probe(): Promise<BackendInfo> {
    const info: BackendInfo = {
      id: this.id,
      name: "Claude Code · Agent SDK",
      version: "Agent SDK 0.3.287",
      installed: true,
      platform: process.platform,
      capabilities: capabilities(
        "Stored metadata only; external ownership and control are unverified",
      ),
    };
    try {
      await this.metadata.listSessions({ limit: 1 });
      const read = info.capabilities.find(
        (c) => c.feature === "read_existing",
      )!;
      read.state = "limited";
      read.testedAt = new Date().toISOString();
      read.evidence = "Agent SDK listSessions succeeded";
    } catch {}
    return info;
  }
  async list(project?: string): Promise<Session[]> {
    return (await this.metadata.listSessions({ dir: project, limit: 100 })).map(
      (s) => ({
        id: s.sessionId,
        backend: this.id,
        state: "unknown",
        owned: false,
        project: s.cwd ?? project ?? null,
        title: s.customTitle ?? s.summary,
      }),
    );
  }
  async read(id: string): Promise<Session> {
    const session = await this.metadata.getSessionInfo(id);
    if (!session)
      throw new DomainError("not_found", "Claude session not found", 404);
    return {
      id,
      backend: this.id,
      state: "unknown",
      owned: false,
      project: session.cwd ?? null,
      title: session.customTitle ?? session.summary,
    };
  }
  async close() {}
}
