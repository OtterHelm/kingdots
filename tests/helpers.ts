import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { git } from "../src/workspace.js";
import { Store } from "../src/store.js";
import { Manager } from "../src/manager.js";
import { run } from "../src/process.js";
import { unavailableUsage, type Task, type BackendId } from "../src/domain.js";
import {
  capabilities,
  type Adapter,
  type AdapterEvent,
  type Session,
  type BackendInfo,
} from "../src/adapters/types.js";
export class FakeAdapter implements Adapter {
  readonly id = "codex-cli" as const;
  onEvent: (e: AdapterEvent) => void = () => {};
  sends = 0;
  interrupts = 0;
  sessions = new Map<string, Session>();
  onSend: (task: Task, attempt: number) => Promise<void> = async () => {};
  emitResults = true;
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
  async create(task: Task) {
    const session: Session = {
      id: randomUUID(),
      backend: this.id,
      state: "idle",
      owned: true,
      project: task.worktree,
      title: task.goal,
    };
    this.sessions.set(session.id, session);
    return session;
  }
  async send(id: string, _prompt: string, commandId: string, task: Task) {
    this.sends++;
    this.sessions.get(id)!.state = "running";
    if (this.emitResults)
      setImmediate(() => {
        void this.onSend(task, this.sends).then(() => {
          this.sessions.get(id)!.state = "idle";
          this.onEvent({
            type: "completed",
            sessionId: id,
            nativeId: commandId,
            status: "completed",
            text: "Worker says done",
            usage: unavailableUsage(),
          });
        });
      });
    return { nativeId: commandId };
  }
  async steer(id: string, prompt: string, task: Task) {
    return this.send(id, prompt, randomUUID(), task);
  }
  async interrupt(id: string) {
    this.interrupts++;
    const s = this.sessions.get(id);
    if (s) s.state = "idle";
  }
  async resume(task: Task) {
    return this.read(task.sessionId!);
  }
  async executeCheck(
    argv: string[],
    task: Task,
    timeoutMs: number,
    signal: AbortSignal,
  ) {
    return run(argv, task.worktree!, timeoutMs, signal);
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
export async function repaired(f: Awaited<ReturnType<typeof fixture>>) {
  f.adapter.onSend = async (task) => {
    await writeFile(
      join(task.worktree!, "math.mjs"),
      "export const add = (a, b) => a + b;\n",
    );
  };
  const task = await f.manager.create(f.input);
  await waitFor(() => f.store.getTask(task.id).state === "awaiting_decision");
  return f.store.getTask(task.id);
}
