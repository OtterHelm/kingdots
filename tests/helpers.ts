import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fingerprint, git } from "../src/workspace.js";
import { Store } from "../src/store.js";
import { Manager } from "../src/manager.js";
import { run } from "../src/process.js";
import {
  createTaskSchema,
  unavailableUsage,
  type Task,
  type BackendId,
} from "../src/domain.js";
import {
  capabilities,
  type Adapter,
  type Session,
  type BackendInfo,
} from "../src/adapters/types.js";
export class FakeAdapter implements Adapter {
  readonly id = "codex-cli" as const;
  sends = 0;
  interrupts = 0;
  sessions = new Map<string, Session>();
  async probe(): Promise<BackendInfo> {
    return {
      id: this.id,
      name: "Test worker",
      version: "fixture",
      platform: process.platform,
      installed: true,
      capabilities: capabilities("Test adapter only"),
    };
  }
  async list() {
    return [...this.sessions.values()];
  }
  async read(id: string) {
    return (
      this.sessions.get(id) ?? {
        id,
        backend: this.id,
        state: "unknown" as const,
        owned: false,
        project: null,
        title: id,
      }
    );
  }
  async create() {
    this.sends++;
    throw new Error("Unexpected worker creation");
  }
  async send() {
    this.sends++;
    throw new Error("Unexpected adapter send");
  }
  async interrupt() {
    this.interrupts++;
    throw new Error("Unexpected adapter interrupt");
  }
  async steer() {
    this.sends++;
    throw new Error("Unexpected adapter steering");
  }
  async resume() {
    this.sends++;
    throw new Error("Unexpected adapter resume");
  }
  async close() {}
}
export async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "kingdots-test-"));
  const project = join(root, "project"),
    data = join(root, "data");
  await mkdir(project);
  await mkdir(data);
  await writeFile(
    join(project, "math.mjs"),
    "export const add = (a, b) => a - b;\n",
  );
  await writeFile(
    join(project, "math.test.mjs"),
    "import {test} from 'node:test'; import assert from 'node:assert/strict'; import {add} from './math.mjs'; test('adds',()=>assert.equal(add(2,3),5));\n",
  );
  await git(project, ["init", "-b", "main"]);
  await git(project, ["config", "user.name", "kingdots Fixture"]);
  await git(project, ["config", "user.email", "fixture@example.invalid"]);
  await git(project, ["add", "."]);
  await git(project, ["commit", "-m", "Fixture"]);
  const store = new Store(join(data, "test.sqlite"));
  const adapter = new FakeAdapter();
  const manager = new Manager(
    store,
    new Map<BackendId, Adapter>([["codex-cli", adapter]]),
    data,
  );
  const input = {
    goal: "Fix the failing math test",
    project,
    checks: [
      {
        id: "tests",
        label: "Math tests pass",
        argv: [process.execPath, "--test"],
      },
    ],
    authorization: {
      source: "direct_user_request",
      request: "Fix this fixture and validate it",
    },
  };
  return {
    root,
    project,
    data,
    store,
    adapter,
    manager,
    input,
    async cleanup() {
      await manager.close();
      store.close();
      const prefix = resolve(tmpdir(), "kingdots-test-");
      if (!resolve(root).startsWith(prefix))
        throw new Error("Unsafe fixture cleanup target");
      await rm(root, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    },
  };
}
export async function waitFor(fn: () => boolean, timeout = 10_000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout)
      throw new Error("Timed out waiting for fixture state");
    await new Promise((r) => setTimeout(r, 30));
  }
}
// Saved legacy evidence fixture; no worker is created or executed.
export async function repaired(f: Awaited<ReturnType<typeof fixture>>) {
  const now = new Date().toISOString();
  const params = createTaskSchema.parse(f.input);
  const task: Task = {
    ...params,
    id: randomUUID(),
    state: "awaiting_decision",
    revision: 1,
    createdAt: now,
    updatedAt: now,
    worktree: f.project,
    branch: null,
    baseCommit: null,
    baselineFingerprint: null,
    sessionId: null,
    epoch: 0,
    automatic: false,
    blockedReason: null,
    lastHealthyAt: now,
    lastDecisionAt: null,
    recentAction: "Saved legacy result",
    nextAction: "Review evidence",
    checklist: [],
    evidence: [
      {
        id: randomUUID(),
        checkId: "tests",
        label: "Saved tests",
        argv: ["node", "--test"],
        exitCode: 0,
        stdout: "Fixture evidence",
        stderr: "",
        fingerprint: await fingerprint(f.project),
        startedAt: now,
        finishedAt: now,
        passed: true,
      },
    ],
    artifactEvidence: [],
    usage: unavailableUsage(),
    failureFingerprint: null,
    failureCount: 0,
    finalReport: null,
  };
  f.store.saveTask(task);
  f.store.event(task, "legacy_evidence_saved");
  return task;
}
