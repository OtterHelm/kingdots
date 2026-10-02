import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture, waitFor, repaired } from "./helpers.js";
import { git } from "../src/workspace.js";
import { Manager } from "../src/manager.js";
import { tools, callTool } from "../src/tools.js";
import { Events } from "../src/events.js";
const command = (epoch: number, id: string, prompt?: string) => ({
  commandId: id,
  reason: "Test supervisor decision",
  epoch,
  ...(prompt ? { prompt } : {}),
});
test("a billing restriction rejects work before creating a task while retaining discovery", async () => {
  const f = await fixture();
  const reason = "API billing is forbidden";
  const restricted = new Manager(
    f.store,
    f.manager.adapters,
    f.data,
    () => reason,
  );
  try {
    await assert.rejects(
      restricted.create(f.input),
      /API billing is forbidden/,
    );
    assert.equal(f.store.tasks().length, 0);
    assert.equal(f.adapter.sends, 0);
    assert.equal(
      (await restricted.capabilities())[0].executionBlockedReason,
      reason,
    );
    assert.deepEqual(await f.adapter.list(), []);
  } finally {
    await restricted.close();
    await f.cleanup();
  }
});

test("dirty work is copied into a separate worktree without changing the original index", async () => {
  const f = await fixture();
  try {
    f.adapter.emitResults = false;
    await writeFile(
      join(f.project, "math.mjs"),
      "export const add = (a,b) => a + b;\n",
    );
    await git(f.project, ["add", "math.mjs"]);
    await writeFile(join(f.project, "notes.txt"), "Untracked note");
    const before = await git(f.project, ["status", "--porcelain"]);
    const task = await f.manager.create(f.input);
    assert.notEqual(task.worktree, f.project);
    assert.equal(
      await readFile(join(task.worktree!, "notes.txt"), "utf8"),
      "Untracked note",
    );
    assert.equal(await git(f.project, ["status", "--porcelain"]), before);
    assert.match(
      await readFile(join(task.worktree!, "math.mjs"), "utf8"),
      /a \+ b/,
    );
  } finally {
    await f.cleanup();
  }
});
test("failed verification leads to a scoped repair, re-verification and evidence-based completion", async () => {
  const f = await fixture();
  try {
    const task = await f.manager.create(f.input);
    await waitFor(() => f.store.getTask(task.id).state === "awaiting_decision");
    let current = f.store.getTask(task.id);
    assert.equal(current.evidence[0].passed, false);
    assert.equal(current.failureCount, 1);
    await assert.rejects(
      f.manager.complete(
        task.id,
        command(current.epoch, "too-early"),
        "AI says done",
      ),
      /missing, failed, or stale/,
    );
    f.adapter.onSend = async (t) => {
      await writeFile(
        join(t.worktree!, "math.mjs"),
        "export const add = (a,b) => a + b;\n",
      );
    };
    await f.manager.dispatch(
      task.id,
      "send",
      command(current.epoch, "repair-1", "Fix the actual failing addition"),
    );
    await waitFor(() => f.store.getTask(task.id).state === "awaiting_decision");
    current = f.store.getTask(task.id);
    assert.equal(current.evidence[0].passed, true);
    await f.manager.complete(
      task.id,
      command(current.epoch, "complete-1"),
      "Addition fixed; node --test passes in the isolated worktree.",
    );
    assert.equal(f.store.getTask(task.id).state, "completed");
    assert.equal(f.adapter.sends, 2);
    assert.match(await readFile(join(f.project, "math.mjs"), "utf8"), /a - b/);
    assert.equal(f.store.events().at(-1)!.name, "task.completed");
  } finally {
    await f.cleanup();
  }
});
test("duplicate command delivery executes once; different input with the same ID is refused", async () => {
  const f = await fixture();
  try {
    const task = await repaired(f);
    f.adapter.emitResults = false;
    const input = command(task.epoch, "same-id", "Read the test result");
    await f.manager.dispatch(task.id, "send", input);
    await f.manager.dispatch(task.id, "send", input);
    assert.equal(f.adapter.sends, 2);
    await assert.rejects(
      f.manager.dispatch(task.id, "send", {
        ...input,
        prompt: "Different action",
      }),
      /different input/,
    );
  } finally {
    await f.cleanup();
  }
});
test("stale completion evidence is rejected after a file changes", async () => {
  const f = await fixture();
  try {
    const task = await repaired(f);
    await writeFile(
      join(task.worktree!, "math.mjs"),
      "export const add = (a,b) => a + b + 1;",
    );
    await assert.rejects(
      f.manager.complete(
        task.id,
        command(task.epoch, "stale-complete"),
        "Done",
      ),
      /stale/,
    );
    assert.notEqual(f.store.getTask(task.id).state, "completed");
  } finally {
    await f.cleanup();
  }
});
test("missing required artifacts prevent completion", async () => {
  const f = await fixture();
  try {
    f.adapter.onSend = async (t) => {
      await writeFile(
        join(t.worktree!, "math.mjs"),
        "export const add = (a,b) => a+b;",
      );
    };
    const task = await f.manager.create({
      ...f.input,
      artifacts: ["report.txt"],
    });
    await waitFor(() => f.store.getTask(task.id).state === "awaiting_decision");
    assert.match(f.store.getTask(task.id).blockedReason!, /Required artifact/);
    await assert.rejects(
      f.manager.complete(task.id, command(task.epoch, "no-artifact"), "Done"),
    );
  } finally {
    await f.cleanup();
  }
});
test("scope violations are detected independently of passing tests", async () => {
  const f = await fixture();
  try {
    f.adapter.onSend = async (t) => {
      await writeFile(
        join(t.worktree!, "math.mjs"),
        "export const add = (a,b) => a+b;",
      );
      await writeFile(join(t.worktree!, "unauthorized.txt"), "outside scope");
    };
    const task = await f.manager.create({
      ...f.input,
      scope: { allowedPaths: ["math.mjs"], allowNetwork: false },
    });
    await waitFor(() => f.store.getTask(task.id).state === "awaiting_decision");
    assert.match(
      f.store.getTask(task.id).blockedReason!,
      /outside the authorized/,
    );
    await assert.rejects(
      f.manager.complete(
        task.id,
        command(task.epoch, "scope-complete"),
        "Done",
      ),
    );
  } finally {
    await f.cleanup();
  }
});
test("three identical verification failures stop automatic management", async () => {
  const f = await fixture();
  try {
    const task = await f.manager.create(f.input);
    await waitFor(() => f.store.getTask(task.id).state === "awaiting_decision");
    await f.manager.verify(task.id, command(task.epoch, "verify-2"));
    await f.manager.verify(task.id, command(task.epoch, "verify-3"));
    assert.equal(f.store.getTask(task.id).state, "failed");
    assert.equal(f.store.getTask(task.id).automatic, false);
  } finally {
    await f.cleanup();
  }
});
test("pause fences old commands and release relinquishes the session lease", async () => {
  const f = await fixture();
  try {
    f.adapter.emitResults = false;
    const task = await f.manager.create(f.input);
    const paused = await f.manager.pause(task.id);
    assert.equal(paused.state, "paused");
    assert.ok(paused.epoch > task.epoch);
    await assert.rejects(
      f.manager.dispatch(
        task.id,
        "send",
        command(task.epoch, "stale-write", "Continue"),
      ),
      /inactive or stale/,
    );
    assert.equal(f.adapter.sends, 1);
    await f.manager.pause(task.id, true);
    assert.equal(f.store.getTask(task.id).state, "released");
    assert.equal(
      f.store.db.prepare("SELECT COUNT(*) AS n FROM leases").get()?.n,
      0,
    );
  } finally {
    await f.cleanup();
  }
});
test("another task cannot acquire the same session", async () => {
  const f = await fixture();
  try {
    f.adapter.emitResults = false;
    const task = await f.manager.create(f.input);
    assert.throws(
      () =>
        f.store.acquire(
          "codex-cli:" + task.sessionId,
          "another-task",
          task.epoch,
        ),
      /already has a writer/,
    );
  } finally {
    await f.cleanup();
  }
});
test("unknown remote delivery is retained and never blindly retried", async () => {
  const f = await fixture();
  try {
    const task = await repaired(f);
    f.adapter.send = async () => {
      const { DomainError } = await import("../src/domain.js");
      throw new DomainError("uncertain_delivery", "Lost acknowledgment");
    };
    const input = command(task.epoch, "uncertain", "Continue");
    await assert.rejects(f.manager.dispatch(task.id, "send", input));
    assert.equal(f.store.command("uncertain")!.status, "unknown");
    assert.equal(f.store.getTask(task.id).automatic, false);
    const duplicate = await f.manager.dispatch(task.id, "send", input);
    assert.equal(duplicate.status, "unknown");
  } finally {
    await f.cleanup();
  }
});
test("restart fences in-flight tasks and leaves accepted commands unknown", async () => {
  const f = await fixture();
  let restarted: Manager | undefined;
  try {
    f.adapter.emitResults = false;
    const task = await f.manager.create(f.input);
    restarted = new Manager(f.store, f.manager.adapters, f.data);
    const current = f.store.getTask(task.id);
    assert.equal(current.state, "awaiting_input");
    assert.equal(current.automatic, false);
    assert.equal(f.store.command(task.id + ":initial")!.status, "unknown");
    await assert.rejects(
      restarted.dispatch(
        task.id,
        "send",
        command(task.epoch, "after-crash", "Continue"),
      ),
      /inactive or stale/,
    );
  } finally {
    await restarted?.close();
    await f.cleanup();
  }
});
test("multiple independent tasks start without a product concurrency cap", async () => {
  const f = await fixture();
  try {
    f.adapter.emitResults = false;
    const tasks = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        f.manager.create({ ...f.input, goal: "Independent task " + i }),
      ),
    );
    assert.equal(f.adapter.sends, 4);
    assert.equal(new Set(tasks.map((t) => t.worktree)).size, 4);
    assert.ok(tasks.every((t) => t.state === "running"));
  } finally {
    await f.cleanup();
  }
});
test("unavailable usage is not estimated and unenforceable strict budgets are refused", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.manager.create({ ...f.input, limits: { tokens: 100 } }),
      /strict token cap/,
    );
    await assert.rejects(
      f.manager.create({ ...f.input, limits: { costUsd: 1 } }),
      /native estimated-cost/,
    );
    const task = await repaired(f);
    assert.equal(task.usage.tokens, null);
    assert.equal(task.usage.costUsd, null);
  } finally {
    await f.cleanup();
  }
});
test("external session adoption is absent from the public observer tools", async () => {
  const f = await fixture();
  const { Observer } = await import("../src/watch.js");
  const observer = new Observer(f.store, f.manager.adapters);
  try {
    const task = await repaired(f);
    const events = new Events(f.store, {
      get: () => undefined,
      set: async () => {},
    });
    await assert.rejects(
      callTool(tools(f.manager, events, observer), "session_attach", {
        taskId: task.id,
        sessionId: "external",
        epoch: task.epoch,
      }),
      /Unknown tool/,
    );
  } finally {
    await observer.close();
    await f.cleanup();
  }
});
test("duration limits stop running work", async () => {
  const f = await fixture();
  try {
    f.adapter.emitResults = false;
    const task = await f.manager.create({
      ...f.input,
      limits: { durationMs: 60_000 },
    });
    const running = f.store.getTask(task.id);
    assert.equal(running.state, "running");
    running.createdAt = new Date(Date.now() - 60_001).toISOString();
    f.store.saveTask(running);
    await waitFor(() => !f.store.getTask(task.id).automatic, 5000);
    assert.match(f.store.getTask(task.id).blockedReason!, /budget/);
    assert.equal(f.adapter.interrupts, 1);
  } finally {
    await f.cleanup();
  }
});
test("pause cancels a verification process and invalidates its results", async () => {
  const f = await fixture();
  try {
    f.adapter.emitResults = false;
    const task = await f.manager.create({
      ...f.input,
      checks: [
        {
          id: "slow",
          label: "Slow check",
          argv: [process.execPath, "-e", "setTimeout(()=>{},30000)"],
          timeoutMs: 40000,
        },
      ],
    });
    const current = f.store.getTask(task.id);
    current.state = "awaiting_decision";
    f.store.saveTask(current);
    const verifying = f.manager.verify(
      task.id,
      command(current.epoch, "slow-verify"),
    );
    await waitFor(() => f.store.getTask(task.id).state === "verifying");
    await f.manager.pause(task.id);
    await verifying;
    assert.equal(f.store.getTask(task.id).state, "paused");
    assert.equal(f.store.command("slow-verify")!.status, "failed");
    assert.equal(f.store.getTask(task.id).evidence.length, 0);
  } finally {
    await f.cleanup();
  }
});
