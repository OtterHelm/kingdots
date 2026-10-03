import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, repaired } from "./helpers.js";
import { Events } from "../src/events.js";
import { buildServer } from "../src/server.js";
import type { RelayReview } from "../src/relay.js";

test("historical execution capabilities cannot promote removed adapter control", async () => {
  const f = await fixture();
  try {
    f.store.put("settings", "capability:codex-cli:steer", {
      feature: "steer",
      version: "fixture",
      state: "supported",
      evidence: "Old worker execution",
    });
    const info = (await f.manager.capabilities())[0];
    assert.equal(
      info.capabilities.find((capability) => capability.feature === "steer")
        ?.state,
      "unsupported",
    );
    assert.equal(
      f.store.get<any>("settings", "capability:codex-cli:steer")?.evidence,
      "Old worker execution",
    );
  } finally {
    await f.cleanup();
  }
});

test("returned reviews require the UI token and removed gateway routes cannot grant access", async () => {
  const f = await fixture();
  const app = buildServer(
    f.manager,
    new Events(f.store, { get: () => undefined, set: async () => {} }),
    { ui: "ui", mcp: "mcp" },
  );
  try {
    f.store.put("relay_reviews", "fixture-review", {
      inspectionId: "fixture-review",
      nonce: "nonce",
      decision: "continue_observation",
      reason: "History",
      source: "sites_authenticated_owner_not_independent_dot_identity_proof",
      watchId: null,
      sessionId: null,
      epoch: null,
      receivedAt: "2026-10-03T00:00:00Z",
      legacy: true,
    } satisfies RelayReview);
    assert.equal(
      (
        await app.inject({
          url: "/api/relay/reviews",
          headers: { authorization: "Bearer mcp" },
        })
      ).statusCode,
      401,
    );
    const response = await app.inject({
      url: "/api/relay/reviews",
      headers: { authorization: "Bearer ui" },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json()[0].legacy, true);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/gateway/configure",
          headers: { authorization: "Bearer ui" },
          payload: { origin: "https://example.invalid" },
        })
      ).statusCode,
      404,
    );
    const status = (
      await app.inject({
        url: "/api/status",
        headers: { authorization: "Bearer ui" },
      })
    ).json();
    assert.equal(status.gateway, undefined);
    assert.equal(status.relay.enabled, false);
  } finally {
    await app.close();
    await f.cleanup();
  }
});

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
    for (const host of [
      "[::2]:7435",
      "[::ffff:8.8.8.8]:7435",
      "[:::garbage]:7435",
      "localhost:invalid",
      "localhost:65536",
      "localhost:0",
      "localhost:7435@attacker.example",
    ]) {
      assert.equal(
        (
          await app.inject({
            url: "/api/tasks",
            headers: { host, authorization: "Bearer ui-secret" },
          })
        ).statusCode,
        403,
        host,
      );
    }
    for (const host of ["127.0.0.1:7435", "localhost:7435", "[::1]:7435"]) {
      assert.equal(
        (
          await app.inject({
            url: "/api/tasks",
            headers: { host, authorization: "Bearer ui-secret" },
          })
        ).statusCode,
        200,
        host,
      );
      assert.equal(
        (await app.inject({ url: "/api/tasks", headers: { host } })).statusCode,
        401,
        host,
      );
    }
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
    assert.ok(listed.result.tools.some((t: any) => t.name === "watch_finish"));
    assert.ok(
      !listed.result.tools.some(
        (t: any) => t.name === "task_create" || t.name === "session_send",
      ),
    );
    assert.ok(
      !listed.result.tools.some((t: any) => /approve|resume/.test(t.name)),
    );
    assert.equal((await rpc("events/list")).result.events.length, 2);
    const call = await rpc("tools/call", { name: "watch_list", arguments: {} });
    assert.equal(call.result.isError, false);
    assert.equal((await rpc("not-supported")).error.code, -32601);
  } finally {
    await app.close();
    await f.cleanup();
  }
});
test("legacy evidence remains readable while public worker creation is disabled", async () => {
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
    assert.equal(invalid.statusCode, 410);
    assert.equal(invalid.json().code, "new_session_disabled");
  } finally {
    await app.close();
    await f.cleanup();
  }
});
