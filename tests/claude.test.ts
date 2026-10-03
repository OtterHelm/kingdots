import { test } from "node:test";
import assert from "node:assert/strict";
import { ClaudeAdapter } from "../src/adapters/claude.js";
import type {
  listSessions,
  getSessionInfo,
} from "@anthropic-ai/claude-agent-sdk";

test("Claude metadata retains target/directory and cannot infer external idle ownership", async () => {
  const requests: unknown[] = [];
  const record = {
    sessionId: "existing-fixture",
    cwd: "fixture-project",
    summary: "Stored session",
    customTitle: "Original title",
  };
  const adapter = new ClaudeAdapter({
    listSessions: (async (input) => {
      requests.push(input);
      return [record];
    }) as typeof listSessions,
    getSessionInfo: (async (id) => {
      requests.push(id);
      return record;
    }) as typeof getSessionInfo,
  });
  const listed = await adapter.list("fixture-project");
  assert.deepEqual(requests[0], { dir: "fixture-project", limit: 100 });
  assert.equal(listed[0].state, "unknown");
  assert.equal(listed[0].owned, false);
  assert.equal(
    (await adapter.read("existing-fixture")).title,
    "Original title",
  );
  assert.equal(requests[1], "existing-fixture");
});
test("missing Claude metadata is not replaced by a new conversation", async () => {
  let calls = 0;
  const adapter = new ClaudeAdapter({
    listSessions: (async () => []) as typeof listSessions,
    getSessionInfo: (async () => {
      calls++;
      return undefined;
    }) as typeof getSessionInfo,
  });
  await assert.rejects(adapter.read("missing-fixture"), /not found/);
  assert.equal(calls, 1);
});
