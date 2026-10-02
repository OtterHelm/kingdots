import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { Store } from "../src/store.js";
import { GatewayAuth } from "../src/gateway-auth.js";
import { buildGateway } from "../src/gateway.js";
import { Events } from "../src/events.js";
import { Observer } from "../src/watch.js";
import type { Tool } from "../src/tools.js";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

function setup() {
  const store = new Store(":memory:"),
    auth = new GatewayAuth(store),
    observer = new Observer(store, new Map());
  auth.configure("https://gateway.example");
  const makeWatch = () =>
    observer.create({
      goal: "Existing session",
      sessions: [
        {
          backend: "codex-app",
          source: "app_host",
          sessionId: randomBytes(8).toString("hex"),
          project: "/project",
        },
      ],
      completionConditions: ["Done"],
      allowedFollowUp: "Scoped follow-up",
      authorization: {
        source: "direct_user_request",
        request: "Watch this existing session",
      },
    });
  const watch = makeWatch(),
    other = makeWatch();
  const client = auth.register({
    redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
    client_name: "ChatGPT",
    token_endpoint_auth_method: "none",
  });
  const verifier = randomBytes(32).toString("base64url"),
    challenge = createHash("sha256").update(verifier).digest("base64url");
  const request = () =>
    auth.begin({
      client_id: client.client_id,
      redirect_uri: client.redirect_uris[0],
      response_type: "code",
      state: "state",
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: "kingdots:read kingdots:manage",
      resource: auth.resource(),
    });
  const link = (manage = false) => {
    const r = request();
    const grant = auth.approve(
      r.id,
      r.displayCode,
      [watch.id],
      manage ? ["kingdots:read", "kingdots:manage"] : ["kingdots:read"],
    );
    const redirect = new URL(auth.continuation(r.id, r.browserSecret)!);
    const params = {
      grant_type: "authorization_code",
      client_id: client.client_id,
      redirect_uri: client.redirect_uris[0],
      code: redirect.searchParams.get("code"),
      code_verifier: verifier,
      resource: auth.resource(),
    };
    const tokens = auth.token(params);
    return { r, grant, redirect, params, tokens };
  };
  return {
    store,
    auth,
    observer,
    watch,
    other,
    client,
    verifier,
    request,
    link,
    close: async () => {
      await observer.close();
      store.close();
    },
  };
}

test("OAuth requires local consent, original browser cookie, exact callback/resource and S256 PKCE", async () => {
  const f = setup();
  try {
    assert.throws(
      () =>
        f.auth.register({
          redirect_uris: ["https://attacker.example/callback"],
        }),
      /ChatGPT/,
    );
    const r = f.request();
    assert.equal(f.auth.continuation(r.id, r.browserSecret), null);
    assert.throws(() => f.auth.continuation(r.id, "wrong"), /browser session/);
    assert.throws(
      () => f.auth.approve(r.id, "wrong", [f.watch.id], ["kingdots:read"]),
      /mismatched/,
    );
    f.auth.approve(r.id, r.displayCode, [f.watch.id], ["kingdots:read"]);
    const uri = new URL(f.auth.continuation(r.id, r.browserSecret)!);
    assert.equal(uri.searchParams.get("state"), "state");
    assert.equal(uri.searchParams.get("iss"), "https://gateway.example");
    const p = {
      grant_type: "authorization_code",
      client_id: f.client.client_id,
      code: uri.searchParams.get("code"),
      redirect_uri: f.client.redirect_uris[0],
      resource: f.auth.resource(),
      code_verifier: f.verifier,
    };
    assert.throws(
      () => f.auth.token({ ...p, resource: "https://attacker.example/mcp" }),
      /resource/,
    );
    assert.throws(
      () => f.auth.token({ ...p, code_verifier: "x".repeat(43) }),
      /PKCE/,
    );
    const tokens = f.auth.token(p);
    assert.deepEqual(f.auth.verify(tokens.access_token).watchIds, [f.watch.id]);
    assert.throws(() => f.auth.token(p), /PKCE/);
  } finally {
    await f.close();
  }
});
test("refresh rotates, cannot broaden scopes, and revocation/issuer change invalidate tokens", async () => {
  const f = setup();
  try {
    const l = f.link();
    const request = {
      grant_type: "refresh_token",
      client_id: f.client.client_id,
      refresh_token: l.tokens.refresh_token,
      resource: f.auth.resource(),
    };
    assert.throws(
      () =>
        f.auth.token({ ...request, scope: "kingdots:read kingdots:manage" }),
      /scopes changed/,
    );
    const renewed = f.auth.token(request);
    assert.throws(() => f.auth.token(request), /invalid or expired/);
    f.auth.revokeGrant(l.grant.id);
    assert.throws(() => f.auth.verify(renewed.access_token), /revoked/);
    const next = f.link();
    f.auth.configure("https://new.example");
    assert.throws(
      () => f.auth.verify(next.tokens.access_token),
      /invalid or expired/,
    );
  } finally {
    await f.close();
  }
});
test("only one gateway commander is granted per watch", async () => {
  const f = setup();
  try {
    f.link(true);
    const r = f.request();
    assert.throws(
      () =>
        f.auth.approve(
          r.id,
          r.displayCode,
          [f.watch.id],
          ["kingdots:read", "kingdots:manage"],
        ),
      /commander/,
    );
  } finally {
    await f.close();
  }
});
test("gateway exposes no local API, rejects unauthenticated calls, and confines reads/writes to consented watches", async () => {
  const f = setup();
  let writes = 0;
  const registry: Tool[] = [
    {
      name: "watch_list",
      description: "List",
      schema: z.object({}),
      readOnly: true,
      run: async () => f.store.watches(),
    },
    {
      name: "watch_get",
      description: "Read",
      schema: z.object({ watchId: z.string() }),
      readOnly: true,
      run: async (p) => f.store.getWatch(p.watchId),
    },
    {
      name: "watch_instruction_send",
      description: "Send",
      schema: z.object({ watchId: z.string() }),
      readOnly: false,
      run: async () => {
        writes++;
        return {};
      },
    },
  ];
  const app = buildGateway(
    f.auth,
    registry,
    new Events(f.store, { get: () => undefined, set: async () => {} }),
  );
  const headers = {
    host: "gateway.example",
    "content-type": "application/json",
  };
  const call = (token: string, name: string, args: any = {}) =>
    app.inject({
      method: "POST",
      url: "/mcp",
      headers: { ...headers, authorization: "Bearer " + token },
      payload: {
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      },
    });
  try {
    assert.equal(
      (await app.inject({ url: "/api/watches", headers })).statusCode,
      404,
    );
    assert.equal((await call("invalid", "watch_list")).statusCode, 401);
    const l = f.link();
    const list = (await call(l.tokens.access_token, "watch_list")).json();
    assert.deepEqual(
      JSON.parse(list.result.content[0].text).map((w: any) => w.id),
      [f.watch.id],
    );
    assert.match(
      (await call(l.tokens.access_token, "watch_get", { watchId: f.other.id }))
        .body,
      /not allowed/,
    );
    assert.match(
      (
        await call(l.tokens.access_token, "watch_instruction_send", {
          watchId: f.watch.id,
        })
      ).body,
      /did not allow management/,
    );
    assert.match(
      (await call(l.tokens.access_token, "watch_create")).body,
      /not exposed/,
    );
    assert.equal(writes, 0);
    const m = f.link(true);
    await call(m.tokens.access_token, "watch_instruction_send", {
      watchId: f.watch.id,
    });
    assert.equal(writes, 1);
    f.auth.revokeGrant(m.grant.id);
    assert.equal(
      (
        await call(m.tokens.access_token, "watch_instruction_send", {
          watchId: f.watch.id,
        })
      ).statusCode,
      401,
    );
    assert.equal(writes, 1);
    assert.equal(
      (
        await app.inject({
          url: "/.well-known/oauth-authorization-server",
          headers: { host: "attacker.example" },
        })
      ).statusCode,
      403,
    );
  } finally {
    await app.close();
    await f.close();
  }
});
test("HTTP authorization cannot return a code without the original browser cookie", async () => {
  const f = setup(),
    app = buildGateway(
      f.auth,
      [],
      new Events(f.store, { get: () => undefined, set: async () => {} }),
    );
  try {
    const challenge = createHash("sha256")
      .update(f.verifier)
      .digest("base64url");
    const q = new URLSearchParams({
      client_id: f.client.client_id,
      redirect_uri: f.client.redirect_uris[0],
      response_type: "code",
      state: "state",
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: "kingdots:read",
      resource: f.auth.resource(),
    });
    const started = await app.inject({
      url: "/oauth/authorize?" + q,
      headers: { host: "gateway.example" },
    });
    const pending = f.auth.pending()[0];
    f.auth.approve(
      pending.id,
      pending.displayCode,
      [f.watch.id],
      ["kingdots:read"],
    );
    const continued = "/oauth/continue?id=" + pending.id;
    assert.equal(
      (
        await app.inject({
          url: continued,
          headers: { host: "gateway.example" },
        })
      ).statusCode,
      400,
    );
    const cookie = String(started.headers["set-cookie"]).split(";")[0];
    const accepted = await app.inject({
      url: continued,
      headers: { host: "gateway.example", cookie },
    });
    assert.equal(accepted.statusCode, 302);
    assert.ok(accepted.headers.location?.includes("code="));
    assert.equal(
      (
        await app.inject({
          url: continued,
          headers: { host: "gateway.example", cookie },
        })
      ).statusCode,
      400,
    );
  } finally {
    await app.close();
    await f.close();
  }
});
test("official MCP SDK reaches the scoped stateless gateway with an issued token", async () => {
  const f = setup(),
    linked = f.link();
  const registry: Tool[] = [
    {
      name: "watch_list",
      description: "Scoped watches",
      schema: z.object({}),
      readOnly: true,
      run: async () => f.store.watches(),
    },
  ];
  const app = buildGateway(
    f.auth,
    registry,
    new Events(f.store, { get: () => undefined, set: async () => {} }),
  );
  const url = await app.listen({ host: "127.0.0.1", port: 0 });
  const client = new Client({ name: "gateway-check", version: "1.0.0" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url + "/mcp"), {
        requestInit: {
          headers: { authorization: "Bearer " + linked.tokens.access_token },
        },
      }),
    );
    assert.deepEqual(
      (await client.listTools()).tools.map((t) => t.name),
      ["watch_list"],
    );
    const result = await client.callTool({ name: "watch_list", arguments: {} });
    assert.deepEqual(
      JSON.parse((result.content as any)[0].text).map((w: any) => w.id),
      [f.watch.id],
    );
  } finally {
    await client.close();
    await app.close();
    await f.close();
  }
});
test("event subscriptions are scoped and revoked owners receive no queued event data", async () => {
  const f = setup(),
    linked = f.link(),
    delivered: any[] = [],
    secrets = new Map<string, string>();
  const events = new Events(
    f.store,
    {
      get: (key) => secrets.get(key),
      set: async (key, value) => {
        secrets.set(key, value);
      },
    },
    async (_url, body) => {
      const value = JSON.parse(body);
      delivered.push(value);
      return {
        status: 200,
        body: JSON.stringify({ challenge: value.challenge }),
      };
    },
  );
  events.authorizeOwner = (owner) => !f.auth.grant(owner).revoked;
  const app = buildGateway(f.auth, [], events);
  const subscribe = (watchId: string) =>
    app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        host: "gateway.example",
        authorization: "Bearer " + linked.tokens.access_token,
      },
      payload: {
        id: 1,
        method: "events/subscribe",
        params: {
          name: "task.attention_required",
          arguments: { taskId: watchId },
          delivery: {
            mode: "webhook",
            url: "https://callback.example/events",
            secret: "whsec_" + randomBytes(32).toString("base64"),
          },
        },
      },
    });
  try {
    assert.match((await subscribe(f.other.id)).body, /not allowed/);
    assert.equal(delivered.length, 0);
    const result = (await subscribe(f.watch.id)).json();
    assert.ok(result.result.id);
    assert.equal(
      f.store.values<any>("subscriptions")[0].owner,
      linked.grant.id,
    );
    f.auth.revokeGrant(linked.grant.id);
    await events.flush();
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].type, "verification");
  } finally {
    await app.close();
    await f.close();
  }
});
