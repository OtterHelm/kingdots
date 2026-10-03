import type { BackendId } from "../domain.js";
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
export interface Adapter {
  id: BackendId;
  probe(): Promise<BackendInfo>;
  list(project?: string): Promise<Session[]>;
  read(sessionId: string): Promise<Session>;
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
    state: feature === "read_existing" ? state : "unsupported",
    notes:
      feature === "read_existing"
        ? notes
        : "Metadata adapters do not execute, resume, interrupt or approve sessions",
    testedAt: null,
    evidence: null,
  }));
}
