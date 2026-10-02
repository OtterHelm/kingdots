import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { Store } from "../src/store.js";
import { Manager } from "../src/manager.js";
import { CodexAdapter } from "../src/adapters/codex.js";
import { git } from "../src/workspace.js";
import type { Adapter } from "../src/adapters/types.js";
import type { BackendId } from "../src/domain.js";

const root = resolve(".kingdots", "live-" + Date.now());
const project = join(root, "fixture");
await mkdir(project, { recursive: true });
await writeFile(
  join(project, "math.mjs"),
  "export const add = (a,b) => a - b;\n",
);
await writeFile(
  join(project, "math.test.mjs"),
  "import {test} from 'node:test';import assert from 'node:assert/strict';import {add} from './math.mjs';test('adds',()=>assert.equal(add(2,3),5));\n",
);
await git(project, ["init", "-b", "main"]);
await git(project, ["config", "user.name", "kingdots Live Fixture"]);
await git(project, ["config", "user.email", "fixture@example.invalid"]);
await git(project, ["add", "."]);
await git(project, ["commit", "-m", "Controlled fixture"]);
const data = join(root, "data");
const store = new Store(join(data, "kingdots.sqlite"));
const codex = new CodexAdapter();
const manager = new Manager(
  store,
  new Map<BackendId, Adapter>([["codex-cli", codex]]),
  data,
);
const input = {
  goal: "Fix the incorrect add implementation in math.mjs. Change only math.mjs. Keep the test unchanged. Report the fix. Do not commit, push, deploy, install anything, or change account settings.",
  project,
  checks: [
    { id: "tests", label: "Addition test", argv: [process.execPath, "--test"] },
  ],
  scope: { allowedPaths: ["math.mjs"], allowNetwork: false },
  limits: { durationMs: 240000 },
  authorization: {
    source: "direct_user_request",
    request:
      "User authorized implementing and testing kingdots using a small controlled Codex fixture",
  },
};
const results: any = {
  root,
  startedAt: new Date().toISOString(),
  dotsWake: "unverified",
  note: "This is a real Codex integration test with a scripted supervisor, not an actual Dots unattended acceptance test.",
};
async function settle(id: string) {
  const start = Date.now();
  while (Date.now() - start < 240000) {
    const task = store.getTask(id);
    if (
      ["awaiting_decision", "awaiting_input", "failed", "paused"].includes(
        task.state,
      )
    )
      return task;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Live fixture timed out");
}
try {
  results.probe = await codex.probe();
  process.stdout.write(
    "Codex App Server connected; running a controlled repair.\n",
  );
  const task = await manager.create(input);
  let current = await settle(task.id);
  results.taskId = task.id;
  if (
    current.state !== "awaiting_decision" ||
    current.evidence.length !== current.checks.length ||
    !current.evidence.every((e) => e.passed)
  ) {
    results.task = current;
    throw new Error(
      "Live repair did not pass independent verification: " +
        current.blockedReason,
    );
  }
  await manager.dispatch(task.id, "send", {
    commandId: task.id + ":review",
    epoch: current.epoch,
    reason: "Live test: verify session follow-up",
    prompt:
      "Review your previous change. Confirm it fixes addition and that the test was not edited. Make no file changes.",
  });
  current = await settle(task.id);
  if (
    current.state !== "awaiting_decision" ||
    current.evidence.length !== current.checks.length ||
    !current.evidence.every((e) => e.passed)
  )
    throw new Error("Follow-up verification failed");
  await manager.complete(
    task.id,
    {
      commandId: task.id + ":complete",
      epoch: current.epoch,
      reason: "Scripted supervisor confirmed live evidence",
    },
    "Codex repaired addition; the independent sandbox test passed. Original project is preserved.",
  );
  results.originalPreserved = (
    await readFile(join(project, "math.mjs"), "utf8")
  ).includes("a - b");
  results.task = store.getTask(task.id);
  results.commands = store.commands(task.id);
  process.stdout.write(
    "Real repair, session follow-up, independent verification, and completion passed. Testing cancellation.\n",
  );
  const cancellation = await manager.create({
    ...input,
    goal: "Inspect math.mjs and explain its current implementation. Make no changes.",
  });
  await manager.dispatch(cancellation.id, "steer", {
    commandId: cancellation.id + ":steer",
    epoch: cancellation.epoch,
    reason: "Live test: active-turn steering",
    prompt: "Make no file changes. Keep the response brief.",
  });
  const paused = await manager.pause(cancellation.id);
  results.cancellation = {
    taskId: cancellation.id,
    state: paused.state,
    reason: paused.blockedReason,
  };
  const resumed = await manager.resume(cancellation.id);
  results.resume = { taskId: resumed.id, state: resumed.state };
  await manager.pause(cancellation.id, true);
  results.capabilities = await manager.capabilities();
  results.passed = true;
} catch (e) {
  results.passed = false;
  results.error = (e as Error).message;
  process.exitCode = 1;
  process.stderr.write(results.error + "\n");
} finally {
  results.finishedAt = new Date().toISOString();
  await writeFile(join(root, "result.json"), JSON.stringify(results, null, 2));
  await manager.close();
  store.close();
  process.stdout.write(
    "Live evidence retained at " + join(root, "result.json") + "\n",
  );
}
