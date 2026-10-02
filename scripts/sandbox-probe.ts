import { CodexAdapter } from "../src/adapters/codex.js";
import type { Task } from "../src/domain.js";
const adapter = new CodexAdapter();
try {
  const result = await adapter.executeCheck(
    [process.execPath, "--version"],
    { worktree: process.cwd(), scope: { allowNetwork: false } } as Task,
    10_000,
    new AbortController().signal,
  );
  process.stdout.write(JSON.stringify(result) + "\n");
  if (result.exitCode !== 0) process.exitCode = 1;
} finally {
  await adapter.close();
}
