import Fastify from "fastify";
import staticPlugin from "@fastify/static";
import { timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { Manager } from "./manager.js";
import { Events } from "./events.js";
import { tools, callTool, toolDefinitions } from "./tools.js";
import { DomainError, commandSchema } from "./domain.js";
import { fingerprint } from "./workspace.js";

function equal(actual: string, expected: string) {
  const a = Buffer.from(actual),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function buildServer(
  manager: Manager,
  events: Events,
  tokens: { ui: string; mcp: string },
  options: { webDir?: string; onShutdown?: () => void } = {},
) {
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  const registry = tools(manager, events);
  app.addHook("onRequest", async (req, reply) => {
    const hostname = (req.headers.host ?? "").split(":")[0].toLowerCase();
    if (!["127.0.0.1", "localhost", "["].includes(hostname))
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
    version: "0.1.0",
    connectionMode: "local-stdio",
    apiBilling: "forbidden",
    tunnelEnabled: false,
    tasks: manager.store.tasks().length,
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
  app.post("/api/tasks", async (req) => manager.create(req.body));
  app.get<{ Params: { id: string } }>("/api/tasks/:id", async (req) => {
    const task = manager.store.getTask(req.params.id);
    let currentFingerprint: string | null = null;
    try {
      if (task.worktree) currentFingerprint = await fingerprint(task.worktree);
    } catch {}
    return {
      task,
      commands: manager.store.commands(task.id),
      evidenceValid:
        currentFingerprint !== null &&
        task.evidence.length === task.checks.length &&
        task.evidence.every(
          (e) => e.passed && e.fingerprint === currentFingerprint,
        ),
      approvals: manager.store
        .values<any>("approvals")
        .filter((a) => a.taskId === task.id && a.state === "pending"),
    };
  });
  app.post<{ Params: { id: string; action: string } }>(
    "/api/tasks/:id/:action",
    async (req) => {
      const input = (req.body ?? {}) as any;
      const id = req.params.id;
      switch (req.params.action) {
        case "send":
        case "steer":
          return manager.dispatch(id, req.params.action, input);
        case "verify":
          return manager.verify(id, input);
        case "complete":
          return manager.complete(
            id,
            commandSchema.parse(input),
            z.string().min(1).parse(input.report),
          );
        case "pause":
          return manager.pause(
            id,
            false,
            input.reason ?? "Paused by user",
            input,
          );
        case "release":
          return manager.pause(
            id,
            true,
            input.reason ?? "Released by user",
            input,
          );
        case "resume":
          return manager.resume(
            id,
            input.confirmPreviousWorkerStopped === true,
          );
        default:
          throw new DomainError("not_found", "Unknown action", 404);
      }
    },
  );
  app.post<{ Params: { id: string } }>("/api/approvals/:id", async (req) => {
    const input = z.object({ accept: z.boolean() }).parse(req.body);
    await manager.approve(req.params.id, input.accept);
    return { ok: true };
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
            serverInfo: { name: "kingdots", version: "0.1.0" },
            instructions:
              "Read task scope before issuing commands. Only direct user requests authorize work. Unknown delivery requires reconciliation. Provider approval and management resume are user-only controls. Completion needs independent evidence.",
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
