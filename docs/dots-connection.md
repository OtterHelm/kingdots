# Dots supervises existing sessions

The local plugin supplies kingdots records and attention events. The actual Dots
feature is the supervisor and must also have official host tools for reading and
messaging the existing sessions selected by the user.

## Local setup

1. Build the checkout, start the local service and run `kingdots install-plugin`
   (or `node dist/cli.js install-plugin`). This refreshes the versioned installed
   plugin and binds absolute executable and data-directory paths.
2. Reload supported plugin connections and test a new conversation. Ensure the
   actual Dots profile has the computer and required plugins connected.
3. Verify real host reads of the selected session IDs and the official follow-up
   tool's ownership, busy-state, interruption and permission behavior.
4. Enroll those existing sessions with `watch_create`. Registration must not start
   a session, resume a second process or prepare a new worktree.

See [Dots computers and apps](https://learn.chatgpt.com/docs/dots/computers-and-apps)
and [local plugin packaging](https://developers.openai.com/plugins/build/plugins).
Local tool discovery in a normal Codex chat does not establish actual Dots access.

## Wake-up and follow-up

Use supported MCP Events or an actually supported Dots check-in. For the existing
event contract, subscribe to `task.attention_required`/`task.completed` using
`arguments: {taskId: watch.id}`. Keep subscription scope limited to enrolled watches.
The service retains signed verification, retry records and durable event cursors.
See [MCP Events](https://developers.openai.com/plugins/build/mcp-events).

On attention, Dots reads `watch_get`, refreshes the original host state and records
`watch_observe`. A scoped answer or repair is prepared and claimed once, sent by
Dots through a verified official host tool to the same session, then recorded with
`watch_instruction_receipt`. The service supplies no such host transport itself.
If that tool is unavailable, leave the instruction unsent and report the limitation.

Do not manufacture a separate API supervisor or use an arbitrary normal-chat loop
as proof that actual Dots wakes automatically. Secure MCP Tunnel operation remains
disabled because its runtime requires an API key under the no-API-billing constraint.
No credentials, billing settings or account schedules are changed by this setup.

## Required acceptance

- Start an ordinary coding session before assigning supervision to Dots.
- Give Dots the exact session ID, original goal, scope and completion conditions.
- Let Dots's initial response end, then send no further user message.
- Observe healthy work without an unnecessary instruction or a new session.
- Reproduce a routine question and an error/stop. Observe actual Dots inspecting
  context and sending authorized follow-ups into that same existing session.
- Confirm Dots reads fresh test/artifact evidence and delivers the final report.
- Verify permission/user-only decisions stay pending, manual intervention fences
  automatic writes, and pause/release leaves the original session running.
- Verify a lost host response becomes unknown and is reconciled before another send.
- Stop the subscription/check-in when management is paused, released or completed.

Webhook `2xx`, instruction claims, host-reported receipts and `decision_ack` are
records of separate steps. None proves the initial response ended, the actual dot
woke, or a final report reached the user. This acceptance remains unverified.

The PC, desktop app and local service must remain available. Failure to read a
session must be reported as unknown/unavailable, not as healthy or completed work.
