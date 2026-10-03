import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Store } from "../src/store.js";
import { Observer } from "../src/watch.js";
import { Vault } from "../src/vault.js";
import {
  RelayConnector,
  migrateRelay,
  relayConfigSchema,
  type RelayJob,
  type RelayReview,
} from "../src/relay.js";

function fixture() {
  const store = new Store(":memory:");
  const observer = new Observer(store, new Map());
  const watch = observer.create({
    goal: "Observe existing work",
    sessions: [
      {
        backend: "codex-app",
        source: "app_host",
        sessionId: "fixture-session",
        project: resolve("fixture-project"),
      },
    ],
    completionConditions: ["Tests reviewed"],
    allowedFollowUp: "No actions",
    authorization: {
      source: "direct_user_request",
      request: "Observe this session",
    },
  });
  observer.pause(watch.id);
  store.put("settings", "relay_config", {
    origin: "https://relay.example",
    watchId: watch.id,
    sessionId: "fixture-session",
    enabled: true,
  });
  let reads = 0,
    results = 0,
    acknowledgments = 0,
    lose = false;
  let afterRead = () => {};
  let batch: any = { job: null, decisions: [] };
  const snapshots: any[] = [];
  const connector = new RelayConnector(
    store,
    { get: () => "fixture-secret" },
    {
      readHost: async () => {
        reads++;
        afterRead();
        return {
          watch: store.getWatch(watch.id),
          observationStored: false,
          snapshot: {
            sessionId: "fixture-session",
            project: resolve("fixture-project"),
            state: "running",
            signature: "fixture",
            summary: "Existing fixture-session " + resolve("fixture-project"),
            turns: [],
          },
        };
      },
    },
    async (input, init) => {
      assert.equal(init?.redirect, "error");
      const path = new URL(String(input)).pathname;
      if (path === "/device/jobs") return Response.json(batch);
      if (path === "/device/result") {
        results++;
        snapshots.push(JSON.parse(String(init?.body)));
        if (lose) throw new Error("Receipt lost");
      }
      if (path === "/device/decision-collected") acknowledgments++;
      return Response.json({ stored: true });
    },
  );
  const job = { id: "fixture-read-001", nonce: "fixture-nonce" };
  const decision = {
    inspectionId: job.id,
    nonce: job.nonce,
    decision: "continue_observation",
    reason: "Work matches the goal",
    source: "sites_authenticated_owner_not_independent_dot_identity_proof",
  };
  return {
    store,
    observer,
    connector,
    watch,
    job,
    decision,
    snapshots,
    setBatch: (next: any) => (batch = next),
    lose: () => (lose = true),
    counts: () => ({ reads, results, acknowledgments }),
    afterRead: (callback: () => void) => (afterRead = callback),
    close: async () => {
      await connector.close();
      await observer.close();
      store.close();
    },
  };
}

test("relay never reads until requested, stores correlated reviews once and preserves a paused watch", async () => {
  const f = fixture();
  try {
    const before = f.store.getWatch(f.watch.id);
    await f.connector.pollOnce();
    assert.equal(f.counts().reads, 0);
    f.setBatch({ job: f.job, decisions: [] });
    await f.connector.pollOnce();
    assert.equal(f.counts().reads, 1);
    assert.equal(f.snapshots[0].snapshot.observationStored, false);
    assert.ok(!f.snapshots[0].snapshot.records.includes("fixture-session"));
    assert.ok(
      !f.snapshots[0].snapshot.records.includes(
        JSON.stringify(resolve("fixture-project")).slice(1, -1),
      ),
    );
    f.setBatch({
      job: f.job,
      decisions: [{ id: f.job.id, body: JSON.stringify(f.decision) }],
    });
    await f.connector.pollOnce();
    await f.connector.pollOnce();
    assert.equal(f.counts().reads, 1);
    assert.equal(f.counts().results, 1);
    assert.equal(f.store.values<RelayReview>("relay_reviews").length, 1);
    assert.equal(
      f.store.values<RelayReview>("relay_reviews")[0].watchId,
      f.watch.id,
    );
    assert.equal(f.connector.status().reviewCount, 1);
    assert.deepEqual(f.store.getWatch(f.watch.id), before);
    assert.deepEqual(f.store.commands(), []);
  } finally {
    await f.close();
  }
});

test("lost result acknowledgment is journaled and never blindly resent", async () => {
  const f = fixture();
  try {
    f.lose();
    f.setBatch({ job: f.job, decisions: [] });
    await f.connector.pollOnce();
    await f.connector.pollOnce();
    assert.equal(f.counts().reads, 1);
    assert.equal(f.counts().results, 1);
    assert.equal(
      f.store.get<RelayJob>("relay_jobs", f.job.id)?.state,
      "delivery_unknown",
    );
    f.setBatch({
      job: null,
      decisions: [{ id: f.job.id, body: JSON.stringify(f.decision) }],
    });
    await assert.rejects(f.connector.pollOnce(), /correlated/);
    assert.equal(f.store.values("relay_reviews").length, 0);
  } finally {
    await f.close();
  }
});

test("unmatched nonce or changed review cannot overwrite retained evidence", async () => {
  const f = fixture();
  try {
    f.setBatch({ job: f.job, decisions: [] });
    await f.connector.pollOnce();
    f.setBatch({
      job: null,
      decisions: [
        {
          id: f.job.id,
          body: JSON.stringify({ ...f.decision, nonce: "wrong" }),
        },
      ],
    });
    await assert.rejects(f.connector.pollOnce(), /correlated/);
    f.setBatch({
      job: null,
      decisions: [{ id: f.job.id, body: JSON.stringify(f.decision) }],
    });
    await f.connector.pollOnce();
    f.setBatch({
      job: null,
      decisions: [
        {
          id: f.job.id,
          body: JSON.stringify({ ...f.decision, reason: "Changed" }),
        },
      ],
    });
    await assert.rejects(f.connector.pollOnce(), /conflicts/);
    assert.equal(
      f.store.values<RelayReview>("relay_reviews")[0].reason,
      f.decision.reason,
    );
  } finally {
    await f.close();
  }
});

test("release fences request-driven inspection, even if relay remains configured", async () => {
  const f = fixture();
  try {
    f.observer.pause(f.watch.id, true);
    f.setBatch({ job: f.job, decisions: [] });
    await assert.rejects(f.connector.pollOnce(), /no longer available/);
    assert.equal(f.counts().reads, 0);
  } finally {
    await f.close();
  }
});

test("ownership changes during a host read prevent its snapshot from leaving the PC", async () => {
  const f = fixture();
  try {
    f.afterRead(() => f.observer.pause(f.watch.id, true));
    f.setBatch({ job: f.job, decisions: [] });
    await f.connector.pollOnce();
    assert.equal(f.snapshots[0].error, true);
    assert.equal(f.snapshots[0].snapshot, undefined);
    assert.equal(
      f.store.get<RelayJob>("relay_jobs", f.job.id)?.state,
      "host_unknown",
    );
  } finally {
    await f.close();
  }
});

test("relay origin rejects paths, embedded credentials, HTTP and fragments", () => {
  for (const origin of [
    "http://relay.example",
    "https://user:secret@relay.example",
    "https://relay.example/mcp",
    "https://relay.example/#secret",
    "https://relay.example/?token=x",
  ])
    assert.throws(() =>
      relayConfigSchema.parse({
        origin,
        watchId: "watch",
        sessionId: "session",
      }),
    );
  assert.equal(
    relayConfigSchema.parse({
      origin: "https://relay.example",
      watchId: "watch",
      sessionId: "session",
    }).enabled,
    false,
  );
});

test("legacy journal import is idempotent history, preserves source files and never enables a watch or connection", async () => {
  const root = await mkdtemp(join(tmpdir(), "kingdots-relay-"));
  const oldPath = join(root, "sites-probe-records.sqlite");
  const legacy = new DatabaseSync(oldPath);
  const decision = {
    inspectionId: "legacy-read-001",
    nonce: "nonce",
    decision: "continue_observation",
    reason: "Prior evidence",
    source: "sites_authenticated_owner_not_independent_dot_identity_proof",
  };
  legacy.exec(
    "CREATE TABLE jobs(id TEXT,nonce TEXT,state TEXT,result TEXT,created_at TEXT); CREATE TABLE reviews(id TEXT,body TEXT,received_at TEXT)",
  );
  legacy
    .prepare("INSERT INTO jobs VALUES (?,?,?,?,?)")
    .run(
      decision.inspectionId,
      "nonce",
      "delivered",
      null,
      "2026-10-03T00:00:00Z",
    );
  legacy
    .prepare("INSERT INTO reviews VALUES (?,?,?)")
    .run(
      decision.inspectionId,
      JSON.stringify(decision),
      "2026-10-03T00:00:01Z",
    );
  legacy.close();
  const store = new Store(join(root, "kingdots.sqlite"));
  try {
    const vault = await Vault.open(join(root, "secrets.bin"));
    await migrateRelay(root, store, vault);
    await migrateRelay(root, store, vault);
    assert.equal(store.values("relay_reviews").length, 1);
    assert.equal(store.values<RelayReview>("relay_reviews")[0].watchId, null);
    assert.equal(store.get("settings", "relay_config"), null);
    const preserved = new DatabaseSync(oldPath, { readOnly: true });
    assert.equal(
      preserved.prepare("SELECT count(*) n FROM reviews").get()?.n,
      1,
    );
    preserved.close();
  } finally {
    store.close();
    if (!resolve(root).startsWith(resolve(tmpdir(), "kingdots-relay-")))
      throw new Error("Unsafe fixture cleanup");
    await rm(root, { recursive: true, force: true });
  }
});
