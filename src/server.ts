import Fastify from "fastify";
import staticPlugin from "@fastify/static";
import { timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { Manager } from "./manager.js";
import { Events } from "./events.js";
import { tools, callTool, toolDefinitions } from "./tools.js";
import { DomainError } from "./domain.js";
import { fingerprint } from "./workspace.js";
import { Observer } from "./watch.js";
import type { GatewayAuth } from "./gateway-auth.js";

function equal(actual: string, expected: string) {
  const a = Buffer.from(actual),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function buildServer(
  manager: Manager,
  events: Events,
  tokens: { ui: string; mcp: string },
  options: {
    webDir?: string;
    onShutdown?: () => void;
    observer?: Observer;
    gatewayAuth?: GatewayAuth;
  } = {},
) {
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  const observer =
    options.observer ?? new Observer(manager.store, manager.adapters);
  if (!options.observer) app.addHook("onClose", async () => observer.close());
  const registry = tools(manager, events, observer);
  app.addHook("onRequest", async (req, reply) => {
    const authority =
      /^(?:127\.0\.0\.1|localhost|\[::1\])(?::([0-9]{1,5}))?$/i.exec(
        req.headers.host ?? "",
      );
    if (
      !authority ||
      (authority[1] !== undefined &&
        (Number(authority[1]) < 1 || Number(authority[1]) > 65535))
    )
      return reply.code(403).send({ error: "Untrusted Host header" });
    const origin = req.headers.origin;
    if (origin) {
      try {
        const url = new URL(origin);
        if (url.host !== req.headers.host || url.protocol !== "http:")
          return reply.code(403).send({ error: "Untrusted Origin" });
      } catch {
        return reply.code(403).send({ error: "Invalid Origin" });
      }
    }
    const path = req.url.split("?")[0];
    if (path === "/healthz") return;
    if (path.startsWith("/api/") || path === "/mcp") {
      const expected =
        path === "/mcp" || path.startsWith("/api/mcp-tools/")
          ? tokens.mcp
          : tokens.ui;
      if (!equal(req.headers.authorization ?? "", "Bearer " + expected))
        return reply.code(401).send({ error: "Authentication required" });
    }
    reply.header("referrer-policy", "no-referrer");
    reply.header("x-content-type-options", "nosniff");
    reply.header("cache-control", "no-store");
  });
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof z.ZodError) {
      void reply.code(400).send({
        code: "invalid_input",
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    } else {
      void reply.code(error instanceof DomainError ? error.status : 500).send({
        code: error instanceof DomainError ? error.code : "internal_error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  app.get("/healthz", async () => ({ status: "ok", service: "kingdots" }));
  app.get("/api/status", async () => ({
    version: "0.1.3",
    connectionMode: "local-stdio",
    apiBilling: "forbidden",
    tunnelEnabled: false,
    tasks: manager.store.tasks().length,
    watches: manager.store.watches().length,
    mode: "existing_session_observer",
    supervisor: "dots",
    createsSessions: false,
    appHost: observer.appHost?.info() ?? { available: false },
    gateway: options.gatewayAuth?.info() ?? { configured: false },
    connection: manager.store.get("settings", "dots_connection") ?? {
      unattendedAcceptance: "unverified",
    },
    dotsUsage: {
      value: null,
      status: "unavailable",
      note: "Dots account usage is not attributable to these tasks",
    },
    lastEventError: manager.store.get("settings", "last_event_error"),
  }));
  app.get("/api/tasks", async () => manager.store.tasks());
  app.post("/api/tasks", async () => {
    throw new DomainError(
      "new_session_disabled",
      "Register existing sessions with /api/watches. Creating workers or worktrees is not part of Dots supervision.",
      410,
    );
  });
  app.get("/api/watches", async () => manager.store.watches());
  app.get("/api/gateway", async () => ({
    info: options.gatewayAuth?.info(),
    pending: options.gatewayAuth?.pending() ?? [],
    grants: options.gatewayAuth?.grants() ?? [],
  }));
  app.post("/api/gateway/configure", async (req) => {
    if (!options.gatewayAuth)
      throw new DomainError(
        "gateway_unavailable",
        "Gateway is unavailable",
        503,
      );
    return options.gatewayAuth.configure(
      z.object({ origin: z.string() }).parse(req.body).origin,
    );
  });
  app.post<{ Params: { id: string } }>(
    "/api/gateway/approvals/:id",
    async (req) => {
      if (!options.gatewayAuth)
        throw new DomainError(
          "gateway_unavailable",
          "Gateway is unavailable",
          503,
        );
      const input = z
        .object({
          displayCode: z.string(),
          watchIds: z.array(z.string()).min(1),
          scopes: z.array(z.enum(["kingdots:read", "kingdots:manage"])).min(1),
        })
        .parse(req.body);
      return options.gatewayAuth.approve(
        req.params.id,
        input.displayCode,
        input.watchIds,
        input.scopes,
      );
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/gateway/grants/:id/revoke",
    async (req) => {
      options.gatewayAuth?.revokeGrant(req.params.id);
      return { revoked: true };
    },
  );
  app.post("/api/watches", async (req) => observer.create(req.body));
  app.get<{ Params: { id: string } }>("/api/watches/:id", async (req) => ({
    watch: manager.store.getWatch(req.params.id),
    commands: manager.store.commands(req.params.id),
  }));
  app.post<{ Params: { id: string; action: string } }>(
    "/api/watches/:id/:action",
    async (req) => {
      switch (req.params.action) {
        case "poll":
          return observer.poll(req.params.id);
        case "pause":
          return observer.pause(req.params.id);
        case "release":
          return observer.pause(req.params.id, true);
        case "resume":
          return observer.resume(req.params.id);
        default:
          throw new DomainError("not_found", "Unknown watch control", 404);
      }
    },
  );
  app.get<{ Params: { id: string } }>("/api/tasks/:id", async (req) => {
    const task = manager.store.getTask(req.params.id);
    let current: string | null = null;
    try {
      if (task.worktree) current = await fingerprint(task.worktree);
    } catch {}
    return {
      task,
      commands: manager.store.commands(task.id),
      evidenceValid:
        current !== null &&
        task.evidence.length === task.checks.length &&
        task.evidence.every((e) => e.passed && e.fingerprint === current),
    };
  });
  app.post<{ Params: { id: string; action: string } }>(
    "/api/tasks/:id/:action",
    async () => {
      throw new DomainError(
        "legacy_execution_disabled",
        "Worker execution is disabled. Use existing-session watch controls.",
        410,
      );
    },
  );
  app.post("/api/approvals/:id", async () => {
    throw new DomainError(
      "permission_host_required",
      "Handle permissions directly in the original host; Dots cannot approve them.",
      410,
    );
  });
  app.get("/api/capabilities", async () => manager.capabilities());
  app.get("/api/events", async (req) =>
    manager.store.events(Number((req.query as any).after ?? 0)),
  );
  app.get("/api/instructions", async () => ({
    mcpEndpoint: "/mcp",
    eventsProtocol: "2026-07-28",
    tunnelGuide:
      "https://developers.openai.com/api/docs/guides/secure-mcp-tunnels",
    eventsGuide: "https://developers.openai.com/plugins/build/mcp-events",
    note: "Local connection does not verify Dots wake-up. Credentials and account permissions are configured by the user.",
  }));
  app.post("/api/shutdown", async () => {
    setTimeout(() => options.onShutdown?.(), 100);
    return { stopping: true };
  });
  app.post<{ Params: { name: string } }>("/api/mcp-tools/:name", async (req) =>
    callTool(registry, req.params.name, req.body),
  );
  app.post("/mcp", async (req, reply) => {
    const input = z
      .object({
        jsonrpc: z.literal("2.0").optional(),
        id: z.union([z.number(), z.string()]).optional(),
        method: z.string(),
        params: z.any().optional(),
      })
      .parse(req.body);
    if (input.id === undefined) return reply.code(202).send();
    try {
      let result: unknown;
      switch (input.method) {
        case "server/discover":
          result = {
            resultType: "complete",
            supportedVersions: ["2026-07-28"],
            capabilities: { tools: {}, events: {} },
          };
          break;
        case "initialize":
          result = {
            protocolVersion: "2025-11-25",
            capabilities: { tools: {} },
            serverInfo: { name: "kingdots", version: "0.1.3" },
            instructions:
              "Dots supervises only user-selected existing sessions. No new workers or worktrees. Observe healthy work quietly, refresh original host state before a follow-up, and reconcile unknown delivery. Host permission and management resume are user-only controls. Completion evidence is host-reported; actual unattended Dots wake-up remains unverified.",
          };
          break;
        case "tools/list":
          result = { tools: toolDefinitions(registry) };
          break;
        case "tools/call": {
          const value = await callTool(
            registry,
            input.params?.name,
            input.params?.arguments ?? {},
          );
          result = {
            content: [{ type: "text", text: JSON.stringify(value) }],
            structuredContent: { result: value },
            isError: false,
          };
          break;
        }
        case "events/list":
          result = events.definitions();
          break;
        case "events/subscribe":
          result = await events.subscribe(input.params);
          break;
        case "events/unsubscribe":
          result = events.unsubscribe(input.params);
          break;
        case "ping":
          result = {};
          break;
        default:
          return {
            jsonrpc: "2.0",
            id: input.id,
            error: { code: -32601, message: "Method not supported" },
          };
      }
      return { jsonrpc: "2.0", id: input.id, result };
    } catch (e) {
      return {
        jsonrpc: "2.0",
        id: input.id,
        error: {
          code:
            (e as DomainError).code === "callback_verification_failed"
              ? -32015
              : -32602,
          message: (e as Error).message,
        },
      };
    }
  });
  const webDir = options.webDir ?? resolve("web-dist");
  if (existsSync(webDir)) {
    app.register(staticPlugin, { root: webDir });
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith("/api/") || req.url === "/mcp")
        return reply.code(404).send({ error: "Not found" });
      return reply.sendFile("index.html");
    });
  }
  return app;
}
