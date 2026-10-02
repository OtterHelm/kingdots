import { z } from "zod";

export const backendIds = [
  "codex-cli",
  "codex-app",
  "claude-code",
  "claude-app",
  "opencode-cli",
] as const;
export type BackendId = (typeof backendIds)[number];
export type TaskState =
  | "preparing"
  | "running"
  | "verifying"
  | "awaiting_decision"
  | "awaiting_input"
  | "paused"
  | "released"
  | "failed"
  | "completed";
export const relativePath = z
  .string()
  .min(1)
  .refine(
    (v) => !/^(?:[a-z]:|[\\/])|(?:^|[\\/])\.\.(?:[\\/]|$)/i.test(v),
    "A relative path inside the worktree is required",
  );
export const checkSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  argv: z.array(z.string()).min(1),
  timeoutMs: z.number().int().positive().default(120_000),
});
export const createTaskSchema = z.object({
  goal: z.string().min(1),
  project: z.string().min(1),
  baseRef: z.string().optional(),
  allowedBackends: z.array(z.enum(backendIds)).min(1).default(["codex-cli"]),
  backend: z.enum(backendIds).default("codex-cli"),
  model: z.string().min(1).optional(),
  checks: z.array(checkSchema).min(1),
  artifacts: z.array(relativePath).default([]),
  scope: z
    .object({
      allowedPaths: z.array(relativePath).min(1).default(["**"]),
      allowNetwork: z.boolean().default(false),
    })
    .default({ allowedPaths: ["**"], allowNetwork: false }),
  limits: z
    .object({
      durationMs: z.number().positive().optional(),
      tokens: z.number().int().positive().optional(),
      costUsd: z.number().positive().optional(),
    })
    .default({}),
  includeDirty: z.boolean().default(true),
  authorization: z.object({
    request: z.string().min(1),
    source: z.literal("direct_user_request"),
  }),
});
export type CreateTask = z.infer<typeof createTaskSchema>;
export interface Usage {
  tokens: number | null;
  costUsd: number | null;
  costKind: "reported" | "provider_estimate" | "unavailable";
  scope: "session" | "run" | "account" | "unavailable";
  source: string;
  observedAt: string;
}
export const unavailableUsage = (
  source = "Provider does not expose task usage",
): Usage => ({
  tokens: null,
  costUsd: null,
  costKind: "unavailable",
  scope: "unavailable",
  source,
  observedAt: new Date().toISOString(),
});
export interface Evidence {
  id: string;
  checkId: string;
  label: string;
  argv: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  fingerprint: string;
  startedAt: string;
  finishedAt: string;
  passed: boolean;
}
export interface Task extends CreateTask {
  id: string;
  state: TaskState;
  revision: number;
  createdAt: string;
  updatedAt: string;
  worktree: string | null;
  branch: string | null;
  baseCommit: string | null;
  baselineFingerprint: string | null;
  sessionId: string | null;
  epoch: number;
  automatic: boolean;
  blockedReason: string | null;
  lastHealthyAt: string | null;
  lastDecisionAt: string | null;
  recentAction: string;
  nextAction: string;
  checklist: { id: string; label: string; done: boolean }[];
  evidence: Evidence[];
  artifactEvidence: { path: string; sha256: string; size: number }[];
  usage: Usage;
  failureFingerprint: string | null;
  failureCount: number;
  finalReport: string | null;
}
export interface Command {
  id: string;
  taskId: string;
  action: string;
  reason: string;
  prompt: string | null;
  inputHash: string;
  epoch: number;
  status:
    "queued" | "dispatching" | "accepted" | "completed" | "failed" | "unknown";
  nativeId: string | null;
  result: unknown;
  createdAt: string;
  updatedAt: string;
}
export interface EventRecord {
  id: string;
  name: "task.attention_required" | "task.completed";
  taskId: string;
  revision: number;
  cause: string;
  timestamp: string;
  cursor: number;
}
export const commandSchema = z.object({
  commandId: z.string().min(1).max(200),
  reason: z.string().min(1),
  prompt: z.string().min(1).optional(),
  epoch: z.number().int().nonnegative(),
});
export type CommandInput = z.infer<typeof commandSchema>;
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
