import { Store } from "./store.js";
import type { Adapter, BackendInfo } from "./adapters/types.js";
import type { BackendId } from "./domain.js";

// Provider discovery only. Existing-session supervision belongs to Observer.
export class Manager {
  constructor(
    readonly store: Store,
    readonly adapters: Map<BackendId, Adapter>,
    readonly dataDir: string,
    readonly executionBlock: (backend: BackendId) => string | null = () => null,
  ) {}
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
      for (const capability of info.capabilities) {
        if (capability.feature !== "read_existing") {
          capability.state = "unsupported";
          capability.notes =
            "Metadata adapters do not execute or own coding sessions";
          capability.evidence = null;
          capability.testedAt = null;
        }
      }
      const blocked = this.executionBlock(adapter.id);
      if (blocked) info.executionBlockedReason = blocked;
      return info;
    });
  }
  async close() {
    await Promise.allSettled([...this.adapters.values()].map((a) => a.close()));
  }
}
