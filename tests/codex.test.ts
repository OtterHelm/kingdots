import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { CodexAdapter } from "../src/adapters/codex.js";
import type { Task } from "../src/domain.js";
test("API billing authentication is refused before creating a worker", async () => {
  for (const mode of ["apiKey", "amazonBedrock", "unknown"]) {
    const adapter = new CodexAdapter(process.execPath, [
      resolve("tests/fixtures/codex-wire.mjs"),
      "--fixture-auth=" + mode,
    ]);
    try {
      await assert.rejects(
        adapter.create({
          worktree: process.cwd(),
          scope: { allowedPaths: ["**"], allowNetwork: false },
        } as Task),
        /requires existing ChatGPT sign-in/,
      );
    } finally {
      await adapter.close();
    }
  }
});
test("authentication changing to API billing is refused before a subsequent turn", async () => {
  const adapter = new CodexAdapter(process.execPath, [
    resolve("tests/fixtures/codex-wire.mjs"),
    "--fixture-auth=change",
  ]);
  try {
    const task = {
      worktree: process.cwd(),
      scope: { allowedPaths: ["**"], allowNetwork: false },
    } as Task;
    const session = await adapter.create(task);
    await assert.rejects(
      adapter.send(session.id, "Do work", "blocked", task),
      /requires existing ChatGPT sign-in/,
    );
  } finally {
    await adapter.close();
  }
});
test("steering waits for startup and respects a revoked write signal", async () => {
  const adapter = new CodexAdapter(process.execPath, [
    resolve("tests/fixtures/codex-wire.mjs"),
  ]);
  try {
    const task = {
      worktree: process.cwd(),
      scope: { allowedPaths: ["**"], allowNetwork: false },
    } as Task;
    const session = await adapter.create(task);
    await adapter.send(session.id, "No edits", "command-1", task);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30);
    await assert.rejects(
      adapter.steer(session.id, "Extra guidance", task, controller.signal),
      /canceled before dispatch/,
    );
    const result = await adapter.steer(session.id, "Scoped guidance", task);
    assert.equal(result.nativeId, "fixture-turn");
    await adapter.interrupt(session.id);
  } finally {
    await adapter.close();
  }
});
test("cancellation waits for the accepted turn to become active; an idle queued history is insufficient", async () => {
  const adapter = new CodexAdapter(process.execPath, [
    resolve("tests/fixtures/codex-wire.mjs"),
  ]);
  const events: unknown[] = [];
  adapter.onEvent = (e) => events.push(e);
  try {
    const task = {
      worktree: process.cwd(),
      scope: { allowedPaths: ["**"], allowNetwork: false },
    } as Task;
    const session = await adapter.create(task);
    const started = Date.now();
    await adapter.send(session.id, "No edits", "command-1", task);
    await adapter.interrupt(session.id);
    assert.ok(Date.now() - started >= 200);
    assert.ok(
      events.some(
        (e: any) => e.type === "completed" && e.status === "interrupted",
      ),
    );
    assert.equal((await adapter.read(session.id)).state, "idle");
    assert.equal(
      (await adapter.resume({ ...task, sessionId: session.id })).owned,
      true,
    );
  } finally {
    await adapter.close();
  }
});
