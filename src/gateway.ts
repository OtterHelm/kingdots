import Fastify from "fastify";
import { z } from "zod";
import { GatewayAuth, type GatewayGrant } from "./gateway-auth.js";
import { type Tool, callTool, toolDefinitions } from "./tools.js";
import { Events } from "./events.js";
import { DomainError } from "./domain.js";

const readTools = new Set([
  "watch_list",
  "watch_get",
  "watch_host_read",
  "events_read",
  "capabilities_list",
]);
const allowedTools = new Set([
  ...readTools,
  "watch_poll",
  "watch_instruction_prepare",
  "watch_instruction_send",
  "watch_pause",
  "watch_release",
  "watch_finish",
  "decision_ack",
]);
const rpcSchema = z.object({
  jsonrpc: z.literal("2.0").optional(),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.any().optional(),
});
const scopesFor = (name: string) =>
  readTools.has(name)
    ? ["kingdots:read"]
    : ["kingdots:read", "kingdots:manage"];
function scoped(grant: GatewayGrant, watchId: unknown) {
  if (typeof watchId !== "string" || !grant.watchIds.includes(watchId))
    throw new DomainError(
      "watch_scope",
      "This watch was not allowed in local consent",
      403,
    );
}

/** Separate loopback listener: only OAuth and scoped MCP, never the local dashboard/API. */
export function buildGateway(
  auth: GatewayAuth,
  registry: Tool[],
  events: Events,
) {
  const app = Fastify({ logger: false, bodyLimit: 256 * 1024 });
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) =>
      done(null, Object.fromEntries(new URLSearchParams(body as string))),
  );
  const rates = new Map<string, { at: number; count: number }>();
  app.addHook("onRequest", async (req, reply) => {
    const host = (req.headers.host ?? "").split(":")[0];
    const originHost = auth.origin ? new URL(auth.origin).hostname : null;
    if (
      !originHost ||
      (host !== originHost && host !== "127.0.0.1" && host !== "localhost")
    )
      return reply
        .code(403)
        .send({ error: "Untrusted gateway host or unconfigured origin" });
    if (req.headers.origin && req.headers.origin !== auth.origin)
      return reply.code(403).send({ error: "Untrusted Origin" });
    reply
      .header("cache-control", "no-store")
      .header("referrer-policy", "no-referrer")
      .header("x-content-type-options", "nosniff");
    if (req.url.startsWith("/oauth/")) {
      const key = req.ip + ":" + req.url.split("?")[0],
        old = rates.get(key);
      const rate =
        old && Date.now() - old.at < 60_000
          ? old
          : { at: Date.now(), count: 0 };
      rates.set(key, rate);
      if (++rate.count > 60)
        return reply.code(429).send({ error: "slow_down" });
      if (rates.size > 1000)
        for (const [k, r] of rates)
          if (Date.now() - r.at > 60_000) rates.delete(k);
    }
  });
  app.setErrorHandler((error, _req, reply) => {
    void reply
      .code(error instanceof DomainError ? error.status : 400)
      .send({
        error: error instanceof DomainError ? error.code : "invalid_request",
        error_description:
          error instanceof Error ? error.message : "Invalid request",
      });
  });
  app.get("/.well-known/oauth-authorization-server", async () => {
    auth.resource();
    return auth.metadata();
  });
  const protectedMetadata = async () => ({
    resource: auth.resource(),
    authorization_servers: [auth.origin],
    scopes_supported: ["kingdots:read", "kingdots:manage"],
  });
  app.get("/.well-known/oauth-protected-resource", protectedMetadata);
  app.get("/.well-known/oauth-protected-resource/mcp", protectedMetadata);
  app.post("/oauth/register", async (req, reply) =>
    reply.code(201).send(auth.register(req.body)),
  );
  app.get("/oauth/authorize", async (req, reply) => {
    const started = auth.begin(req.query);
    reply.header(
      "set-cookie",
      `kd_oauth_${started.id}=${started.browserSecret}; Path=/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    );
    // Browser carries the original consent cookie. Code/redirect are never available
    // through an unauthenticated JSON polling endpoint.
    return reply
      .type("text/html")
      .header(
        "content-security-policy",
        "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
      )
      .send(
        `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="3;url=/oauth/continue?id=${started.id}"><title>kingdots connection</title><h1>Approve in your local kingdots dashboard</h1><p>Match this code: <strong>${started.displayCode}</strong></p><p>Run kingdots open on your PC, open Connections, and select the existing watches and permissions. This window will continue after local approval.</p>`,
      );
  });
  app.get("/oauth/continue", async (req, reply) => {
    const id = z
      .string()
      .uuid()
      .parse((req.query as any).id);
    const cookie =
      (req.headers.cookie ?? "")
        .split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith(`kd_oauth_${id}=`))
        ?.split("=")
        .slice(1)
        .join("=") ?? "";
    const redirect = auth.continuation(id, cookie);
    if (redirect) return reply.redirect(redirect);
    return reply
      .type("text/html")
      .header(
        "content-security-policy",
        "default-src 'none'; frame-ancestors 'none'",
      )
      .send(
        `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="3;url=/oauth/continue?id=${id}"><title>kingdots connection</title><p>Waiting for approval in your local kingdots dashboard.</p>`,
      );
  });
  app.post("/oauth/token", async (req) => auth.token(req.body));
  app.post("/oauth/revoke", async (req) => {
    const input = req.body as any;
    auth.revokeToken(String(input.client_id ?? ""), String(input.token ?? ""));
    return {};
  });
  app.post("/mcp", async (req, reply) => {
    let grant: GatewayGrant;
    try {
      grant = auth.verify(
        (req.headers.authorization ?? "").replace(/^Bearer /, ""),
      );
    } catch {
      return reply
        .code(401)
        .header(
          "www-authenticate",
          `Bearer resource_metadata="${auth.origin}/.well-known/oauth-protected-resource/mcp"`,
        )
        .send({ error: "invalid_token" });
    }
    const input = rpcSchema.parse(req.body);
    if (input.id === undefined) return reply.code(202).send();
    const permitted = registry.filter((t) => allowedTools.has(t.name));
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
            serverInfo: { name: "kingdots", version: "0.1.2" },
            instructions:
              "Dots decides. Use only locally consented existing watches. Read host state, prepare and send through the local bridge; no new sessions or permission approvals. Unknown sends are never retried. Actual unattended acceptance remains unverified.",
          };
          break;
        case "ping":
          result = {};
          break;
        case "tools/list":
          result = {
            tools: toolDefinitions(permitted).map((t) => ({
              ...t,
              securitySchemes: [{ type: "oauth2", scopes: scopesFor(t.name) }],
            })),
          };
          break;
        case "tools/call": {
          const name = String(input.params?.name),
            args = input.params?.arguments ?? {};
          if (!allowedTools.has(name))
            throw new DomainError(
              "tool_not_allowed",
              "Tool is not exposed by the gateway",
              403,
            );
          if (scopesFor(name).some((scope) => !grant.scopes.includes(scope)))
            throw new DomainError(
              "insufficient_scope",
              "Local consent did not allow management",
              403,
            );
          if (args.watchId !== undefined) scoped(grant, args.watchId);
          if (name === "decision_ack") {
            const row = auth.store.db
              .prepare("SELECT body FROM events WHERE id=?")
              .get(args.eventId) as { body: string } | undefined;
            scoped(grant, row ? JSON.parse(row.body).taskId : undefined);
          }
          let value: unknown =
            name === "capabilities_list"
              ? {
                  backend: "codex-app",
                  transport: "app_host",
                  writeLimitations: [
                    "Host idle check is not atomic",
                    "Actual Dots unattended acceptance remains unverified",
                  ],
                }
              : await callTool(permitted, name, args);
          if (name === "watch_list")
            value = (value as any[]).filter((w) =>
              grant.watchIds.includes(w.id),
            );
          if (name === "events_read")
            value = (value as any[]).filter((e) =>
              grant.watchIds.includes(e.taskId),
            );
          if (name === "capabilities_list")
            value = {
              backend: "codex-app",
              transport: "app_host",
              writeLimitations: [
                "Host idle check is not atomic",
                "Actual Dots unattended acceptance remains unverified",
              ],
            };
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
        case "events/subscribe": {
          scoped(grant, input.params?.arguments?.taskId);
          result = await events.subscribe(input.params, grant.id);
          if (auth.grant(grant.id).revoked) {
            events.unsubscribe(input.params, grant.id);
            throw new DomainError(
              "invalid_token",
              "Access was revoked during subscription",
              401,
            );
          }
          break;
        }
        case "events/unsubscribe": {
          scoped(grant, input.params?.arguments?.taskId);
          result = events.unsubscribe(input.params, grant.id);
          break;
        }
        default:
          return {
            jsonrpc: "2.0",
            id: input.id,
            error: { code: -32601, message: "Method not supported" },
          };
      }
      return { jsonrpc: "2.0", id: input.id, result };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: input.id,
        error: {
          code:
            error instanceof DomainError &&
            error.code === "callback_verification_failed"
              ? -32015
              : -32602,
          message: (error as Error).message,
        },
      };
    }
  });
  app.get("/mcp", async (_req, reply) =>
    reply.code(405).header("allow", "POST").send(),
  );
  app.delete("/mcp", async (_req, reply) =>
    reply.code(405).header("allow", "POST").send(),
  );
  return app;
}
