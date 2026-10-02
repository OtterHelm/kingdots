import { randomUUID, createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { Store } from "./store.js";
import {
  createTaskSchema,
  commandSchema,
  DomainError,
  unavailableUsage,
  type Task,
  type Command,
  type CommandInput,
  type Evidence,
  type BackendId,
} from "./domain.js";
import {
  prepareWorktree,
  fingerprint,
  safeFile,
  changedPaths,
  allowedPath,
} from "./workspace.js";
import type {
  Adapter,
  AdapterEvent,
  BackendInfo,
  Feature,
} from "./adapters/types.js";

export class Manager {
  private queues = new Map<string, Promise<unknown>>();
  private verifying = new Map<string, AbortController>();
  private steering = new Map<string, AbortController>();
  private timer: NodeJS.Timeout;
  private closing = false;
  onChange: (task: Task) => void = () => {};
  constructor(
    readonly store: Store,
    readonly adapters: Map<BackendId, Adapter>,
    readonly dataDir: string,
    readonly executionBlock: (backend: BackendId) => string | null = () => null,
  ) {
    for (const adapter of adapters.values())
      adapter.onEvent = (event) => {
        void this.handleEvent(adapter.id, event).catch((e) => {
          if (!this.closing)
            this.store.put("settings", "last_event_error", {
              message: (e as Error).message,
              at: new Date().toISOString(),
            });
        });
      };
    this.recover();
    this.timer = setInterval(() => {
      void this.enforceLimits();
    }, 1_000);
    this.timer.unref();
  }
  private recover() {
    for (const command of this.store.commands())
      if (["queued", "dispatching", "accepted"].includes(command.status)) {
        command.status = "unknown";
        command.updatedAt = new Date().toISOString();
        this.store.saveCommand(command);
      }
    for (const task of this.store.tasks())
      if (
        ["preparing", "running", "verifying", "awaiting_input"].includes(
          task.state,
        )
      ) {
        task.automatic = false;
        task.epoch++;
        task.state = "awaiting_input";
        task.blockedReason =
          "Service restarted: prior execution ownership is uncertain. Inspect the provider before resuming.";
        task.nextAction = "User must confirm the previous worker is stopped";
        this.save(task, "restart_reconciliation_required");
      }
  }
  private async serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(key) ?? Promise.resolve();
    const current = prev.catch(() => {}).then(fn);
    this.queues.set(key, current);
    try {
      return await current;
    } finally {
      if (this.queues.get(key) === current) this.queues.delete(key);
    }
  }
  private save(task: Task, cause?: string) {
    task.revision++;
    task.updatedAt = new Date().toISOString();
    this.store.transaction(() => {
      this.store.saveTask(task);
      if (cause) this.store.event(task, cause);
    });
    this.onChange(task);
  }
  private adapter(task: Task): Adapter {
    const adapter = this.adapters.get(task.backend);
    if (!adapter)
      throw new DomainError("backend_missing", "Backend is not configured");
    return adapter;
  }
  private ensureWritable(task: Task, epoch: number) {
    this.requireExecutionBackend(task.backend);
    if (
      !task.automatic ||
      task.epoch !== epoch ||
      ["completed", "failed", "released", "paused", "awaiting_input"].includes(
        task.state,
      )
    )
      throw new DomainError(
        "write_fenced",
        "Automatic write permission is inactive or stale",
      );
    if (!task.allowedBackends.includes(task.backend))
      throw new DomainError(
        "backend_not_authorized",
        "Backend is outside the requested scope",
      );
    if (
      task.limits.durationMs &&
      Date.now() - Date.parse(task.createdAt) >= task.limits.durationMs
    )
      throw new DomainError("budget_exceeded", "Time limit reached");
    if (
      task.limits.tokens &&
      task.usage.tokens !== null &&
      task.usage.tokens >= task.limits.tokens
    )
      throw new DomainError("budget_exceeded", "Reported token limit reached");
    if (
      task.limits.costUsd &&
      task.usage.costUsd !== null &&
      task.usage.costUsd >= task.limits.costUsd
    )
      throw new DomainError("budget_exceeded", "Reported cost limit reached");
  }
  private requireExecutionBackend(backend: BackendId) {
    const reason = this.executionBlock(backend);
    if (reason) throw new DomainError("api_billing_forbidden", reason);
  }
  private begin(task: Task, action: string, input: CommandInput) {
    const inputHash = createHash("sha256")
      .update(JSON.stringify({ taskId: task.id, action, ...input }))
      .digest("hex");
    const existing = this.store.command(input.commandId);
    if (existing) {
      if (existing.inputHash !== inputHash)
        throw new DomainError(
          "idempotency_conflict",
          "Command ID was already used with different input",
        );
      return { command: existing, fresh: false };
    }
    const now = new Date().toISOString();
    const command: Command = {
      id: input.commandId,
      taskId: task.id,
      action,
      reason: input.reason,
      prompt: input.prompt ?? null,
      inputHash,
      epoch: input.epoch,
      status: "queued",
      nativeId: null,
      result: null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.saveCommand(command);
    return { command, fresh: true };
  }
  private finish(
    command: Command,
    status: Command["status"],
    result?: unknown,
  ) {
    command.status = status;
    command.updatedAt = new Date().toISOString();
    command.result = result ?? command.result;
    this.store.saveCommand(command);
  }
  private mark(backend: BackendId, feature: Feature, evidence: string) {
    this.store.put("settings", `capability:${backend}:${feature}`, {
      feature,
      state:
        feature === "read_existing" || feature === "resume"
          ? "limited"
          : "supported",
      notes: "Only kingdots-owned sessions on this host",
      version: this.store.get("settings", "version:" + backend),
      testedAt: new Date().toISOString(),
      evidence,
    });
  }
  async capabilities(): Promise<BackendInfo[]> {
    const results = await Promise.allSettled(
      [...this.adapters.values()].map((a) => a.probe()),
    );
    return results.map((result, i) => {
      const adapter = [...this.adapters.values()][i];
      const info =
        result.status === "fulfilled"
          ? result.value
          : {
              id: adapter.id,
              name: adapter.id,
              installed: false,
              version: null,
              platform: process.platform,
              capabilities: [],
            };
      this.store.put("settings", "version:" + adapter.id, info.version);
      for (let index = 0; index < info.capabilities.length; index++) {
        const evidence = this.store.get<any>(
          "settings",
          `capability:${adapter.id}:${info.capabilities[index].feature}`,
        );
        if (evidence && evidence.version === info.version)
          info.capabilities[index] = {
            ...info.capabilities[index],
            ...evidence,
          };
      }
      const blocked = this.executionBlock(adapter.id);
      if (blocked) info.executionBlockedReason = blocked;
      return info;
    });
  }
  async create(input: unknown): Promise<Task> {
    const params = createTaskSchema.parse(input);
    this.requireExecutionBackend(params.backend);
    if (!params.allowedBackends.includes(params.backend))
      throw new DomainError(
        "backend_not_authorized",
        "Selected backend is not allowed",
        400,
      );
    if (
      new Set(params.checks.map((c) => c.id)).size !== params.checks.length ||
      params.checks.some((c) =>
        ["workspace", "execution", "artifacts", "report"].includes(c.id),
      )
    )
      throw new DomainError(
        "duplicate_checks",
        "Check IDs must be unique and cannot use reserved checklist IDs",
        400,
      );
    if (params.limits.tokens)
      throw new DomainError(
        "budget_unavailable",
        "A strict token cap is not enforceable by these providers. Use a duration limit or omit the cap.",
        400,
      );
    if (params.limits.costUsd && params.backend !== "claude-code")
      throw new DomainError(
        "budget_unavailable",
        "Only the Claude SDK offers a native estimated-cost budget. Use a duration limit for this backend.",
        400,
      );
    if (["codex-app", "claude-app"].includes(params.backend))
      throw new DomainError(
        "connection_unverified",
        "This desktop adapter has not passed connection tests",
        400,
      );
    const backendInfo = await this.adapters.get(params.backend)!.probe();
    this.store.put(
      "settings",
      "version:" + params.backend,
      backendInfo.version,
    );
    if (!backendInfo.installed)
      throw new DomainError(
        "not_installed",
        "Selected provider executable is unavailable",
        400,
      );
    const now = new Date().toISOString();
    const id = randomUUID();
    let task: Task = {
      ...params,
      project: resolve(params.project),
      id,
      state: "preparing",
      revision: 0,
      createdAt: now,
      updatedAt: now,
      worktree: null,
      branch: null,
      baseCommit: null,
      baselineFingerprint: null,
      sessionId: null,
      epoch: 0,
      automatic: true,
      blockedReason: null,
      lastHealthyAt: null,
      lastDecisionAt: now,
      recentAction: "Preparing isolated worktree",
      nextAction: "Start an owned session",
      checklist: [
        { id: "workspace", label: "작업 폴더 준비", done: false },
        { id: "execution", label: "AI 수정 작업", done: false },
        ...params.checks.map((c) => ({
          id: c.id,
          label: c.label,
          done: false,
        })),
        { id: "artifacts", label: "산출물 확인", done: false },
        { id: "report", label: "완료 근거와 보고", done: false },
      ],
      evidence: [],
      artifactEvidence: [],
      usage: unavailableUsage(),
      failureFingerprint: null,
      failureCount: 0,
      finalReport: null,
    };
    this.save(task);
    try {
      const workspace = await this.serial(
        "project:" + task.project.toLowerCase(),
        () => prepareWorktree(task, this.dataDir),
      );
      task = this.store.getTask(id);
      this.ensureWritable(task, 0);
      Object.assign(task, workspace);
      task.checklist[0].done = true;
      this.save(task);
      const { command } = this.begin(task, "session_create", {
        commandId: id + ":create",
        epoch: task.epoch,
        reason: "Create a session for the direct user request",
      });
      this.finish(command, "dispatching");
      const session = await this.adapter(task).create(task);
      task = this.store.getTask(id);
      task.sessionId = session.id;
      if (session.model) task.model = session.model;
      this.store.acquire(task.backend + ":" + session.id, id, task.epoch);
      command.nativeId = session.id;
      this.finish(command, "completed", session);
      this.mark(task.backend, "create", "Owned session created: " + session.id);
      this.save(task);
      await this.dispatch(id, "send", {
        commandId: id + ":initial",
        reason: "Execute the authorized goal",
        prompt:
          task.goal +
          "\n\nCompletion checks: " +
          task.checks.map((c) => c.argv.join(" ")).join("; "),
        epoch: task.epoch,
      });
    } catch (e) {
      task = this.store.getTask(id);
      const message = (e as Error).message;
      task.state = "awaiting_input";
      task.automatic = false;
      task.blockedReason = message;
      task.nextAction = "Resolve preparation or connection issue";
      this.save(task, "preparation_blocked");
      for (const command of this.store.commands(id))
        if (command.status === "dispatching")
          this.finish(command, "unknown", { error: message });
    }
    return this.store.getTask(id);
  }
  async dispatch(id: string, action: "send" | "steer", raw: unknown) {
    const input = commandSchema.parse(raw);
    if (!input.prompt)
      throw new DomainError("prompt_missing", "A prompt is required", 400);
    return this.serial("task:" + id, async () => {
      let task = this.store.getTask(id);
      const { command, fresh } = this.begin(task, action, input);
      if (!fresh) return command;
      try {
        this.ensureWritable(task, input.epoch);
        if (!task.sessionId)
          throw new DomainError("no_session", "Task has no session");
        this.store.acquire(task.backend + ":" + task.sessionId, id, task.epoch);
        if (action === "send" && ["running", "verifying"].includes(task.state))
          throw new DomainError(
            "session_busy",
            "Wait for completion or explicitly steer",
          );
        task.state = "running";
        task.recentAction = input.reason;
        task.nextAction = "Collect result and verify";
        task.lastDecisionAt = new Date().toISOString();
        task.evidence = [];
        task.artifactEvidence = [];
        task.checklist.forEach((c) => {
          if (c.id !== "workspace") c.done = false;
        });
        this.save(task);
        this.finish(command, "dispatching");
        const result =
          action === "send"
            ? await this.adapter(task).send(
                task.sessionId,
                input.prompt!,
                input.commandId,
                task,
              )
            : await (() => {
                const controller = new AbortController();
                this.steering.set(id, controller);
                return this.adapter(task)
                  .steer(
                    task.sessionId!,
                    input.prompt!,
                    task,
                    controller.signal,
                  )
                  .finally(() => this.steering.delete(id));
              })();
        command.nativeId = result.nativeId;
        this.finish(command, "accepted", result);
        if (action === "steer")
          this.mark(task.backend, "steer", "Command accepted: " + command.id);
        const latest = this.store.getTask(id);
        if (latest.epoch !== input.epoch || !latest.automatic)
          await this.adapter(latest).interrupt(task.sessionId);
        return this.store.command(command.id)!;
      } catch (e) {
        const uncertain = (e as DomainError).code === "uncertain_delivery";
        this.finish(command, uncertain ? "unknown" : "failed", {
          error: (e as Error).message,
        });
        task = this.store.getTask(id);
        if (task.automatic) {
          task.state = uncertain ? "awaiting_input" : "awaiting_decision";
          task.blockedReason = (e as Error).message;
          if (uncertain) {
            task.automatic = false;
            task.epoch++;
          }
          this.save(task, uncertain ? "delivery_unknown" : "command_failed");
        }
        throw e;
      }
    });
  }
  private async handleEvent(backend: BackendId, event: AdapterEvent) {
    if (this.closing) return;
    const candidate = this.store
      .tasks()
      .find((t) => t.backend === backend && t.sessionId === event.sessionId);
    if (!candidate || this.closing) return;
    if (event.type === "user_input") {
      await this.pause(candidate.id, false, "User intervened in the session");
      return;
    }
    await this.serial("task:" + candidate.id, async () => {
      let task = this.store.getTask(candidate.id);
      if (event.type === "activity") {
        task.recentAction = event.text.slice(0, 2_000);
        task.lastHealthyAt = new Date().toISOString();
        this.save(task);
        return;
      }
      if (event.type === "approval") {
        if (!task.automatic) return;
        this.store.put("approvals", event.approvalId, {
          id: event.approvalId,
          taskId: task.id,
          epoch: task.epoch,
          backend,
          description: event.description,
          state: "pending",
          createdAt: new Date().toISOString(),
        });
        task.state = "awaiting_input";
        task.blockedReason = "Provider requires user approval";
        task.nextAction = "Review the permission request";
        this.save(task, "approval_required");
        return;
      }
      if (event.type === "disconnected") {
        task.state = "awaiting_input";
        task.automatic = false;
        task.epoch++;
        task.blockedReason = event.reason;
        task.nextAction = "Reconcile provider state before resuming";
        for (const c of this.store.commands(task.id))
          if (c.status === "accepted" || c.status === "dispatching")
            this.finish(c, "unknown", { error: event.reason });
        this.save(task, "connection_lost");
        return;
      }
      this.mark(
        backend,
        "receive",
        "Received native completion: " + event.nativeId,
      );
      const matching = this.store
        .commands(task.id)
        .find(
          (c) =>
            ["send", "steer"].includes(c.action) &&
            c.nativeId === event.nativeId,
        );
      if (matching && matching.epoch !== task.epoch) {
        this.finish(
          matching,
          event.status === "completed" ? "completed" : "failed",
          { status: event.status, text: event.text },
        );
        return;
      }
      for (const command of this.store.commands(task.id))
        if (
          ["send", "steer"].includes(command.action) &&
          ["accepted", "unknown"].includes(command.status) &&
          (!event.nativeId ||
            command.nativeId === event.nativeId ||
            command.action === "steer")
        )
          this.finish(
            command,
            event.status === "completed" ? "completed" : "failed",
            { status: event.status, text: event.text },
          );
      task.lastHealthyAt = new Date().toISOString();
      if (event.usage) task.usage = event.usage;
      if (
        !task.automatic ||
        ["paused", "released", "completed", "failed"].includes(task.state)
      ) {
        this.save(task);
        return;
      }
      if (event.status === "interrupted") {
        task.state = "paused";
        task.automatic = false;
        task.epoch++;
        task.blockedReason = "Worker was interrupted";
        this.save(task, "worker_interrupted");
        return;
      }
      if (event.status === "failed") {
        const files = task.worktree
          ? await fingerprint(task.worktree).catch(() => "unknown")
          : "";
        const normalized = event.text
          .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<id>")
          .replace(/\d{4}-\d{2}-\d{2}T[\d:.Z+-]+/g, "<time>");
        this.recordFailure(
          task,
          createHash("sha256")
            .update(files + normalized)
            .digest("hex"),
        );
        task.state = task.failureCount >= 3 ? "failed" : "awaiting_decision";
        task.automatic = task.failureCount < 3;
        task.blockedReason = event.text;
        task.nextAction = task.automatic
          ? "Dots decides the next step"
          : "Repeated error: user input required";
        this.save(task, "worker_failed");
        return;
      }
      task.checklist.find((c) => c.id === "execution")!.done = true;
      task.state = "awaiting_decision";
      task.blockedReason = null;
      task.recentAction = "Worker returned; independent verification next";
      this.save(task);
      // Run the saved checks without another model invocation.
      await this.verifyInternal(task, {
        commandId: task.id + ":verify:" + task.revision,
        epoch: task.epoch,
        reason: "Independently verify the worker result",
      });
    });
  }
  private recordFailure(task: Task, value: string) {
    task.failureCount =
      task.failureFingerprint === value ? task.failureCount + 1 : 1;
    task.failureFingerprint = value;
  }
  async verify(id: string, raw: unknown) {
    const input = commandSchema.parse(raw);
    return this.serial("task:" + id, () =>
      this.verifyInternal(this.store.getTask(id), input),
    );
  }
  private async verifyInternal(initial: Task, input: CommandInput) {
    let task = initial;
    const { command, fresh } = this.begin(task, "verify", input);
    if (!fresh) return command;
    const controller = new AbortController();
    this.verifying.set(task.id, controller);
    try {
      this.ensureWritable(task, input.epoch);
      if (!task.worktree || task.state === "running")
        throw new DomainError(
          "worker_active",
          "Cannot verify while the worker is modifying files",
        );
      task.state = "verifying";
      task.recentAction = "Running independent checks";
      task.nextAction = "Dots evaluates verification evidence";
      this.save(task);
      this.finish(command, "dispatching");
      const startFingerprint = await fingerprint(task.worktree);
      const evidence: Evidence[] = [];
      for (const check of task.checks) {
        if (controller.signal.aborted) break;
        const startedAt = new Date().toISOString();
        let result;
        try {
          const verifier = this.adapters.get("codex-cli");
          if (!verifier?.executeCheck)
            throw new DomainError(
              "sandbox_unavailable",
              "A verified sandbox command executor is required",
            );
          result = await verifier.executeCheck(
            check.argv,
            task,
            check.timeoutMs,
            controller.signal,
          );
        } catch (e) {
          result = { exitCode: null, stdout: "", stderr: (e as Error).message };
        }
        evidence.push({
          id: randomUUID(),
          checkId: check.id,
          label: check.label,
          argv: check.argv,
          ...result,
          fingerprint: startFingerprint,
          startedAt,
          finishedAt: new Date().toISOString(),
          passed: result.exitCode === 0 && !controller.signal.aborted,
        });
      }
      const after = await fingerprint(task.worktree);
      task = this.store.getTask(task.id);
      if (task.epoch !== input.epoch || !task.automatic) {
        this.finish(command, "failed", {
          error: "Verification interrupted; evidence is not valid",
        });
        return command;
      }
      task.evidence = evidence;
      task.artifactEvidence = [];
      let problem: string | null =
        after !== startFingerprint ? "Files changed during verification" : null;
      const outside = (await changedPaths(task, this.dataDir)).filter(
        (path) => !allowedPath(path, task.scope.allowedPaths),
      );
      if (outside.length)
        problem =
          "Changes outside the authorized file scope: " + outside.join(", ");
      if (!problem)
        for (const path of task.artifacts) {
          try {
            const file = await safeFile(task.worktree!, path);
            const info = await stat(file);
            if (!info.isFile()) throw new Error("Not a file");
            const data = await readFile(file);
            task.artifactEvidence.push({
              path,
              sha256: createHash("sha256").update(data).digest("hex"),
              size: info.size,
            });
          } catch (e) {
            problem = `Required artifact ${path}: ${(e as Error).message}`;
            break;
          }
        }
      for (const item of task.checklist) {
        const check = evidence.find((e) => e.checkId === item.id);
        if (check)
          item.done =
            check.passed && after === startFingerprint && !outside.length;
      }
      const passed =
        !problem &&
        evidence.length === task.checks.length &&
        evidence.every((e) => e.passed);
      task.checklist.find((c) => c.id === "artifacts")!.done = passed;
      task.state = "awaiting_decision";
      task.blockedReason =
        problem ?? (passed ? null : "Completion checks failed");
      if (!passed) {
        const failure = createHash("sha256")
          .update(
            after +
              ":" +
              (problem ??
                evidence
                  .filter((e) => !e.passed)
                  .map((e) => e.checkId + ":" + e.exitCode)
                  .join("|")),
          )
          .digest("hex");
        this.recordFailure(task, failure);
        if (task.failureCount >= 3) {
          task.state = "failed";
          task.automatic = false;
          task.blockedReason =
            "Same verification failure repeated three times without file progress";
        }
      } else {
        task.failureCount = 0;
        task.failureFingerprint = null;
      }
      task.recentAction = passed
        ? "Independent checks passed"
        : "Verification found an issue";
      task.nextAction = passed
        ? "Dots confirms the result and reports evidence"
        : task.automatic
          ? "Dots sends a scoped repair instruction"
          : "User resolves repeated failure";
      task.lastHealthyAt = new Date().toISOString();
      this.save(task, passed ? "verification_passed" : "verification_failed");
      this.finish(command, "completed", { passed, evidence, problem });
      return command;
    } catch (e) {
      this.finish(command, "failed", { error: (e as Error).message });
      throw e;
    } finally {
      this.verifying.delete(initial.id);
    }
  }
  async complete(id: string, raw: unknown, report: string) {
    const input = commandSchema.parse(raw);
    if (!report.trim())
      throw new DomainError(
        "report_required",
        "An evidence-based report is required",
      );
    return this.serial("task:" + id, async () => {
      const task = this.store.getTask(id);
      const { command, fresh } = this.begin(task, "complete", {
        ...input,
        prompt: report,
      });
      if (!fresh) return command;
      try {
        this.ensureWritable(task, input.epoch);
        if (task.state !== "awaiting_decision" || !task.worktree)
          throw new DomainError(
            "not_ready",
            "Task is not ready for completion",
          );
        const current = await fingerprint(task.worktree);
        if (
          task.evidence.length !== task.checks.length ||
          task.checks.some(
            (c) =>
              !task.evidence.some(
                (e) =>
                  e.checkId === c.id && e.passed && e.fingerprint === current,
              ),
          )
        )
          throw new DomainError(
            "evidence_invalid",
            "Required checks are missing, failed, or stale",
          );
        if (
          (await changedPaths(task, this.dataDir)).some(
            (p) => !allowedPath(p, task.scope.allowedPaths),
          )
        )
          throw new DomainError(
            "scope_violation",
            "Changes exceed the authorized file scope",
          );
        for (const path of task.artifacts) {
          const saved = task.artifactEvidence.find((e) => e.path === path);
          const file = await safeFile(task.worktree, path);
          if (
            !saved ||
            createHash("sha256")
              .update(await readFile(file))
              .digest("hex") !== saved.sha256
          )
            throw new DomainError(
              "artifact_invalid",
              "Required artifact is missing or stale",
            );
        }
        task.state = "completed";
        task.automatic = false;
        task.finalReport = report;
        task.checklist.forEach((c) => (c.done = true));
        task.blockedReason = null;
        task.recentAction = "Completion evidence confirmed";
        task.nextAction = "Result is retained in the worktree";
        task.lastDecisionAt = new Date().toISOString();
        this.save(task, "completion_confirmed");
        this.store.release(id);
        this.finish(command, "completed", { worktree: task.worktree, report });
        return command;
      } catch (e) {
        this.finish(command, "failed", { error: (e as Error).message });
        throw e;
      }
    });
  }
  async pause(
    id: string,
    release = false,
    reason = "Paused by user",
    raw?: unknown,
  ) {
    let task = this.store.getTask(id);
    if (task.state === "completed") return task;
    const input = commandSchema.parse(
      raw ?? { commandId: randomUUID(), reason, epoch: task.epoch },
    );
    const { command, fresh } = this.begin(
      task,
      release ? "release" : "pause",
      input,
    );
    if (!fresh) return task;
    this.finish(command, "dispatching");
    // Fence immediately, before waiting for an in-flight RPC or test process.
    task.automatic = false;
    task.epoch++;
    task.state = "paused";
    task.blockedReason = reason;
    task.nextAction = "User must explicitly resume automatic management";
    this.save(task);
    this.verifying.get(id)?.abort();
    this.steering.get(id)?.abort();
    return this.serial("task:" + id, async () => {
      task = this.store.getTask(id);
      try {
        if (task.sessionId) await this.adapter(task).interrupt(task.sessionId);
        if (task.sessionId)
          this.mark(
            task.backend,
            "interrupt",
            "Owned session cancellation confirmed",
          );
        task = this.store.getTask(id);
        task.state = release ? "released" : "paused";
        if (release) this.store.release(id);
        this.save(task, release ? "management_released" : "management_paused");
        this.finish(command, "completed", { state: task.state });
      } catch (e) {
        task = this.store.getTask(id);
        task.state = "awaiting_input";
        task.blockedReason =
          "Interruption not confirmed: " + (e as Error).message;
        this.save(task, "interruption_unknown");
        this.finish(command, "unknown", { error: (e as Error).message });
      }
      return task;
    });
  }
  async resume(id: string, userConfirmedStopped = false) {
    return this.serial("task:" + id, async () => {
      const task = this.store.getTask(id);
      this.requireExecutionBackend(task.backend);
      if (
        !["paused", "released", "awaiting_input", "failed"].includes(task.state)
      )
        throw new DomainError("not_paused", "Task is not paused");
      if (
        this.store.commands(id).some((c) => c.status === "unknown") &&
        !userConfirmedStopped
      )
        throw new DomainError(
          "ownership_unknown",
          "Confirm the previous worker has stopped before resuming",
        );
      if (!task.sessionId)
        throw new DomainError(
          "no_session",
          "Preparation failed; create a new task after resolving the issue",
        );
      const session = await this.adapter(task).resume(task);
      if (!session.owned || session.state !== "idle")
        throw new DomainError(
          "ownership_unknown",
          "Confirmed owned idle session required",
        );
      this.store.release(id);
      task.epoch++;
      this.store.acquire(task.backend + ":" + task.sessionId, id, task.epoch);
      task.automatic = true;
      task.state = "awaiting_decision";
      task.blockedReason = null;
      task.failureCount = 0;
      task.failureFingerprint = null;
      task.nextAction = "Dots chooses a follow-up or verification";
      this.mark(task.backend, "resume", "Owned inactive session resumed");
      this.save(task, "management_resumed");
      return task;
    });
  }
  async approve(id: string, accept: boolean) {
    const approval = this.store.get<any>("approvals", id);
    if (!approval || approval.state !== "pending")
      throw new DomainError("approval_expired", "Request is not pending");
    const task = this.store.getTask(approval.taskId);
    if (!task.automatic || approval.epoch !== task.epoch)
      throw new DomainError(
        "write_fenced",
        "Management is paused or the approval is stale",
      );
    const adapter = this.adapter(task);
    if (!adapter.approve)
      throw new DomainError(
        "unsupported",
        "Approval must be handled in the provider",
      );
    await adapter.approve(id, accept);
    approval.state = accept ? "accepted" : "denied";
    this.store.put("approvals", id, approval);
    const current = this.store.getTask(task.id);
    current.state = "running";
    current.blockedReason = null;
    this.save(current);
  }
  private async enforceLimits() {
    for (const task of this.store.tasks()) {
      if (!task.automatic) continue;
      const exceeded =
        (task.limits.durationMs &&
          Date.now() - Date.parse(task.createdAt) >= task.limits.durationMs) ||
        (task.limits.tokens &&
          task.usage.tokens !== null &&
          task.usage.tokens >= task.limits.tokens) ||
        (task.limits.costUsd &&
          task.usage.costUsd !== null &&
          task.usage.costUsd >= task.limits.costUsd);
      if (exceeded)
        await this.pause(task.id, false, "Configured budget reached");
    }
  }
  async close() {
    this.closing = true;
    clearInterval(this.timer);
    for (const c of this.verifying.values()) c.abort();
    for (const task of this.store.tasks())
      if (
        task.automatic &&
        ["running", "verifying", "awaiting_input"].includes(task.state)
      )
        await this.pause(task.id, false, "Service shutting down");
    await Promise.allSettled([...this.adapters.values()].map((a) => a.close()));
  }
}
