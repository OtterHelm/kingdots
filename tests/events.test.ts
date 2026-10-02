import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Webhook } from "standardwebhooks";
import { fixture, repaired } from "./helpers.js";
import { Events, publicAddress, webhookPost } from "../src/events.js";

test("callback validation rejects private, local, mapped and reserved addresses", async () => {
  for (const address of [
    "127.0.0.1",
    "10.2.3.4",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "224.0.0.1",
    "0.0.0.0",
  ])
    assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress("8.8.8.8"), true);
  await assert.rejects(webhookPost("http://example.com", "{}", {}), /HTTPS/);
  await assert.rejects(
    webhookPost("https://127.0.0.1", "{}", {}),
    /non-public/,
  );
});
test("subscriptions verify signed callbacks and deduplicate webhook delivery without claiming Dots acceptance", async () => {
  const f = await fixture();
  try {
    const task = await repaired(f);
    const secrets = new Map<string, string>();
    const secret = "whsec_" + randomBytes(32).toString("base64");
    let posts = 0;
    const received: string[] = [];
    const events = new Events(
      f.store,
      {
        get: (key) => secrets.get(key),
        set: async (k, v) => {
          secrets.set(k, v);
        },
      },
      async (_url, body, headers) => {
        new Webhook(secret).verify(body, headers);
        const value = JSON.parse(body);
        posts++;
        if (value.type === "verification")
          return {
            status: 200,
            body: JSON.stringify({ challenge: value.challenge }),
          };
        received.push(value.eventId);
        return { status: 202, body: "{}" };
      },
    );
    const input = {
      name: "task.attention_required",
      arguments: { taskId: task.id },
      delivery: {
        mode: "webhook",
        url: "https://callback.example/events",
        secret,
      },
    };
    const first = await events.subscribe(input);
    const second = await events.subscribe(input);
    assert.equal(first.id, second.id);
    assert.equal(f.store.values("subscriptions").length, 1);
    await events.flush();
    const count = posts;
    await events.flush();
    assert.equal(posts, count);
    assert.equal(new Set(received).size, received.length);
    assert.ok(received.length > 0);
    assert.equal(
      f.store.get<any>("settings", "dots_connection")!.unattendedAcceptance,
      "unverified",
    );
    assert.equal(
      events.acknowledge(received[0], "Observed verification failure")
        .unattendedAcceptance,
      "unverified",
    );
    events.unsubscribe({
      ...input,
      delivery: { mode: "webhook", url: input.delivery.url },
    });
    assert.equal(f.store.values<any>("subscriptions")[0].active, false);
  } finally {
    await f.cleanup();
  }
});
test("transient delivery failure retains the event ID and signs a fresh retry; 410 deactivates subscriptions", async () => {
  const f = await fixture();
  try {
    const task = await repaired(f);
    const secrets = new Map<string, string>();
    const secret = "whsec_" + randomBytes(32).toString("base64");
    let attempt = 0;
    const ids: string[] = [];
    const events = new Events(
      f.store,
      {
        get: (k) => secrets.get(k),
        set: async (k, v) => {
          secrets.set(k, v);
        },
      },
      async (_url, body) => {
        const event = JSON.parse(body);
        if (event.type === "verification")
          return {
            status: 200,
            body: JSON.stringify({ challenge: event.challenge }),
          };
        ids.push(event.eventId);
        attempt++;
        return { status: attempt === 1 ? 503 : 410, body: "{}" };
      },
    );
    const sub = await events.subscribe({
      name: "task.attention_required",
      arguments: { taskId: task.id },
      delivery: { mode: "webhook", url: "https://callback.example", secret },
    });
    await events.flush();
    const rows = f.store.db
      .prepare("SELECT event_id,body FROM deliveries")
      .all() as { event_id: string; body: string }[];
    for (const r of rows) {
      const state = JSON.parse(r.body);
      state.nextAt = 0;
      f.store.db
        .prepare("UPDATE deliveries SET body=? WHERE event_id=?")
        .run(JSON.stringify(state), r.event_id);
    }
    await events.flush();
    assert.equal(ids[0], ids[1]);
    assert.equal(f.store.get<any>("subscriptions", sub.id)!.active, false);
  } finally {
    await f.cleanup();
  }
});
