import { randomUUID, createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import ipaddr from "ipaddr.js";
import { Webhook } from "standardwebhooks";
import { z } from "zod";
import { Store } from "./store.js";
import { DomainError, type EventRecord } from "./domain.js";
import type { SecretStore } from "./vault.js";

const subscribeSchema = z.object({
  name: z.enum(["task.attention_required", "task.completed"]),
  arguments: z.object({ taskId: z.string().min(1) }),
  delivery: z.object({
    mode: z.literal("webhook"),
    url: z.string().url(),
    secret: z.string().regex(/^whsec_[A-Za-z0-9+/]+={0,2}$/),
  }),
  ttlMs: z.number().positive().nullable().optional(),
  cursor: z.string().nullable().optional(),
});
export interface Subscription {
  id: string;
  name: string;
  taskId: string;
  owner: string;
  url: string;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
}
interface Delivery {
  attempts: number;
  nextAt: number;
  status: "pending" | "accepted" | "failed";
  lastStatus: number | null;
}
export function publicAddress(address: string) {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
export async function webhookPost(
  urlText: string,
  body: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: string }> {
  const url = new URL(urlText);
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw new DomainError(
      "unsafe_callback",
      "Callback must be an HTTPS URL without embedded credentials",
    );
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new DomainError(
      "unsafe_callback",
      "Callback resolves to a non-public address",
    );
  const target = addresses[0];
  return new Promise((accept, reject) => {
    const req = request(
      url,
      {
        method: "POST",
        headers: {
          ...headers,
          "content-length": String(Buffer.byteLength(body)),
        },
        lookup: ((_host: any, _options: any, callback: any) =>
          callback(null, target.address, target.family)) as any,
        timeout: 10_000,
      },
      (response) => {
        let text = "";
        response.on("data", (chunk) => {
          text += chunk.toString();
          if (text.length > 64 * 1024)
            req.destroy(new Error("Callback response too large"));
        });
        response.on("end", () =>
          accept({ status: response.statusCode ?? 0, body: text }),
        );
      },
    );
    req.once("timeout", () => req.destroy(new Error("Callback timeout")));
    req.once("error", reject);
    req.end(body);
  });
}
export class Events {
  private timer: NodeJS.Timeout | null = null;
  private delivering = false;
  constructor(
    private store: Store,
    private vault: SecretStore,
    private post = webhookPost,
  ) {}
  definitions() {
    return {
      events: ["task.attention_required", "task.completed"].map((name) => ({
        name,
        description:
          name === "task.completed"
            ? "A completion report was recorded. Read the watch and referenced host evidence; host reports are not independently verified by this service."
            : "An enrolled existing session needs Dots to inspect a question, stopped response, error, or stale/unknown connection.",
        delivery: ["webhook"],
        inputSchema: {
          type: "object",
          properties: { taskId: { type: "string" } },
          required: ["taskId"],
          additionalProperties: false,
        },
        payloadSchema: {
          type: "object",
          properties: {
            taskId: { type: "string" },
            revision: { type: "integer" },
            cause: { type: "string" },
          },
          required: ["taskId", "revision", "cause"],
          additionalProperties: false,
        },
      })),
    };
  }
  async subscribe(raw: unknown, owner = "dots") {
    const input = subscribeSchema.parse(raw);
    try {
      this.store.getWatch(input.arguments.taskId);
    } catch (e) {
      if ((e as DomainError).code !== "not_found") throw e;
      this.store.getTask(input.arguments.taskId);
    }
    const cursor =
      input.cursor === null || input.cursor === undefined
        ? 0
        : Number(input.cursor);
    if (!Number.isSafeInteger(cursor) || cursor < 0)
      throw new DomainError("invalid_cursor", "Invalid event cursor", 400);
    const key = Buffer.from(input.delivery.secret.slice(6), "base64");
    if (key.length < 24 || key.length > 64)
      throw new DomainError(
        "invalid_secret",
        "Webhook signing key must contain 24–64 bytes",
        400,
      );
    const id = createHash("sha256")
      .update(
        JSON.stringify([
          owner,
          input.delivery.url,
          input.name,
          input.arguments.taskId,
        ]),
      )
      .digest("hex");
    const challenge = randomUUID();
    const body = JSON.stringify({ type: "verification", challenge });
    const eventId = "verification_" + randomUUID();
    const signed = new Date();
    const response = await this.post(
      input.delivery.url,
      body,
      this.headers(input.delivery.secret, eventId, signed, body, id),
    );
    if (
      response.status < 200 ||
      response.status >= 300 ||
      JSON.parse(response.body).challenge !== challenge
    )
      throw new DomainError(
        "callback_verification_failed",
        "Callback challenge verification failed",
        400,
      );
    await this.vault.set("subscription:" + id, input.delivery.secret);
    const expiresAt =
      input.ttlMs === null
        ? null
        : new Date(
            Date.now() +
              Math.min(
                input.ttlMs ?? 24 * 60 * 60 * 1_000,
                7 * 24 * 60 * 60 * 1_000,
              ),
          ).toISOString();
    const subscription: Subscription = {
      id,
      name: input.name,
      taskId: input.arguments.taskId,
      owner,
      url: input.delivery.url,
      expiresAt,
      active: true,
      createdAt: new Date().toISOString(),
    };
    this.store.put("subscriptions", id, subscription);
    this.store.put("settings", "dots_connection", {
      lastWebhookAcceptedAt: null,
      lastDotsDecisionAt: null,
      ...this.store.get<any>("settings", "dots_connection"),
      subscriptionVerifiedAt: new Date().toISOString(),
      unattendedAcceptance: "unverified",
    });
    // A cursor is the last event already processed by the subscriber, never the end of a queued outbox.
    for (const event of this.store.events(cursor))
      if (
        event.taskId === subscription.taskId &&
        event.name === subscription.name
      )
        this.enqueue(subscription, event);
    return {
      id,
      refreshBefore: expiresAt,
      cursor: input.cursor ?? null,
      truncated: false,
    };
  }
  unsubscribe(raw: any, owner = "dots") {
    for (const subscription of this.store.values<Subscription>("subscriptions"))
      if (
        subscription.owner === owner &&
        subscription.name === raw.name &&
        subscription.taskId === raw.arguments?.taskId &&
        subscription.url === raw.delivery?.url
      ) {
        subscription.active = false;
        this.store.put("subscriptions", subscription.id, subscription);
      }
    return {};
  }
  private headers(
    secret: string,
    eventId: string,
    signed: Date,
    body: string,
    subscriptionId: string,
  ) {
    return {
      "content-type": "application/json",
      "webhook-id": eventId,
      "webhook-timestamp": String(Math.floor(signed.getTime() / 1000)),
      "webhook-signature": new Webhook(secret).sign(eventId, signed, body),
      "X-MCP-Subscription-Id": subscriptionId,
    };
  }
  private enqueue(subscription: Subscription, event: EventRecord) {
    this.store.db
      .prepare("INSERT OR IGNORE INTO deliveries VALUES (?,?,?)")
      .run(
        subscription.id,
        event.id,
        JSON.stringify({
          attempts: 0,
          nextAt: 0,
          status: "pending",
          lastStatus: null,
        } satisfies Delivery),
      );
  }
  start() {
    if (!this.timer) {
      this.timer = setInterval(() => {
        void this.flush().catch(() => {});
      }, 1_000);
      this.timer.unref();
    }
  }
  async flush() {
    if (this.delivering) return;
    this.delivering = true;
    try {
      const subscriptions = this.store
        .values<Subscription>("subscriptions")
        .filter(
          (s) =>
            s.active && (!s.expiresAt || Date.parse(s.expiresAt) > Date.now()),
        );
      for (const subscription of subscriptions) {
        // Durable event-to-outbox cursor; events and deliveries survive process restarts.
        const cursor =
          this.store.get<number>("settings", "outbox:" + subscription.id) ?? 0;
        const events = this.store.events(cursor);
        for (const event of events) {
          if (
            event.taskId === subscription.taskId &&
            event.name === subscription.name
          )
            this.enqueue(subscription, event);
        }
        if (events.length)
          this.store.put(
            "settings",
            "outbox:" + subscription.id,
            events.at(-1)!.cursor,
          );
        const rows = this.store.db
          .prepare(
            "SELECT d.event_id,d.body,e.body as event FROM deliveries d JOIN events e ON e.id=d.event_id WHERE subscription_id=?",
          )
          .all(subscription.id) as {
          event_id: string;
          body: string;
          event: string;
        }[];
        for (const row of rows) {
          const delivery = JSON.parse(row.body) as Delivery;
          if (delivery.status !== "pending" || delivery.nextAt > Date.now())
            continue;
          const event = JSON.parse(row.event) as EventRecord;
          const secret = this.vault.get("subscription:" + subscription.id);
          if (!secret) continue;
          if (
            !this.store.get<Subscription>("subscriptions", subscription.id)
              ?.active
          )
            break;
          const body = JSON.stringify({
            eventId: event.id,
            name: event.name,
            timestamp: event.timestamp,
            data: {
              taskId: event.taskId,
              revision: event.revision,
              cause: event.cause,
            },
            cursor: String(event.cursor),
          });
          if (Buffer.byteLength(body) > 262144) {
            delivery.status = "failed";
          } else {
            delivery.attempts++;
            try {
              const result = await this.post(
                subscription.url,
                body,
                this.headers(
                  secret,
                  event.id,
                  new Date(),
                  body,
                  subscription.id,
                ),
              );
              delivery.lastStatus = result.status;
              if (result.status >= 200 && result.status < 300) {
                delivery.status = "accepted";
                const connection =
                  this.store.get<any>("settings", "dots_connection") ?? {};
                connection.lastWebhookAcceptedAt = new Date().toISOString();
                this.store.put("settings", "dots_connection", connection);
              } else if (
                result.status === 410 ||
                result.status === 413 ||
                (result.status >= 400 &&
                  result.status < 500 &&
                  result.status !== 408 &&
                  result.status !== 429)
              ) {
                delivery.status = "failed";
                if (result.status === 410) {
                  subscription.active = false;
                  this.store.put(
                    "subscriptions",
                    subscription.id,
                    subscription,
                  );
                }
              }
            } catch {
              delivery.lastStatus = null;
            }
            if (delivery.status === "pending") {
              if (delivery.attempts >= 5) delivery.status = "failed";
              else delivery.nextAt = Date.now() + 1000 * 2 ** delivery.attempts;
            }
          }
          this.store.db
            .prepare(
              "UPDATE deliveries SET body=? WHERE subscription_id=? AND event_id=?",
            )
            .run(JSON.stringify(delivery), subscription.id, event.id);
        }
      }
    } finally {
      this.delivering = false;
    }
  }
  acknowledge(eventId: string, decision: string) {
    const row = this.store.db
      .prepare("SELECT body FROM events WHERE id=?")
      .get(eventId) as { body: string } | undefined;
    if (!row) throw new DomainError("not_found", "Event not found", 404);
    const event = JSON.parse(row.body) as EventRecord;
    const task = this.store.getTask(event.taskId);
    task.lastDecisionAt = new Date().toISOString();
    this.store.saveTask(task);
    const connection = this.store.get<any>("settings", "dots_connection") ?? {};
    connection.lastDotsDecisionAt = task.lastDecisionAt;
    this.store.put("settings", "dots_connection", connection);
    this.store.put("settings", "decision:" + eventId, {
      decision,
      at: task.lastDecisionAt,
    });
    return {
      acknowledged: true,
      taskId: task.id,
      unattendedAcceptance: "unverified",
      note: "An MCP decision acknowledgment does not prove that the original response ended or that the final report reached the user.",
    };
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
