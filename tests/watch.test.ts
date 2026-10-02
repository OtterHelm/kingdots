import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Webhook } from "standardwebhooks";
import { Observer, type Watch } from "../src/watch.js";
import { fixture } from "./helpers.js";
import { git } from "../src/workspace.js";
import { Events } from "../src/events.js";
import { buildServer } from "../src/server.js";

async function setup() {
  const f = await fixture();
  const observer = new Observer(f.store, f.manager.adapters);
  const input = {
    goal: "Observe the user's already-running session overnight",
    sessions: [
      {
        backend: "codex-cli",
        sessionId: "existing-session",
        project: f.project,
        source: "dots_host",
      },
    ],
    completionConditions: ["Tests pass"],
    allowedFollowUp:
      "Answer scoped questions; no new session, permission change or deploy",
    authorization: {
      source: "direct_user_request",
      request: "Supervise this existing session while I sleep",
    },
  };
  return {
    ...f,
    observer,
    input,
    async cleanup() {
      await observer.close();
      await f.cleanup();
    },
  };
}
function observe(
  f: Awaited<ReturnType<typeof setup>>,
  watch: Watch,
  state = "question",
  id = randomUUID(),
) {
  return f.observer.observe({
    watchId: watch.id,
    backend: "codex-cli",
    sessionId: "existing-session",
    observationId: id,
    state,
    summary:
      state === "question"
        ? "Worker asks how to run the existing tests"
        : "Host session status",
    evidence: ["Official host read result (controlled fixture)"],
  });
}
function instruction(watch: Watch, commandId = randomUUID()) {
  return {
    watchId: watch.id,
    backend: "codex-cli",
    sessionId: "existing-session",
    epoch: watch.epoch,
    observationId: watch.observations[0].observationId,
    commandId,
    reason: "Dots answers within the original goal",
    prompt:
      "Run the existing tests and report their evidence; remain in this session",
  };
}

test("enrollment, metadata polls and management stop never create, resume or interrupt the original session", async (t) => {
  const f = await setup();
  for (const method of [
    "create",
    "send",
    "steer",
    "resume",
    "interrupt",
  ] as const)
    t.mock.method(f.adapter, method, async () => {
      throw new Error("Observer must not call " + method);
    });
  try {
    f.adapter.sessions.set("existing-session", {
      id: "existing-session",
      backend: "codex-cli",
      state: "running",
      owned: false,
      project: f.project,
      title: "Existing work",
    });
    const watch = f.observer.create({
      ...f.input,
      sessions: [{ ...f.input.sessions[0], source: "adapter" }],
    });
    const polled = await f.observer.poll(watch.id);
    assert.equal(polled.observations[0].state, "unknown");
    assert.equal(polled.lastHealthyAt, null);
    f.observer.pause(watch.id, true);
    assert.equal(f.adapter.sessions.get("existing-session")!.state, "running");
    assert.equal(f.adapter.sends, 0);
    assert.equal(f.store.tasks().length, 0);
    assert.equal(
      (await git(f.project, ["branch", "--format=%(refname:short)"])).trim(),
      "main",
    );
    assert.equal(
      (await git(f.project, ["worktree", "list", "--porcelain"])).match(
        /^worktree /gm,
      )?.length,
      1,
    );
  } finally {
    await f.cleanup();
  }
});

test("watch attention subscriptions retain signed event delivery without declaring actual Dots wake-up", async () => {
  const f = await setup();
  try {
    const watch = f.observer.create(f.input),
      secret = "whsec_" + randomBytes(32).toString("base64");
    const keys = new Map<string, string>(),
      delivered: any[] = [];
    const events = new Events(
      f.store,
      {
        get: (key) => keys.get(key),
        set: async (key, value) => {
          keys.set(key, value);
        },
      },
      async (_url, body, headers) => {
        new Webhook(secret).verify(body, headers);
        const value = JSON.parse(body);
        if (value.type === "verification")
          return {
            status: 200,
            body: JSON.stringify({ challenge: value.challenge }),
          };
        delivered.push(value);
        return { status: 202, body: "{}" };
      },
    );
    await events.subscribe({
      name: "task.attention_required",
      arguments: { taskId: watch.id },
      delivery: {
        mode: "webhook",
        url: "https://callback.example/events",
        secret,
      },
    });
    observe(f, watch, "question");
    await events.flush();
    const count = delivered.length;
    await events.flush();
    assert.ok(count > 0);
    assert.equal(delivered.length, count);
    assert.ok(delivered.every((value) => value.data.taskId === watch.id));
    assert.equal(
      f.store.get<any>("settings", "dots_connection")!.unattendedAcceptance,
      "unverified",
    );
  } finally {
    await f.cleanup();
  }
});
test("healthy observations stay quiet, questions request Dots once, and old observation replays cannot replace fresh state", async () => {
  const f = await setup();
  try {
    const w = f.observer.create(f.input);
    const initial = f.store.events().length;
    observe(f, w, "running");
    observe(f, w, "running");
    assert.equal(f.store.events().length, initial);
    const oldId = randomUUID();
    observe(f, w, "question", oldId);
    const count = f.store.events().length;
    const fresh = observe(f, w, "question");
    assert.equal(f.store.events().length, count);
    const replay = observe(f, w, "question", oldId);
    assert.equal(
      replay.observations[0].observationId,
      fresh.observations[0].observationId,
    );
    assert.throws(() => observe(f, w, "idle", oldId), /different contents/);
    assert.equal(replay.state, "awaiting_decision");
  } finally {
    await f.cleanup();
  }
});
test("follow-ups are journaled for Dots host delivery exactly once and unknown sends remain locked", async () => {
  const f = await setup();
  try {
    const w = observe(f, f.observer.create(f.input));
    const input = instruction(w);
    const command = f.observer.prepare(input);
    assert.equal((command.result as any).delivery, "not_sent");
    assert.deepEqual(f.observer.prepare(input), command);
    f.observer.claim(w.id, command.id, w.epoch);
    assert.throws(
      () => f.observer.claim(w.id, command.id, w.epoch),
      /not available/,
    );
    f.observer.receipt(w.id, command.id, "unknown", [
      "Host response lost after send",
    ]);
    assert.throws(() => f.observer.prepare(instruction(w)), /outstanding/);
    f.observer.pause(w.id);
    assert.throws(() => f.observer.resume(w.id), /Reconcile/);
    f.observer.receipt(
      w.id,
      command.id,
      "accepted",
      ["Official host message ID found"],
      "host-message",
    );
    const resumed = f.observer.resume(w.id);
    assert.equal(resumed.observations.length, 0);
    assert.equal(f.adapter.sends, 0);
    assert.equal(f.adapter.interrupts, 0);
  } finally {
    await f.cleanup();
  }
});
test("active, permission, stale and user-intervened sessions fence Dots follow-ups", async () => {
  const f = await setup();
  try {
    const original = f.observer.create(f.input);
    for (const state of ["running", "permission", "unknown"]) {
      const w = observe(f, original, state);
      assert.throws(
        () => f.observer.prepare(instruction(w)),
        /interrupt active work/,
      );
    }
    let w = observe(f, original, "idle");
    w.observations[0].receivedAt = new Date(
      Date.now() - w.staleAfterMs - 1000,
    ).toISOString();
    f.store.saveWatch(w);
    assert.throws(
      () => f.observer.prepare(instruction(w)),
      /Read the existing session again/,
    );
    w = observe(f, original, "question");
    const command = f.observer.prepare(instruction(w));
    const paused = observe(f, original, "user_intervened");
    assert.equal(paused.automatic, false);
    assert.equal(f.store.command(command.id)!.status, "failed");
    assert.throws(
      () => f.observer.claim(w.id, command.id, w.epoch),
      /inactive or stale/,
    );
  } finally {
    await f.cleanup();
  }
});
test("different watches cannot hold write reservations for the same existing session", async () => {
  const f = await setup();
  try {
    const first = observe(f, f.observer.create(f.input));
    const second = observe(f, f.observer.create(f.input));
    f.observer.prepare(instruction(first));
    assert.throws(
      () => f.observer.prepare(instruction(second)),
      /already has a writer/,
    );
    f.observer.pause(first.id);
    assert.equal(f.observer.prepare(instruction(second)).status, "queued");
  } finally {
    await f.cleanup();
  }
});
test("restart cancels proven-unsent instructions and fences uncertain host delivery without resuming workers", async () => {
  const f = await setup();
  let restarted: Observer | undefined;
  try {
    const first = observe(f, f.observer.create(f.input));
    const queued = f.observer.prepare(instruction(first));
    let second = f.observer.create({
      ...f.input,
      sessions: [{ ...f.input.sessions[0], sessionId: "other-existing" }],
    });
    second = f.observer.observe({
      watchId: second.id,
      backend: "codex-cli",
      sessionId: "other-existing",
      observationId: randomUUID(),
      state: "question",
      summary: "Question",
      evidence: ["Official host read (fixture)"],
    });
    const inFlight = f.observer.prepare({
      ...instruction(second),
      sessionId: "other-existing",
    });
    f.observer.claim(second.id, inFlight.id, second.epoch);
    await f.observer.close();
    restarted = new Observer(f.store, f.manager.adapters);
    assert.equal(f.store.command(queued.id)!.status, "failed");
    assert.equal(f.store.command(inFlight.id)!.status, "unknown");
    assert.throws(() => restarted!.resume(second.id), /Reconcile/);
    assert.ok(f.store.watches().every((w) => !w.automatic));
    assert.equal(f.adapter.sends, 0);
  } finally {
    await restarted?.close();
    await f.cleanup();
  }
});
test("Dots completion requires each initial condition, fresh idle observations and retained evidence", async () => {
  const f = await setup();
  try {
    let w = observe(f, f.observer.create(f.input), "idle");
    const evidence = [
      {
        condition: "Tests pass",
        reference: "Official test exit code and log (fixture)",
        passed: true as const,
      },
    ];
    assert.throws(
      () =>
        f.observer.finish(
          w.id,
          w.epoch,
          "done",
          [w.observations[0].observationId],
          [],
        ),
      /completion evidence/,
    );
    assert.throws(
      () =>
        f.observer.finish(
          w.id,
          w.epoch,
          "done",
          [w.observations[0].observationId],
          [{ ...evidence[0], condition: "Not the original condition" }],
        ),
      /completion evidence/,
    );
    const stale = w.observations[0].observationId;
    w = observe(f, w, "idle");
    assert.throws(
      () => f.observer.finish(w.id, w.epoch, "done", [stale], evidence),
      /completion evidence/,
    );
    const result = f.observer.finish(
      w.id,
      w.epoch,
      "Dots reviewed actual host test evidence",
      [w.observations[0].observationId],
      evidence,
    );
    assert.equal(result.watch.state, "completed");
    assert.equal(result.verification, "dots_host_reported");
    assert.equal(f.store.getWatch(w.id).completionEvidence.length, 1);
    assert.equal(result.unattendedAcceptance, "unverified");
  } finally {
    await f.cleanup();
  }
});
test("public API and MCP enroll existing sessions while rejecting legacy worker creation and MCP resume", async () => {
  const f = await setup();
  const app = buildServer(
    f.manager,
    new Events(f.store, { get: () => undefined, set: async () => {} }),
    { ui: "ui", mcp: "mcp" },
    { observer: f.observer },
  );
  try {
    const legacy = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { authorization: "Bearer ui" },
      payload: f.input,
    });
    assert.equal(legacy.statusCode, 410);
    const enrolled = await app.inject({
      method: "POST",
      url: "/api/watches",
      headers: { authorization: "Bearer ui" },
      payload: f.input,
    });
    assert.equal(enrolled.statusCode, 200);
    const listed = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { authorization: "Bearer mcp" },
      payload: { id: 1, method: "tools/list" },
    });
    const names = listed.json().result.tools.map((t: any) => t.name);
    assert.equal(names.length, 16);
    assert.ok(names.includes("watch_observe"));
    assert.ok(
      !names.some((n: string) =>
        /task_create|resume|approve|session_send/.test(n),
      ),
    );
    const resume = await app.inject({
      method: "POST",
      url: "/api/watches/" + enrolled.json().id + "/resume",
      headers: { authorization: "Bearer mcp" },
      payload: {},
    });
    assert.equal(resume.statusCode, 401);
    const controls = (action: string) =>
      app.inject({
        method: "POST",
        url: "/api/watches/" + enrolled.json().id + "/" + action,
        headers: { authorization: "Bearer ui" },
        payload: {},
      });
    assert.equal((await controls("pause")).json().state, "paused");
    assert.equal((await controls("resume")).json().state, "awaiting_decision");
    assert.equal((await controls("release")).json().state, "released");
    assert.equal(f.adapter.sends, 0);
  } finally {
    await app.close();
    await f.cleanup();
  }
});
