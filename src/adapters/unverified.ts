import { DomainError, type Task } from "../domain.js";
import {
  capabilities,
  type Adapter,
  type AdapterEvent,
  type BackendInfo,
  type Session,
} from "./types.js";
export class UnverifiedAppAdapter implements Adapter {
  onEvent: (event: AdapterEvent) => void = () => {};
  constructor(readonly id: "codex-app" | "claude-app") {}
  async probe(): Promise<BackendInfo> {
    return {
      id: this.id,
      name:
        this.id === "codex-app"
          ? "Codex app"
          : "Claude app · Code / Chat / Cowork",
      version: null,
      installed: false,
      platform: process.platform,
      capabilities: capabilities(
        this.id === "codex-app"
          ? "Development planned: no verified official transport into the desktop app session owner"
          : "Development planned: Code session transfer does not establish control; Chat and Cowork remain unverified",
      ),
    };
  }
  private unavailable(): never {
    throw new DomainError(
      "connection_unverified",
      "Desktop app connection is unverified; CLI support is not app support",
    );
  }
  async list(): Promise<Session[]> {
    return this.unavailable();
  }
  async read(): Promise<Session> {
    return this.unavailable();
  }
  async create(_task: Task): Promise<Session> {
    return this.unavailable();
  }
  async send(): Promise<{ nativeId: string | null }> {
    return this.unavailable();
  }
  async steer(): Promise<{ nativeId: string | null }> {
    return this.unavailable();
  }
  async interrupt(): Promise<void> {
    return this.unavailable();
  }
  async resume(): Promise<Session> {
    return this.unavailable();
  }
  async close() {}
}
