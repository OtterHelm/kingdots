import type { BackendId, Task, Usage } from "../domain.js";
export type Feature =
  | "read_existing"
  | "create"
  | "receive"
  | "steer"
  | "interrupt"
  | "resume"
  | "adopt_running"
  | "usage";
export type Support = "untested" | "supported" | "limited" | "unsupported";
export interface Capability {
  feature: Feature;
  state: Support;
  notes: string;
  testedAt: string | null;
  evidence: string | null;
}
export interface BackendInfo {
  id: BackendId;
  name: string;
  version: string | null;
  platform: string;
  installed: boolean;
  capabilities: Capability[];
  executionBlockedReason?: string;
}
export interface Session {
  id: string;
  backend: BackendId;
  state: "idle" | "running" | "waiting" | "unknown";
  owned: boolean;
  project: string | null;
  title: string;
  model?: string;
}
export type AdapterEvent =
  | {
      type: "completed";
      sessionId: string;
      nativeId: string | null;
      status: "completed" | "failed" | "interrupted";
      text: string;
      usage?: Usage;
    }
  | {
      type: "approval";
      sessionId: string;
      approvalId: string;
      description: string;
    }
  | { type: "activity"; sessionId: string; text: string }
  | { type: "disconnected"; sessionId: string; reason: string }
  | { type: "user_input"; sessionId: string };
export interface Adapter {
  id: BackendId;
  onEvent: (event: AdapterEvent) => void;
  probe(): Promise<BackendInfo>;
  list(project?: string): Promise<Session[]>;
  read(sessionId: string): Promise<Session>;
  create(task: Task): Promise<Session>;
  send(
    sessionId: string,
    prompt: string,
    commandId: string,
    task: Task,
  ): Promise<{ nativeId: string | null }>;
  steer(
    sessionId: string,
    prompt: string,
    task: Task,
    signal?: AbortSignal,
  ): Promise<{ nativeId: string | null }>;
  interrupt(sessionId: string): Promise<void>;
  resume(task: Task): Promise<Session>;
  approve?(approvalId: string, accept: boolean): Promise<void>;
  executeCheck?(
    argv: string[],
    task: Task,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<{ exitCode: number | null; stdout: string; stderr: string }>;
  close(): Promise<void>;
}
export const features: Feature[] = [
  "read_existing",
  "create",
  "receive",
  "steer",
  "interrupt",
  "resume",
  "adopt_running",
  "usage",
];
export function capabilities(
  notes: string,
  state: Support = "untested",
): Capability[] {
  return features.map((feature) => ({
    feature,
    state,
    notes,
    testedAt: null,
    evidence: null,
  }));
}
