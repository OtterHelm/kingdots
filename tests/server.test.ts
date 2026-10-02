import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, repaired } from "./helpers.js";
import { Events } from "../src/events.js";
import { buildServer } from "../src/server.js";

test("UI and MCP credentials have separate roles; host and origin checks prevent browser cross-site commands", async () => {
  const f = await fixture();
  const app = buildServer(
    f.manager,
    new Events(f.store, { get: () => undefined, set: async () => {} }),
    { ui: "ui-secret", mcp: "mcp-secret" },
  );
  try {
    assert.equal((await app.inject({ url: "/api/tasks" })).statusCode, 401);
    assert.equal(
      (
        await app.inject({
          url: "/api/tasks",
          headers: { authorization: "Bearer mcp-secret" },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/tasks",
          headers: {
            authorization: "Bearer ui-secret",
            origin: "https://evil.example",
          },
          payload: {},
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          url: "/healthz",
          headers: { host: "attacker.example" },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          url: "/api/tasks",
          headers: { authorization: "Bearer ui-secret" },
        })
      ).statusCode,
      200,
    );
  } finally {
    await app.close();
    await f.cleanup();
  }
});
test("MCP publishes tools and protocol-specific event capabilities with no user approval tool", async () => {
  const f = await fixture();
  const app = buildServer(
    f.manager,
    new Events(f.store, { get: () => undefined, set: async () => {} }),
    { ui: "ui", mcp: "mcp" },
  );
  try {
    const rpc = async (method: string, params?: unknown) =>
      (
        await app.inject({
          method: "POST",
          url: "/mcp",
          headers: { authorization: "Bearer mcp" },
          payload: { jsonrpc: "2.0", id: 1, method, params },
        })
      ).json();
    const discovery = await rpc("server/discover");
    assert.deepEqual(discovery.result.supportedVersions, ["2026-07-28"]);
    assert.ok(discovery.result.capabilities.events);
    const listed = await rpc("tools/list");
    assert.ok(listed.result.tools.some((t: any) => t.name === "task_complete"));
    assert.ok(
      !listed.result.tools.some((t: any) => /approve|resume/.test(t.name)),
    );
    assert.equal((await rpc("events/list")).result.events.length, 2);
    const call = await rpc("tools/call", { name: "task_list", arguments: {} });
    assert.equal(call.result.isError, false);
    assert.equal((await rpc("not-supported")).error.code, -32601);
  } finally {
    await app.close();
    await f.cleanup();
  }
});
test("task details flag stale evidence; invalid task creation is rejected with a structured error", async () => {
  const f = await fixture();
  const app = buildServer(
    f.manager,
    new Events(f.store, { get: () => undefined, set: async () => {} }),
    { ui: "ui", mcp: "mcp" },
  );
  try {
    const task = await repaired(f);
    const response = await app.inject({
      url: "/api/tasks/" + task.id,
      headers: { authorization: "Bearer ui" },
    });
    assert.equal(response.json().evidenceValid, true);
    const invalid = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { authorization: "Bearer ui" },
      payload: { goal: "Missing other fields" },
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().code, "invalid_input");
  } finally {
    await app.close();
    await f.cleanup();
  }
});
