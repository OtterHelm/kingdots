import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.js";
import { Observer } from "../src/watch.js";
import {
  subscriptionAuthAllowed,
  type AppHostTransport,
  type HostSnapshot,
} from "../src/app-host.js";

async function setup() {
  const f = await fixture();
  let snapshot: HostSnapshot = {
    sessionId: "existing",
    project: f.project,
    state: "idle",
    signature: "same",
    summary: "Native idle state",
    turns: [],
    userMessage: { id: "initial", text: "Initial user request" },
  };
  let sends = 0,
    lose = false;
  const host: AppHostTransport = {
    callerThreadId: "real-caller",
    info: () => ({
      available: true,
      transport: "controlled-host",
      limitations: [],
    }),
    assertCanSend: async () => {},
    read: async () => structuredClone(snapshot),
    send: async (_sessionId, _prompt, canSend) => {
      if (!canSend()) return { accepted: false };
      sends++;
      if (lose) throw new Error("accepted but response lost");
      return { accepted: true, nativeId: "receipt" };
    },
    close: async () => {},
  };
  const observer = new Observer(f.store, f.manager.adapters, host);
  const input = {
    goal: "Manage one existing session",
    sessions: [
      {
        backend: "codex-app",
        sessionId: "existing",
        project: f.project,
        source: "app_host",
      },
    ],
    completionConditions: ["Reply checked"],
    allowedFollowUp: "Scoped follow-up only",
    authorization: {
      source: "direct_user_request",
      request: "Manage this existing session",
    },
  };
  const watch = observer.create(input);
  await observer.readHost(watch.id, "existing");
  const prepare = () => {
    const w = f.store.getWatch(watch.id);
    return observer.prepare({
      watchId: w.id,
      backend: "codex-app",
      sessionId: "existing",
      observationId: w.observations[0].observationId,
      epoch: w.epoch,
      commandId: "command",
      reason: "Dots follows the original scope",
      prompt: "Scoped repair",
    });
  };
  return {
    ...f,
    host,
    observer,
    watch,
    prepare,
    set: (next: Partial<HostSnapshot>) => {
      snapshot = { ...snapshot, ...next };
    },
    sends: () => sends,
    lose: () => {
      lose = true;
    },
    cleanup: async () => {
      await observer.close();
      await f.cleanup();
    },
  };
}

test("app-host sends once to the original idle session and retains verified receipts", async () => {
  const f = await setup();
  try {
    const c = f.prepare();
    assert.throws(
      () => f.observer.claim(f.watch.id, c.id, c.epoch),
      /watch_instruction_send/,
    );
    const sent = await f.observer.sendHost(f.watch.id, c.id, c.epoch);
    assert.equal(sent.status, "completed");
    assert.equal((sent.result as any).provenance, "app_host_verified");
    await f.observer.sendHost(f.watch.id, c.id, c.epoch);
    assert.equal(f.sends(), 1);
    assert.equal(f.store.tasks().length, 0);
  } finally {
    await f.cleanup();
  }
});

test("explicit reads of paused or released watches do not reactivate or change management records", async () => {
  for (const release of [false, true]) {
    const f = await setup();
    try {
      f.observer.pause(f.watch.id, release);
      const before = f.store.getWatch(f.watch.id);
      const eventsBefore = f.store.events().length;
      f.set({ state: "running", signature: "new-state" });
      const result = await f.observer.readHost(f.watch.id, "existing");
      assert.equal(result.snapshot.state, "running");
      assert.equal(
        "observationStored" in result && result.observationStored,
        false,
      );
      assert.deepEqual(f.store.getWatch(f.watch.id), before);
      assert.equal(f.store.events().length, eventsBefore);
      assert.equal(f.sends(), 0);
      assert.equal(f.store.tasks().length, 0);
      await assert.rejects(
        f.observer.readHost(f.watch.id, "another-session"),
        /not selected by the user/,
      );
    } finally {
      await f.cleanup();
    }
  }
});

test("pause during transport startup prevents native dispatch and releases proven-unsent work", async (t) => {
  const f = await setup();
  try {
    const c = f.prepare();
    t.mock.method(f.host, "send", async (_id, _prompt, canSend) => {
      f.observer.pause(f.watch.id);
      return { accepted: canSend() };
    });
    const result = await f.observer.sendHost(f.watch.id, c.id, c.epoch);
    assert.equal(result.status, "failed");
    assert.equal((result.result as any).delivery, "not_sent");
    assert.equal(f.sends(), 0);
    assert.equal(
      f.store.db.prepare("SELECT COUNT(*) AS n FROM leases").get()!.n,
      0,
    );
    assert.equal(f.store.getWatch(f.watch.id).automatic, false);
  } finally {
    await f.cleanup();
  }
});

test("closing waits for an in-flight receipt and prevents unsent work from dispatching", async (t) => {
  const f = await setup();
  try {
    const c = f.prepare();
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((r) => {
      entered = r;
    });
    const blocked = new Promise<void>((r) => {
      release = r;
    });
    t.mock.method(f.host, "send", async (_id, _prompt, canSend) => {
      entered();
      await blocked;
      return { accepted: canSend() };
    });
    const sending = f.observer.sendHost(f.watch.id, c.id, c.epoch);
    await started;
    let closed = false;
    const closing = f.observer.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    assert.equal(closed, false);
    release();
    assert.equal((await sending).status, "failed");
    await closing;
    assert.equal(closed, true);
  } finally {
    await f.cleanup();
  }
});
test("app-host subscription policy rejects API, unknown and custom-provider contexts", () => {
  assert.equal(
    subscriptionAuthAllowed({ auth_mode: "chatgpt" }, [
      'model_provider = "openai"',
    ]),
    true,
  );
  for (const auth of [
    { auth_mode: "apikey" },
    {},
    { auth_mode: "chatgpt", OPENAI_API_KEY: "present" },
  ])
    assert.equal(subscriptionAuthAllowed(auth, [""]), false);
  assert.equal(
    subscriptionAuthAllowed({ auth_mode: "chatgpt" }, [
      'model_provider = "custom"',
    ]),
    false,
  );
});
test("fresh running, permission and changed host states block a prepared send", async () => {
  for (const change of [
    { state: "running" as const },
    { state: "permission" as const },
    { signature: "changed" },
  ]) {
    const f = await setup();
    try {
      const c = f.prepare();
      f.set(change);
      const result = await f.observer.sendHost(f.watch.id, c.id, c.epoch);
      assert.equal(result.status, "failed");
      assert.equal((result.result as any).delivery, "not_sent");
      assert.equal(f.sends(), 0);
    } finally {
      await f.cleanup();
    }
  }
});
test("lost app receipt stays unknown and is not resent or released", async () => {
  const f = await setup();
  try {
    const c = f.prepare();
    f.lose();
    const result = await f.observer.sendHost(f.watch.id, c.id, c.epoch);
    assert.equal(result.status, "unknown");
    await f.observer.sendHost(f.watch.id, c.id, c.epoch);
    assert.equal(f.sends(), 1);
    assert.equal(
      f.store.db.prepare("SELECT COUNT(*) AS n FROM leases").get()!.n,
      1,
    );
    assert.throws(
      () =>
        f.observer.receipt(f.watch.id, c.id, "not_sent", [
          "Untrusted assertion",
        ]),
      /local transport/,
    );
  } finally {
    await f.cleanup();
  }
});
test("new external user input pauses management, while a verified own delegation does not", async () => {
  const f = await setup();
  try {
    const c = f.prepare();
    await f.observer.sendHost(f.watch.id, c.id, c.epoch);
    f.set({
      userMessage: {
        id: "own",
        text: "Scoped repair",
        delegatedFrom: "real-caller",
      },
    });
    await f.observer.readHost(f.watch.id, "existing");
    assert.equal(f.store.getWatch(f.watch.id).automatic, true);
    f.set({ userMessage: { id: "human", text: "Stop, I will handle this" } });
    await f.observer.readHost(f.watch.id, "existing");
    assert.equal(f.store.getWatch(f.watch.id).automatic, false);
    assert.equal(f.store.getWatch(f.watch.id).state, "paused");
  } finally {
    await f.cleanup();
  }
});
test("host observations cannot be supplied by an MCP caller, and pause during preflight fences sending", async (t) => {
  const f = await setup();
  try {
    assert.throws(
      () =>
        f.observer.observe({
          watchId: f.watch.id,
          backend: "codex-app",
          sessionId: "existing",
          observationId: "forged",
          state: "idle",
          summary: "Claim",
          evidence: ["Claim"],
        }),
      /enrolled observation transport/,
    );
    const c = f.prepare();
    t.mock.method(f.host, "read", async () => {
      f.observer.pause(f.watch.id);
      return {
        sessionId: "existing",
        project: f.project,
        state: "idle",
        signature: "same",
        summary: "Idle",
        turns: [],
      };
    });
    await assert.rejects(
      f.observer.sendHost(f.watch.id, c.id, c.epoch),
      /inactive or stale/,
    );
    assert.equal(f.sends(), 0);
  } finally {
    await f.cleanup();
  }
});
