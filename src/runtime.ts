import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { Store } from "./store.js";
import { Vault } from "./vault.js";
import { Manager } from "./manager.js";
import { Events } from "./events.js";
import { Observer } from "./watch.js";
import { CodexAdapter } from "./adapters/codex.js";
import { ClaudeAdapter } from "./adapters/claude.js";
import { OpenCodeAdapter } from "./adapters/opencode.js";
import { UnverifiedAppAdapter } from "./adapters/unverified.js";
import type { Adapter } from "./adapters/types.js";
import type { BackendId } from "./domain.js";
import { LocalAppHost } from "./app-host.js";
import { GatewayAuth } from "./gateway-auth.js";
export function defaultDataDir() {
  if (process.env.KINGDOTS_HOME !== undefined)
    return resolve(process.env.KINGDOTS_HOME);
  const root = process.env.LOCALAPPDATA ?? join(homedir(), ".local", "state");
  const current = resolve(root, "kingdots");
  const legacy = resolve(root, "DotsKing");
  // Preserve existing records, credentials and installed MCP paths in place.
  return !existsSync(current) && existsSync(legacy) ? legacy : current;
}
export async function runtime(dataDir = defaultDataDir()) {
  await mkdir(dataDir, { recursive: true });
  const vault = await Vault.open(join(dataDir, "secrets.bin"));
  const store = new Store(join(dataDir, "kingdots.sqlite"));
  const adapters = new Map<BackendId, Adapter>([
    ["codex-cli", new CodexAdapter()],
    ["claude-code", new ClaudeAdapter()],
    ["opencode-cli", new OpenCodeAdapter(dataDir)],
    ["codex-app", new UnverifiedAppAdapter("codex-app")],
    ["claude-app", new UnverifiedAppAdapter("claude-app")],
  ]);
  const manager = new Manager(store, adapters, dataDir, (backend) =>
    backend === "codex-cli"
      ? null
      : "API billing is forbidden. Execution is disabled until a subscription or local model connection is independently verified; stored session reading remains available.",
  );
  const events = new Events(store, vault);
  const appHost = new LocalAppHost();
  const observer = new Observer(store, adapters, appHost);
  const gatewayAuth = new GatewayAuth(store);
  events.authorizeOwner = (owner) => {
    if (owner === "dots") return true;
    try {
      const grant = gatewayAuth.grant(owner);
      return !grant.revoked && grant.origin === gatewayAuth.origin;
    } catch {
      return false;
    }
  };
  gatewayAuth.onRevoke = (grant) => {
    for (const watchId of grant.watchIds) {
      if (grant.scopes.includes("kingdots:manage")) observer.pause(watchId);
    }
    for (const sub of store.values<{
      owner: string;
      name: string;
      taskId: string;
      url: string;
    }>("subscriptions"))
      if (sub.owner === grant.id)
        events.unsubscribe(
          {
            name: sub.name,
            arguments: { taskId: sub.taskId },
            delivery: { url: sub.url },
          },
          grant.id,
        );
  };
  return {
    dataDir,
    vault,
    store,
    manager,
    events,
    observer,
    appHost,
    gatewayAuth,
    async close() {
      events.stop();
      await observer.close();
      await appHost.close();
      await manager.close();
      store.close();
    },
  };
}
