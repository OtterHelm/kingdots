import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { Store } from "./store.js";
import { DomainError } from "./domain.js";

const hash = (text: string) =>
  createHash("sha256").update(text).digest("base64url");
const secret = () => randomBytes(32).toString("base64url");
const equal = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const scopes = ["kingdots:read", "kingdots:manage"];
export interface GatewayGrant {
  id: string;
  clientId: string;
  origin: string;
  watchIds: string[];
  scopes: string[];
  createdAt: number;
  revoked: boolean;
}
interface ClientRecord {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method: "none";
}
interface RequestRecord {
  kind: "gateway_oauth_request";
  id: string;
  displayCode: string;
  clientId: string;
  redirect: string;
  state: string;
  challenge: string;
  origin: string;
  scopes: string[];
  expiresAt: number;
  browserHash: string;
  grantId?: string;
  consumed?: boolean;
}
interface CodeRecord {
  clientId: string;
  redirect: string;
  challenge: string;
  grantId: string;
  resource: string;
  expiresAt: number;
  consumed: boolean;
}
interface TokenRecord {
  grantId: string;
  clientId: string;
  resource: string;
  expiresAt: number;
  consumed?: boolean;
}

/** Single-user OAuth: consent can only be completed through the authenticated loopback UI. */
export class GatewayAuth {
  onRevoke: (grant: GatewayGrant) => void = () => {};
  constructor(readonly store: Store) {}
  get origin() {
    return this.store.get<string>("settings", "gateway_origin");
  }
  configure(value: string) {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new DomainError(
        "invalid_origin",
        "Use an HTTPS origin without credentials, path or query",
        400,
      );
    if (
      url.hostname === "localhost" ||
      /^[\d.]+$/.test(url.hostname) ||
      url.hostname.includes(":")
    )
      throw new DomainError(
        "invalid_origin",
        "Use the actual HTTPS gateway hostname",
        400,
      );
    if (this.origin !== url.origin)
      for (const grant of this.grants()) this.revokeGrant(grant.id);
    this.store.put("settings", "gateway_origin", url.origin);
    return this.info();
  }
  info() {
    return {
      configured: Boolean(this.origin),
      publicOrigin: this.origin,
      authorization: "OAuth 2.1 / S256 PKCE / local consent",
      externalConnectionVerified: false,
    };
  }
  resource() {
    if (!this.origin)
      throw new DomainError(
        "gateway_unconfigured",
        "Configure the HTTPS gateway origin locally before linking",
        503,
      );
    return this.origin + "/mcp";
  }
  metadata() {
    return {
      issuer: this.origin,
      authorization_endpoint: this.origin + "/oauth/authorize",
      token_endpoint: this.origin + "/oauth/token",
      registration_endpoint: this.origin + "/oauth/register",
      revocation_endpoint: this.origin + "/oauth/revoke",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: scopes,
      authorization_response_iss_parameter_supported: true,
    };
  }
  register(input: any): ClientRecord {
    if (
      input.token_endpoint_auth_method &&
      input.token_endpoint_auth_method !== "none"
    )
      throw new DomainError(
        "invalid_client_metadata",
        "Only PKCE public-client registration is supported",
        400,
      );
    const redirects = input.redirect_uris;
    if (
      !Array.isArray(redirects) ||
      !redirects.length ||
      redirects.length > 8 ||
      !redirects.every((raw: unknown) => {
        if (typeof raw !== "string") return false;
        try {
          const u = new URL(raw);
          return (
            u.protocol === "https:" &&
            u.host === "chatgpt.com" &&
            !u.username &&
            !u.password &&
            !u.search &&
            !u.hash &&
            (u.pathname === "/connector_platform_oauth_redirect" ||
              /^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(u.pathname))
          );
        } catch {
          return false;
        }
      })
    )
      throw new DomainError(
        "invalid_redirect",
        "Only exact ChatGPT connector callbacks may be registered",
        400,
      );
    const client: ClientRecord = {
      client_id: randomUUID(),
      client_name: String(input.client_name ?? "ChatGPT").slice(0, 120),
      redirect_uris: redirects,
      token_endpoint_auth_method: "none",
    };
    this.store.put("settings", "oauth_client:" + client.client_id, client);
    return client;
  }
  private client(id: string) {
    const client = this.store.get<ClientRecord>(
      "settings",
      "oauth_client:" + id,
    );
    if (!client)
      throw new DomainError("invalid_client", "Unknown OAuth client", 400);
    return client;
  }
  private validScopes(input: string[]) {
    if (
      !input.length ||
      !input.includes(scopes[0]) ||
      input.some((s) => !scopes.includes(s))
    )
      throw new DomainError(
        "invalid_scope",
        "Choose kingdots:read and optionally kingdots:manage",
        400,
      );
    return [...new Set(input)];
  }
  begin(input: any) {
    const client = this.client(String(input.client_id ?? ""));
    const requested = this.validScopes(
      String(input.scope ?? scopes[0])
        .split(" ")
        .filter(Boolean),
    );
    if (
      input.response_type !== "code" ||
      input.code_challenge_method !== "S256" ||
      !/^[A-Za-z0-9_-]{43}$/.test(input.code_challenge ?? "") ||
      !client.redirect_uris.includes(input.redirect_uri) ||
      input.resource !== this.resource() ||
      typeof input.state !== "string" ||
      !input.state ||
      input.state.length > 2048
    )
      throw new DomainError(
        "invalid_request",
        "Exact redirect, resource, state and S256 PKCE are required",
        400,
      );
    const browserSecret = secret();
    const req: RequestRecord = {
      kind: "gateway_oauth_request",
      id: randomUUID(),
      displayCode: randomBytes(5).toString("hex").toUpperCase(),
      clientId: client.client_id,
      redirect: input.redirect_uri,
      state: input.state,
      challenge: input.code_challenge,
      origin: this.origin!,
      scopes: requested,
      expiresAt: Date.now() + 600_000,
      browserHash: hash(browserSecret),
    };
    this.store.put("approvals", req.id, req);
    return { id: req.id, displayCode: req.displayCode, browserSecret };
  }
  pending() {
    return this.store
      .values<RequestRecord>("approvals")
      .filter(
        (r) =>
          r.kind === "gateway_oauth_request" &&
          r.expiresAt > Date.now() &&
          !r.consumed &&
          !r.grantId,
      )
      .map((r) => ({
        id: r.id,
        displayCode: r.displayCode,
        clientName: this.client(r.clientId).client_name,
        clientId: r.clientId,
        scopes: r.scopes,
        expiresAt: r.expiresAt,
      }));
  }
  approve(
    id: string,
    displayCode: string,
    watchIds: string[],
    approvedScopes: string[],
  ) {
    const req = this.store.get<RequestRecord>("approvals", id);
    if (
      !req ||
      req.kind !== "gateway_oauth_request" ||
      req.consumed ||
      req.grantId ||
      req.expiresAt <= Date.now() ||
      req.origin !== this.origin ||
      !equal(req.displayCode, displayCode)
    )
      throw new DomainError(
        "invalid_consent",
        "Consent request is missing, expired, consumed or mismatched",
        400,
      );
    const selected = this.validScopes(approvedScopes);
    if (!watchIds.length || selected.some((s) => !req.scopes.includes(s)))
      throw new DomainError(
        "invalid_consent",
        "Choose existing watches and a subset of the requested scopes",
        400,
      );
    const ids = [...new Set(watchIds)];
    for (const wid of ids) {
      const watch = this.store.getWatch(wid);
      if (
        watch.sessions.some(
          (s) => s.source !== "app_host" || s.backend !== "codex-app",
        )
      )
        throw new DomainError(
          "gateway_watch_scope",
          "The gateway currently supports selected app-host Codex watches only",
          400,
        );
      const owner = this.store.get<string>(
        "settings",
        "gateway_manager:" + wid,
      );
      if (selected.includes(scopes[1]) && owner && !this.grant(owner).revoked)
        throw new DomainError(
          "manager_exists",
          "This watch already has a gateway commander",
        );
    }
    const grant: GatewayGrant = {
      id: randomUUID(),
      clientId: req.clientId,
      origin: req.origin,
      watchIds: ids,
      scopes: selected,
      createdAt: Date.now(),
      revoked: false,
    };
    this.store.transaction(() => {
      this.store.put("settings", "oauth_grant:" + grant.id, grant);
      this.store.put("approvals", id, { ...req, grantId: grant.id });
      this.store.put("settings", "gateway_grant_ids", [
        ...(this.store.get<string[]>("settings", "gateway_grant_ids") ?? []),
        grant.id,
      ]);
      if (selected.includes(scopes[1]))
        for (const wid of ids)
          this.store.put("settings", "gateway_manager:" + wid, grant.id);
    });
    return grant;
  }
  continuation(id: string, browserSecret: string) {
    const req = this.store.get<RequestRecord>("approvals", id);
    if (
      !req ||
      req.kind !== "gateway_oauth_request" ||
      req.expiresAt <= Date.now() ||
      req.origin !== this.origin ||
      !equal(req.browserHash, hash(browserSecret)) ||
      req.consumed
    )
      throw new DomainError(
        "invalid_request",
        "OAuth browser session is invalid or expired",
        400,
      );
    if (!req.grantId) return null;
    const grant = this.grant(req.grantId);
    if (grant.revoked)
      throw new DomainError("access_denied", "Access was revoked", 403);
    const code = secret();
    this.store.transaction(() => {
      this.store.put("settings", "oauth_code:" + hash(code), {
        clientId: req.clientId,
        redirect: req.redirect,
        challenge: req.challenge,
        grantId: grant.id,
        resource: this.resource(),
        expiresAt: Date.now() + 120_000,
        consumed: false,
      } satisfies CodeRecord);
      this.store.put("approvals", id, { ...req, consumed: true });
    });
    const redirect = new URL(req.redirect);
    redirect.searchParams.set("code", code);
    redirect.searchParams.set("state", req.state);
    redirect.searchParams.set("iss", this.origin!);
    return redirect.toString();
  }
  private issue(grant: GatewayGrant) {
    const access = secret(),
      refresh = secret();
    this.store.put("settings", "oauth_access:" + hash(access), {
      grantId: grant.id,
      clientId: grant.clientId,
      resource: this.resource(),
      expiresAt: Date.now() + 3_600_000,
    } satisfies TokenRecord);
    this.store.put("settings", "oauth_refresh:" + hash(refresh), {
      grantId: grant.id,
      clientId: grant.clientId,
      resource: this.resource(),
      expiresAt: Date.now() + 7 * 86_400_000,
    } satisfies TokenRecord);
    return {
      access_token: access,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: refresh,
      scope: grant.scopes.join(" "),
    };
  }
  token(input: any) {
    const client = this.client(String(input.client_id ?? ""));
    if (input.resource !== this.resource())
      throw new DomainError(
        "invalid_target",
        "Token resource must match this MCP endpoint",
        400,
      );
    if (input.grant_type === "authorization_code") {
      const key = "oauth_code:" + hash(String(input.code ?? "")),
        code = this.store.get<CodeRecord>("settings", key);
      if (
        !code ||
        code.consumed ||
        code.clientId !== client.client_id ||
        code.redirect !== input.redirect_uri ||
        code.resource !== input.resource ||
        code.expiresAt <= Date.now() ||
        typeof input.code_verifier !== "string" ||
        !/^[A-Za-z0-9._~-]{43,128}$/.test(input.code_verifier) ||
        !equal(code.challenge, hash(input.code_verifier))
      )
        throw new DomainError(
          "invalid_grant",
          "Authorization code or PKCE verification failed",
          400,
        );
      const grant = this.grant(code.grantId);
      if (grant.revoked || grant.origin !== this.origin)
        throw new DomainError("invalid_grant", "Access was revoked", 400);
      return this.store.transaction(() => {
        this.store.put("settings", key, { ...code, consumed: true });
        return this.issue(grant);
      });
    }
    if (input.grant_type === "refresh_token") {
      const key = "oauth_refresh:" + hash(String(input.refresh_token ?? "")),
        token = this.store.get<TokenRecord>("settings", key);
      if (
        !token ||
        token.consumed ||
        token.clientId !== client.client_id ||
        token.resource !== input.resource ||
        token.expiresAt <= Date.now()
      )
        throw new DomainError(
          "invalid_grant",
          "Refresh token is invalid or expired",
          400,
        );
      const grant = this.grant(token.grantId);
      if (
        grant.revoked ||
        grant.origin !== this.origin ||
        (input.scope && input.scope !== grant.scopes.join(" "))
      )
        throw new DomainError("invalid_grant", "Access or scopes changed", 400);
      return this.store.transaction(() => {
        this.store.put("settings", key, { ...token, consumed: true });
        return this.issue(grant);
      });
    }
    throw new DomainError(
      "unsupported_grant_type",
      "Only authorization code and rotating refresh grants are supported",
      400,
    );
  }
  grant(id: string) {
    const grant = this.store.get<GatewayGrant>("settings", "oauth_grant:" + id);
    if (!grant)
      throw new DomainError("invalid_grant", "Grant is unavailable", 401);
    return grant;
  }
  verify(token: string) {
    const record = this.store.get<TokenRecord>(
      "settings",
      "oauth_access:" + hash(token),
    );
    if (
      !record ||
      record.expiresAt <= Date.now() ||
      record.resource !== this.resource()
    )
      throw new DomainError(
        "invalid_token",
        "Access token is invalid or expired",
        401,
      );
    const grant = this.grant(record.grantId);
    if (grant.revoked || grant.origin !== this.origin)
      throw new DomainError("invalid_token", "Access was revoked", 401);
    return grant;
  }
  grants() {
    return (
      this.store.get<string[]>("settings", "gateway_grant_ids") ?? []
    ).map((id) => this.grant(id));
  }
  revokeGrant(id: string) {
    const grant = this.grant(id);
    if (grant.revoked) return;
    this.store.put("settings", "oauth_grant:" + id, {
      ...grant,
      revoked: true,
    });
    for (const wid of grant.watchIds)
      if (this.store.get("settings", "gateway_manager:" + wid) === id)
        this.store.put("settings", "gateway_manager:" + wid, null);
    this.onRevoke(grant);
  }
  revokeToken(clientId: string, token: string) {
    const record =
      this.store.get<TokenRecord>("settings", "oauth_access:" + hash(token)) ??
      this.store.get<TokenRecord>("settings", "oauth_refresh:" + hash(token));
    if (record?.clientId === clientId) this.revokeGrant(record.grantId);
  }
}
