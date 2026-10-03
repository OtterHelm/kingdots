import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { CodexAdapter } from "../src/adapters/codex.js";

const adapter = () =>
  new CodexAdapter(process.execPath, [
    resolve("tests/fixtures/codex-wire.mjs"),
  ]);

test("concurrent metadata reads wait for one completed App Server initialization", async () => {
  const client = adapter();
  try {
    const records = await Promise.all([
      client.read("saved-fixture"),
      client.read("active-fixture"),
    ]);
    assert.deepEqual(
      records.map((record) => record.id),
      ["saved-fixture", "active-fixture"],
    );
  } finally {
    await client.close();
  }
});
test("stored Codex metadata does not establish live idle state or ownership", async () => {
  const client = adapter();
  try {
    const sessions = await client.list();
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].state, "unknown");
    assert.equal(sessions[0].owned, false);
    const stored = await client.read("saved-fixture");
    assert.equal(stored.state, "unknown");
    assert.equal(stored.owned, false);
    const active = await client.read("active-fixture");
    assert.equal(active.state, "running");
    assert.equal(active.owned, false);
  } finally {
    await client.close();
  }
});
test("read-only Codex client refuses a server approval request", async () => {
  const client = adapter();
  try {
    const record = await client.read("approval-fixture");
    assert.equal(record.title, "Permission refused");
  } finally {
    await client.close();
  }
});
test("metadata errors are correlated to the requested read without starting another session", async () => {
  const client = adapter();
  try {
    await assert.rejects(client.read("missing-fixture"), /not found/);
    assert.equal((await client.read("saved-fixture")).id, "saved-fixture");
  } finally {
    await client.close();
  }
});
