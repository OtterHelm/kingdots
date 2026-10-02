import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { fixture } from "./helpers.js";
import { Events } from "../src/events.js";
import { buildServer } from "../src/server.js";
test("official MCP SDK client initializes, lists tools, and calls the HTTP endpoint", async () => {
  const f = await fixture();
  const app = buildServer(
    f.manager,
    new Events(f.store, { get: () => undefined, set: async () => {} }),
    { ui: "ui", mcp: "mcp" },
  );
  const url = await app.listen({ host: "127.0.0.1", port: 0 });
  const client = new Client({ name: "kingdots-test", version: "1.0.0" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url + "/mcp"), {
        requestInit: { headers: { authorization: "Bearer mcp" } },
      }),
    );
    const listed = await client.listTools();
    assert.ok(listed.tools.some((t) => t.name === "task_create"));
    const result = await client.callTool({ name: "task_list", arguments: {} });
    assert.equal(result.isError, false);
    assert.deepEqual(JSON.parse((result.content as any)[0].text), []);
  } finally {
    await client.close();
    await app.close();
    await f.cleanup();
  }
});
