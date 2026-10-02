import { test } from "node:test";
import assert from "node:assert/strict";
import type { Options, query } from "@anthropic-ai/claude-agent-sdk";
import { ClaudeAdapter } from "../src/adapters/claude.js";
import { fixture, repaired } from "./helpers.js";

test("Claude never treats a saved argv joined as shell text as automatic permission", async () => {
  const f = await fixture();
  let options: Options | undefined;
  const adapter = new ClaudeAdapter((input) => {
    options = input.options;
    return {
      async *[Symbol.asyncIterator]() {},
      async interrupt() {},
      close() {},
    } as unknown as ReturnType<typeof query>;
  });
  const approvals: string[] = [];
  adapter.onEvent = (event) => {
    if (event.type === "approval") approvals.push(event.approvalId);
  };
  try {
    const task = await repaired(f);
    task.checks[0].argv = ["node", "-e", "console.log('ok'); echo injected"];
    const session = await adapter.create(task);
    await adapter.send(
      session.id,
      "Scoped fixture work",
      "fixture-command",
      task,
    );
    assert.ok(options?.canUseTool);
    const hook = options.hooks?.PreToolUse?.[0].hooks[0];
    assert.ok(hook);
    const command = task.checks[0].argv.join(" ");
    const signal = new AbortController().signal;
    const hookResult = await hook(
      {
        hook_event_name: "PreToolUse",
        session_id: session.id,
        cwd: task.worktree!,
        transcript_path: "fixture",
        tool_name: "Bash",
        tool_input: { command },
        tool_use_id: "fixture",
      },
      "fixture",
      { signal },
    );
    assert.equal(
      (hookResult as any).hookSpecificOutput.permissionDecision,
      "ask",
    );
    const decision = options.canUseTool(
      "Bash",
      { command },
      { signal, toolUseID: "fixture" },
    );
    assert.equal(approvals.length, 1);
    await adapter.approve(approvals[0], false);
    assert.equal((await decision).behavior, "deny");
  } finally {
    await adapter.close();
    await f.cleanup();
  }
});
