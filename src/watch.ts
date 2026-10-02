import { z } from "zod";
import { randomUUID, createHash } from "node:crypto";
import {
  backendIds,
  commandSchema,
  DomainError,
  type Command,
} from "./domain.js";
import type { Adapter } from "./adapters/types.js";
import { Store } from "./store.js";

export const watchSchema = z.object({
  goal: z.string().min(1),
  sessions: z
    .array(
      z.object({
        backend: z.enum(backendIds),
        sessionId: z.string().min(1),
        project: z.string().min(1),
        source: z.enum(["adapter", "dots_host"]).default("dots_host"),
      }),
    )
    .min(1),
  completionConditions: z.array(z.string().min(1)).min(1),
  allowedFollowUp: z.string().min(1),
  pollIntervalMs: z.number().int().min(1000).default(30_000),
  staleAfterMs: z.number().int().min(1000).default(300_000),
  authorization: z.object({
    source: z.literal("direct_user_request"),
    request: z.string().min(1),
  }),
});
export const observationSchema = z.object({
  watchId: z.string(),
  backend: z.enum(backendIds),
  sessionId: z.string(),
  observationId: z.string().min(1),
  state: z.enum([
    "running",
    "idle",
    "question",
    "permission",
    "failed",
    "unknown",
    "user_intervened",
  ]),
  summary: z.string().max(20_000),
  evidence: z.array(z.string().min(1).max(4000)).min(1),
});
export interface Observation extends z.infer<typeof observationSchema> {
  receivedAt: string;
  provenance: "dots_host_reported" | "adapter_metadata";
}
export const completionEvidenceSchema = z
  .array(
    z.object({
      condition: z.string().min(1),
      reference: z.string().min(1),
      passed: z.literal(true),
    }),
  )
  .min(1);
export interface Watch extends z.infer<typeof watchSchema> {
  id: string;
  epoch: number;
  revision: number;
  state:
    | "watching"
    | "awaiting_decision"
    | "awaiting_input"
    | "paused"
    | "released"
    | "completed";
  automatic: boolean;
  createdAt: string;
  updatedAt: string;
  observations: Observation[];
  blockedReason: string | null;
  lastPollAt: string | null;
  lastHealthyAt: string | null;
  attentionKey: string | null;
  finalReport: string | null;
  completionEvidence: z.infer<typeof completionEvidenceSchema>;
}
export const instructionSchema = commandSchema.extend({
  watchId: z.string(),
  backend: z.enum(backendIds),
  sessionId: z.string(),
  observationId: z.string(),
  prompt: z.string().min(1),
});

/** Records existing sessions and Dots decisions. It never creates/resumes a worker. */
export class Observer {
  private timer: NodeJS.Timeout;
  private polling = new Set<string>();
  private closed = false;
  constructor(
    readonly store: Store,
    private adapters: Map<string, Adapter>,
  ) {
    for (const watch of store.watches()) {
      if (!watch.automatic) continue;
      watch.epoch++;
      watch.automatic = false;
      watch.state = "paused";
      watch.blockedReason =
        "Service restarted: refresh existing-session state and explicitly resume Dots management.";
      this.save(watch, "restart_reconciliation_required");
      this.fenceCommands(watch);
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, 1000);
    this.timer.unref();
  }
  private save(
    watch: Watch,
    cause?: string,
    receipt?: { key: string; hash: string },
  ) {
    watch.revision++;
    watch.updatedAt = new Date().toISOString();
    this.store.transaction(() => {
      this.store.saveWatch(watch);
      if (receipt) this.store.put("settings", receipt.key, receipt.hash);
      if (cause) this.store.event(watch, cause);
    });
  }
  create(raw: unknown) {
    const input = watchSchema.parse(raw);
    const keys = input.sessions.map((s) => s.backend + ":" + s.sessionId);
    if (new Set(keys).size !== keys.length)
      throw new DomainError(
        "duplicate_session",
        "Register each existing session once",
        400,
      );
    if (input.staleAfterMs < input.pollIntervalMs)
      throw new DomainError(
        "invalid_interval",
        "Staleness must not be shorter than the polling interval",
        400,
      );
    const now = new Date().toISOString();
    const watch: Watch = {
      ...input,
      id: randomUUID(),
      epoch: 0,
      revision: 0,
      state: "awaiting_decision",
      automatic: true,
      createdAt: now,
      updatedAt: now,
      observations: [],
      blockedReason: "Dots must inspect the selected existing sessions.",
      lastPollAt: null,
      lastHealthyAt: null,
      attentionKey: "initial",
      finalReport: null,
      completionEvidence: [],
    };
    this.save(watch, "existing_sessions_registered");
    return watch;
  }
  private target(watch: Watch, backend: string, sessionId: string) {
    const target = watch.sessions.find(
      (s) => s.backend === backend && s.sessionId === sessionId,
    );
    if (!target)
      throw new DomainError(
        "session_not_enrolled",
        "This session was not selected by the user",
        403,
      );
    return target;
  }
  observe(
    raw: unknown,
    provenance: Observation["provenance"] = "dots_host_reported",
  ) {
    const input = observationSchema.parse(raw);
    const watch = this.store.getWatch(input.watchId);
    if (!watch.automatic)
      throw new DomainError(
        "write_fenced",
        "Observation management is paused or released",
      );
    const target = this.target(watch, input.backend, input.sessionId);
    if (
      (target.source === "dots_host") !==
      (provenance === "dots_host_reported")
    )
      throw new DomainError(
        "observation_source",
        "Use the enrolled observation transport",
      );
    const receipt = {
      key:
        "observation:" +
        watch.id +
        ":" +
        createHash("sha256").update(input.observationId).digest("hex"),
      hash: createHash("sha256").update(JSON.stringify(input)).digest("hex"),
    };
    const previous = this.store.get<string>("settings", receipt.key);
    if (previous) {
      if (previous !== receipt.hash)
        throw new DomainError(
          "idempotency_conflict",
          "Observation ID was reused with different contents",
        );
      return watch;
    }
    const observation: Observation = {
      ...input,
      receivedAt: new Date().toISOString(),
      provenance,
    };
    watch.observations = watch.observations.filter(
      (o) => o.backend !== input.backend || o.sessionId !== input.sessionId,
    );
    watch.observations.push(observation);
    if (input.state !== "unknown") watch.lastHealthyAt = observation.receivedAt;
    if (input.state === "user_intervened") {
      watch.automatic = false;
      watch.epoch++;
      watch.state = "paused";
      watch.blockedReason =
        "User intervention: Dots must yield until the user explicitly resumes.";
      this.fenceCommands(watch);
      this.save(watch, "user_intervened", receipt);
    } else this.classify(watch, receipt);
    return watch;
  }
  private classify(watch: Watch, receipt?: { key: string; hash: string }) {
    const issues = watch.sessions.flatMap((s) => {
      const o = watch.observations.find(
        (o) => o.backend === s.backend && o.sessionId === s.sessionId,
      );
      if (!o) return [s.sessionId + ":missing"];
      if (Date.now() - Date.parse(o.receivedAt) >= watch.staleAfterMs)
        return [s.sessionId + ":stale"];
      return o.state === "running"
        ? []
        : [s.sessionId + ":" + o.state + ":" + o.summary];
    });
    const key = issues.length
      ? createHash("sha256").update(JSON.stringify(issues)).digest("hex")
      : null;
    const changed = watch.attentionKey !== key;
    watch.attentionKey = key;
    watch.state = watch.observations.some((o) => o.state === "permission")
      ? "awaiting_input"
      : key
        ? "awaiting_decision"
        : "watching";
    watch.blockedReason = key
      ? "Dots must review existing-session state; idle is not proof of completion."
      : null;
    this.save(
      watch,
      changed && key ? "existing_session_needs_decision" : undefined,
      receipt,
    );
  }
  async poll(id: string) {
    if (this.polling.has(id)) return this.store.getWatch(id);
    this.polling.add(id);
    try {
      let watch = this.store.getWatch(id);
      if (!watch.automatic) return watch;
      const epoch = watch.epoch;
      for (const target of watch.sessions.filter(
        (s) => s.source === "adapter",
      )) {
        let state: Observation["state"] = "unknown",
          summary = "";
        try {
          const adapter = this.adapters.get(target.backend);
          if (!adapter) throw new Error("Provider read connection unavailable");
          const session = await adapter.read(target.sessionId);
          state = session.owned
            ? session.state === "waiting"
              ? "question"
              : session.state
            : "unknown";
          summary = session.owned
            ? session.title
            : "Stored history does not establish the live state or ownership of an external process.";
        } catch (e) {
          summary = "Read connection failed: " + (e as Error).message;
        }
        watch = this.store.getWatch(id);
        if (!watch.automatic || watch.epoch !== epoch || this.closed)
          return watch;
        this.observe(
          {
            watchId: id,
            ...target,
            observationId: randomUUID(),
            state,
            summary,
            evidence: [
              "Provider metadata read; no worker creation, resume or instruction",
            ],
          },
          "adapter_metadata",
        );
      }
      watch = this.store.getWatch(id);
      if (watch.automatic && watch.epoch === epoch && !this.closed) {
        watch.lastPollAt = new Date().toISOString();
        this.classify(watch);
      }
      return watch;
    } finally {
      this.polling.delete(id);
    }
  }
  private async tick() {
    if (this.closed) return;
    await Promise.allSettled(
      this.store
        .watches()
        .filter(
          (w) =>
            w.automatic &&
            (!w.lastPollAt ||
              Date.now() - Date.parse(w.lastPollAt) >= w.pollIntervalMs),
        )
        .map((w) => this.poll(w.id)),
    );
  }
  private writable(watch: Watch, epoch: number) {
    if (!watch.automatic || watch.epoch !== epoch)
      throw new DomainError(
        "write_fenced",
        "Dots management is inactive or stale",
      );
  }
  private actionable(
    watch: Watch,
    backend: string,
    sessionId: string,
    observationId: string,
  ) {
    this.target(watch, backend, sessionId);
    const o = watch.observations.find(
      (o) => o.backend === backend && o.sessionId === sessionId,
    );
    if (
      !o ||
      o.observationId !== observationId ||
      Date.now() - Date.parse(o.receivedAt) >= watch.staleAfterMs
    )
      throw new DomainError(
        "stale_observation",
        "Read the existing session again before a follow-up",
      );
    if (o.provenance !== "dots_host_reported")
      throw new DomainError(
        "control_unverified",
        "Metadata reads do not grant control of an external session",
      );
    if (!["idle", "question", "failed"].includes(o.state))
      throw new DomainError(
        "session_not_actionable",
        "Do not interrupt active work, answer permission prompts, or write into unknown state",
      );
  }
  prepare(raw: unknown) {
    const input = instructionSchema.parse(raw);
    const hash = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    const existing = this.store.command(input.commandId);
    if (existing) {
      if (existing.inputHash !== hash)
        throw new DomainError(
          "idempotency_conflict",
          "Command ID was reused with different input",
        );
      return existing;
    }
    const watch = this.store.getWatch(input.watchId);
    this.writable(watch, input.epoch);
    this.actionable(watch, input.backend, input.sessionId, input.observationId);
    if (
      this.store
        .commands(watch.id)
        .some(
          (c) =>
            ["queued", "dispatching", "unknown"].includes(c.status) &&
            (c.result as any)?.sessionId === input.sessionId &&
            (c.result as any)?.backend === input.backend,
        )
    )
      throw new DomainError(
        "session_owned",
        "Reconcile the outstanding instruction before preparing another",
      );
    const now = new Date().toISOString();
    const command: Command = {
      id: input.commandId,
      taskId: watch.id,
      action: "existing_session_follow_up",
      reason: input.reason,
      prompt: input.prompt,
      inputHash: hash,
      epoch: input.epoch,
      status: "queued",
      nativeId: null,
      result: {
        backend: input.backend,
        sessionId: input.sessionId,
        observationId: input.observationId,
        delivery: "not_sent",
        controlConnection: "dots_host_required",
      },
      createdAt: now,
      updatedAt: now,
    };
    this.store.transaction(() => {
      this.store.acquire(
        input.backend + ":" + input.sessionId,
        command.id,
        watch.epoch,
      );
      this.store.saveCommand(command);
    });
    return command;
  }
  claim(watchId: string, commandId: string, epoch: number) {
    const watch = this.store.getWatch(watchId);
    this.writable(watch, epoch);
    const command = this.command(watchId, commandId);
    if (command.status !== "queued" || command.epoch !== epoch)
      throw new DomainError(
        "delivery_uncertain",
        "This instruction is not available for a new send; inspect its existing receipt",
      );
    const result = command.result as any;
    this.actionable(
      watch,
      result.backend,
      result.sessionId,
      result.observationId,
    );
    command.status = "dispatching";
    command.updatedAt = new Date().toISOString();
    command.result = {
      ...result,
      delivery: "host_send_required",
      note: "Dots must use a verified official host tool on this exact existing session. No host transport is supplied by this receipt.",
    };
    this.store.saveCommand(command);
    return command;
  }
  receipt(
    watchId: string,
    commandId: string,
    outcome: "accepted" | "not_sent" | "unknown",
    evidence: string[],
    nativeId?: string,
  ) {
    const command = this.command(watchId, commandId);
    if (command.status !== "dispatching" && command.status !== "unknown")
      throw new DomainError(
        "receipt_conflict",
        "Only an in-flight or uncertain send can be reconciled",
      );
    if (!evidence.length)
      throw new DomainError(
        "evidence_missing",
        "Retain the official host result or reconciliation evidence",
      );
    command.status =
      outcome === "unknown"
        ? "unknown"
        : outcome === "accepted"
          ? "completed"
          : "failed";
    command.result = {
      ...(command.result as any),
      delivery: outcome,
      evidence,
      provenance: "dots_host_reported",
    };
    command.nativeId = nativeId ?? null;
    command.updatedAt = new Date().toISOString();
    this.store.transaction(() => {
      this.store.saveCommand(command);
      if (outcome !== "unknown") this.store.release(command.id);
    });
    return command;
  }
  private command(watchId: string, commandId: string) {
    const command = this.store.command(commandId);
    if (
      !command ||
      command.taskId !== watchId ||
      command.action !== "existing_session_follow_up"
    )
      throw new DomainError("not_found", "Watch instruction not found", 404);
    return command;
  }
  private fenceCommands(watch: Watch) {
    for (const command of this.store.commands(watch.id)) {
      if (command.status === "queued") {
        command.status = "failed";
        command.result = {
          ...(command.result as any),
          delivery: "not_sent",
          reason: "Management stopped before host send",
        };
        this.store.release(command.id);
      } else if (command.status === "dispatching") {
        command.status = "unknown";
        command.result = { ...(command.result as any), delivery: "unknown" };
      } else continue;
      command.updatedAt = new Date().toISOString();
      this.store.saveCommand(command);
    }
  }
  pause(id: string, release = false) {
    const watch = this.store.getWatch(id);
    if (watch.state === "completed") return watch;
    if (!watch.automatic && watch.state === (release ? "released" : "paused"))
      return watch;
    watch.automatic = false;
    watch.epoch++;
    watch.state = release ? "released" : "paused";
    watch.blockedReason =
      "Dots management stopped. The user's original session is left running.";
    this.fenceCommands(watch);
    this.save(watch, release ? "management_released" : "management_paused");
    return watch;
  }
  resume(id: string) {
    const watch = this.store.getWatch(id);
    if (!["paused", "released"].includes(watch.state))
      throw new DomainError("not_paused", "Watch is not paused");
    if (this.store.commands(id).some((c) => c.status === "unknown"))
      throw new DomainError(
        "delivery_uncertain",
        "Reconcile unknown host delivery before resuming",
      );
    watch.epoch++;
    watch.automatic = true;
    watch.observations = [];
    watch.state = "awaiting_decision";
    watch.blockedReason = "Dots must refresh the same existing sessions.";
    watch.attentionKey = "resumed";
    this.save(watch, "management_resumed");
    return watch;
  }
  finish(
    id: string,
    epoch: number,
    report: string,
    observations: string[],
    evidence: z.infer<typeof completionEvidenceSchema>,
  ) {
    const watch = this.store.getWatch(id);
    this.writable(watch, epoch);
    if (
      !report.trim() ||
      !evidence.length ||
      watch.completionConditions.some(
        (condition) =>
          !evidence.some(
            (e) =>
              e.condition === condition &&
              e.passed === true &&
              e.reference.trim(),
          ),
      ) ||
      watch.observations.length !== watch.sessions.length ||
      watch.observations.some(
        (o) =>
          !observations.includes(o.observationId) ||
          !["idle"].includes(o.state) ||
          Date.now() - Date.parse(o.receivedAt) >= watch.staleAfterMs,
      ) ||
      this.store
        .commands(id)
        .some((c) => ["queued", "dispatching", "unknown"].includes(c.status))
    )
      throw new DomainError(
        "evidence_missing",
        "Dots must inspect fresh idle sessions, completion evidence and all outstanding deliveries before its final report",
      );
    watch.automatic = false;
    watch.state = "completed";
    watch.finalReport = report;
    watch.completionEvidence = evidence;
    watch.blockedReason = null;
    this.save(watch, "dots_reported_completion");
    return {
      watch,
      evidence,
      verification: "dots_host_reported",
      unattendedAcceptance: "unverified",
    };
  }
  async close() {
    this.closed = true;
    clearInterval(this.timer);
    while (this.polling.size) await new Promise((r) => setTimeout(r, 10));
  }
}
