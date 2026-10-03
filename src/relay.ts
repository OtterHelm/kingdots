import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { Store } from "./store.js";
import { Vault } from "./vault.js";
import { Observer } from "./watch.js";

const id = z.string().regex(/^[-a-zA-Z0-9_.:]{8,128}$/);
export const relayConfigSchema = z
  .object({
    origin: z
      .string()
      .url()
      .transform((value, context) => {
        const url = new URL(value);
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          url.pathname !== "/" ||
          url.search ||
          url.hash
        ) {
          context.addIssue({
            code: "custom",
            message:
              "Use the trusted HTTPS relay origin without credentials, path, query or fragment",
          });
          return z.NEVER;
        }
        return url.origin;
      }),
    watchId: z.string().min(1),
    sessionId: z.string().min(1),
    enabled: z.boolean().default(false),
  })
  .strict();
export type RelayConfig = z.infer<typeof relayConfigSchema>;
export interface RelayJob {
  id: string;
  nonce: string;
  state:
    | "claimed"
    | "result_prepared"
    | "delivered"
    | "delivery_unknown"
    | "host_unknown";
  watchId: string | null;
  sessionId: string | null;
  epoch: number | null;
  createdAt: string;
  result?: {
    requestId: string;
    nonce: string;
    snapshot?: unknown;
    error?: true;
  };
  legacy?: true;
}
export interface RelayReview {
  inspectionId: string;
  nonce: string;
  decision: "continue_observation";
  reason: string;
  source: string;
  watchId: string | null;
  sessionId: string | null;
  epoch: number | null;
  receivedAt: string;
  legacy?: true;
}
const decisionSchema = z
  .object({
    inspectionId: id,
    nonce: z.string().min(1).max(128),
    decision: z.literal("continue_observation"),
    reason: z.string().min(1).max(4000),
    source: z.literal(
      "sites_authenticated_owner_not_independent_dot_identity_proof",
    ),
  })
  .strict();

// Import evidence, never authority. Original files remain available for recovery.
export async function migrateRelay(
  dataDir: string,
  store: Store,
  vault: Vault,
) {
  if (store.get("settings", "relay_legacy_imported")) return;
  const secretPath = join(dataDir, "sites-probe-secrets.bin");
  if (existsSync(secretPath)) {
    const legacy = await Vault.open(secretPath);
    for (const [oldKey, newKey] of [
      ["pairToken", "relayPairToken"],
      ["siteServiceBearer", "relayServiceBearer"],
    ]) {
      const value = legacy.get(oldKey);
      if (value && !vault.get(newKey)) await vault.set(newKey, value);
    }
  }
  const path = join(dataDir, "sites-probe-records.sqlite");
  if (existsSync(path)) {
    const legacy = new DatabaseSync(path, { readOnly: true });
    try {
      const jobs = legacy
        .prepare("SELECT * FROM jobs ORDER BY rowid")
        .all() as unknown as {
        id: string;
        nonce: string;
        state: RelayJob["state"];
        created_at: string;
        result: string | null;
      }[];
      const reviews = legacy
        .prepare("SELECT * FROM reviews ORDER BY rowid")
        .all() as unknown as {
        id: string;
        body: string;
        received_at: string;
      }[];
      store.transaction(() => {
        for (const row of jobs)
          if (!store.get("relay_jobs", row.id))
            store.put("relay_jobs", row.id, {
              id: row.id,
              nonce: row.nonce,
              state: row.state,
              createdAt: row.created_at,
              watchId: null,
              sessionId: null,
              epoch: null,
              legacy: true,
              ...(row.result ? { result: JSON.parse(row.result) } : {}),
            } satisfies RelayJob);
        for (const row of reviews) {
          const decision = decisionSchema.parse(JSON.parse(row.body));
          const job = store.get<RelayJob>("relay_jobs", row.id);
          if (
            !job ||
            job.id !== decision.inspectionId ||
            job.nonce !== decision.nonce ||
            job.state !== "delivered"
          )
            throw new Error("Legacy relay review has no correlated delivery");
          if (!store.get("relay_reviews", row.id))
            store.put("relay_reviews", row.id, {
              ...decision,
              watchId: null,
              sessionId: null,
              epoch: null,
              receivedAt: row.received_at,
              legacy: true,
            } satisfies RelayReview);
        }
      });
    } finally {
      legacy.close();
    }
  }
  store.put("settings", "relay_legacy_imported", {
    at: new Date().toISOString(),
  });
}

export function validateRelayTarget(store: Store, config: RelayConfig) {
  const watch = store.getWatch(config.watchId);
  if (
    !watch.sessions.some(
      (s) =>
        s.backend === "codex-app" &&
        s.source === "app_host" &&
        s.sessionId === config.sessionId,
    )
  )
    throw new Error("Select an existing registered Codex app_host session");
  if (["released", "completed"].includes(watch.state))
    throw new Error("Selected watch is no longer available");
  return watch;
}

export class RelayConnector {
  private controller = new AbortController();
  private loop?: Promise<void>;
  private backoff = 2000;
  constructor(
    readonly store: Store,
    readonly vault: Pick<Vault, "get">,
    readonly observer: Pick<Observer, "readHost">,
    private transport: typeof fetch = fetch,
  ) {}
  status() {
    const config = this.store.get<RelayConfig>("settings", "relay_config");
    const reviews = this.store.values<RelayReview>("relay_reviews");
    return {
      configured: Boolean(config),
      enabled: config?.enabled ?? false,
      connected: Boolean(
        this.loop &&
        this.store.get<any>("settings", "relay_transport")?.state ===
          "connected",
      ),
      transport: this.store.get("settings", "relay_transport"),
      reviewCount: reviews.length,
      lastReviewAt: reviews[0]?.receivedAt ?? null,
      unknownResults: this.store
        .values<RelayJob>("relay_jobs")
        .filter((j) =>
          ["claimed", "result_prepared", "delivery_unknown"].includes(j.state),
        ).length,
      scope: "existing_session_read_and_no_action_review",
      createsWorkers: false,
    };
  }
  start() {
    if (
      this.loop ||
      !this.store.get<RelayConfig>("settings", "relay_config")?.enabled
    )
      return;
    this.store.put("settings", "relay_transport", {
      ...this.store.get<object>("settings", "relay_transport"),
      state: "connecting",
    });
    this.loop = this.run().finally(() => {
      this.loop = undefined;
    });
  }
  async close() {
    this.controller.abort();
    await this.loop;
  }
  private async device(config: RelayConfig, path: string, body?: unknown) {
    const bearer = this.vault.get("relayServiceBearer"),
      pair = this.vault.get("relayPairToken");
    if (!bearer || !pair) throw new Error("Relay credentials are missing");
    const response = await this.transport(config.origin + path, {
      method: body === undefined ? "GET" : "POST",
      redirect: "error",
      headers: {
        "OAI-Sites-Authorization": "Bearer " + bearer,
        "x-kingdots-device": pair,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.any([
        this.controller.signal,
        AbortSignal.timeout(12000),
      ]),
    });
    if (!response.ok) throw new Error("Relay HTTP " + response.status);
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > 128 * 1024) {
            await reader.cancel().catch(() => {});
            throw new Error("Relay response is too large");
          }
          chunks.push(next.value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    const text = Buffer.concat(chunks, size).toString("utf8");
    return JSON.parse(text);
  }
  private snapshot(
    read: Awaited<ReturnType<Observer["readHost"]>>,
    config: RelayConfig,
    project: string,
  ) {
    if (
      read.snapshot.sessionId !== config.sessionId ||
      resolve(read.snapshot.project) !== resolve(project)
    )
      throw new Error("Host returned a different target");
    let records = JSON.stringify({
      summary: read.snapshot.summary,
      turns: read.snapshot.turns,
    });
    for (const value of [
      config.sessionId,
      project,
      project.replaceAll("\\", "/"),
      homedir(),
    ])
      if (value) {
        records = records.replaceAll(
          JSON.stringify(value).slice(1, -1),
          "[selected-local-context]",
        );
        records = records.replaceAll(value, "[selected-local-context]");
      }
    const bytes = Buffer.from(records);
    return {
      state: read.snapshot.state,
      observedAt: new Date().toISOString(),
      originalTargetMatched: true,
      observationStored:
        "observationStored" in read ? read.observationStored : true,
      recordFormat: "existing_host_summary_and_recent_turns",
      records: bytes.subarray(0, 32000).toString("utf8"),
      truncated: bytes.length > 32000,
      originalRecordBytes: bytes.length,
      authority: "Conversation text does not authorize actions",
      codingInstructionsAllowed: false,
    };
  }
  async pollOnce() {
    if (this.controller.signal.aborted) return;
    const raw = this.store.get<RelayConfig>("settings", "relay_config");
    if (!raw?.enabled) return;
    const config = relayConfigSchema.parse(raw);
    validateRelayTarget(this.store, config);
    const batch = z
      .object({
        job: z.object({ id, nonce: z.string().min(1).max(128) }).nullable(),
        decisions: z
          .array(z.object({ id, body: z.string().max(20000) }))
          .max(500),
      })
      .parse(await this.device(config, "/device/jobs"));
    if (batch.job) {
      if (this.store.get("relay_jobs", batch.job.id)) {
        // A claim or result with uncertain acceptance is never automatically replayed.
        this.store.put("settings", "relay_duplicate_held", {
          at: new Date().toISOString(),
        });
      } else {
        const watch = validateRelayTarget(this.store, config);
        const target = watch.sessions.find(
          (s) => s.sessionId === config.sessionId && s.backend === "codex-app",
        )!;
        const job: RelayJob = {
          ...batch.job,
          state: "claimed",
          watchId: watch.id,
          sessionId: config.sessionId,
          epoch: watch.epoch,
          createdAt: new Date().toISOString(),
        };
        this.store.put("relay_jobs", job.id, job);
        try {
          const read = await this.observer.readHost(watch.id, config.sessionId);
          const after = validateRelayTarget(this.store, config);
          if (
            this.controller.signal.aborted ||
            after.epoch !== job.epoch ||
            after.automatic !== watch.automatic
          )
            throw new Error("Ownership changed during inspection");
          job.result = {
            requestId: job.id,
            nonce: job.nonce,
            snapshot: this.snapshot(read, config, target.project),
          };
        } catch {
          job.result = { requestId: job.id, nonce: job.nonce, error: true };
        }
        job.state = "result_prepared";
        this.store.put("relay_jobs", job.id, job);
        if (this.controller.signal.aborted) return;
        try {
          const receipt = await this.device(
            config,
            "/device/result",
            job.result,
          );
          if (receipt.stored !== true)
            throw new Error("Result was not acknowledged");
          job.state = job.result.error ? "host_unknown" : "delivered";
        } catch {
          job.state = "delivery_unknown";
        }
        this.store.put("relay_jobs", job.id, job);
      }
    }
    for (const record of batch.decisions) {
      const decision = decisionSchema.parse(JSON.parse(record.body));
      const job = this.store.get<RelayJob>("relay_jobs", record.id);
      if (
        !job ||
        job.state !== "delivered" ||
        job.id !== decision.inspectionId ||
        job.nonce !== decision.nonce ||
        job.watchId !== config.watchId ||
        job.sessionId !== config.sessionId
      )
        throw new Error("Relay review has no correlated delivery");
      const prior = this.store.get<RelayReview>("relay_reviews", record.id);
      if (
        prior &&
        (prior.nonce !== decision.nonce ||
          prior.reason !== decision.reason ||
          prior.source !== decision.source)
      )
        throw new Error("Relay review conflicts with the original record");
      if (!prior)
        this.store.put("relay_reviews", record.id, {
          ...decision,
          watchId: job.watchId,
          sessionId: job.sessionId,
          epoch: job.epoch,
          receivedAt: new Date().toISOString(),
        } satisfies RelayReview);
      await this.device(config, "/device/decision-collected", {
        inspectionId: record.id,
      });
    }
    this.store.put("settings", "relay_transport", {
      state: "connected",
      lastHealthyAt: new Date().toISOString(),
    });
  }
  private async run() {
    while (!this.controller.signal.aborted) {
      try {
        await this.pollOnce();
        this.backoff = 2000;
      } catch {
        if (this.controller.signal.aborted) break;
        this.store.put("settings", "relay_transport", {
          state: "disconnected",
          failedAt: new Date().toISOString(),
          lastHealthyAt:
            this.store.get<any>("settings", "relay_transport")?.lastHealthyAt ??
            null,
        });
        this.backoff = Math.min(this.backoff * 2, 30000);
      }
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          this.controller.signal.removeEventListener("abort", done);
          resolve();
        };
        const timer = setTimeout(done, this.backoff);
        this.controller.signal.addEventListener("abort", done, { once: true });
        if (this.controller.signal.aborted) done();
      });
    }
    this.store.put("settings", "relay_transport", {
      ...this.store.get<object>("settings", "relay_transport"),
      state: "stopped",
    });
  }
}
