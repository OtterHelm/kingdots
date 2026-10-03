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
import { RelayConnector, migrateRelay } from "./relay.js";
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
  const manager = new Manager(
    store,
    adapters,
    dataDir,
    () =>
      "Only existing-session observation is available; worker execution and model API billing are disabled.",
  );
  const events = new Events(store, vault);
  const appHost = new LocalAppHost();
  const observer = new Observer(store, adapters, appHost);
  await migrateRelay(dataDir, store, vault);
  const relay = new RelayConnector(store, vault, observer);
  events.authorizeOwner = (owner) => owner === "dots";
  return {
    dataDir,
    vault,
    store,
    manager,
    events,
    observer,
    appHost,
    relay,
    async close() {
      events.stop();
      await relay.close();
      await observer.close();
      await appHost.close();
      await manager.close();
      store.close();
    },
  };
}
