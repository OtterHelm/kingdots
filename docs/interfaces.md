# Existing-session observation contract

Dots is the supervisor. The public service registers existing sessions and records
observations and scoped decisions. It does not create worktrees, start workers,
resume external processes, approve permissions or supply an external host control API.

## Watch record

`watch_create` requires `goal`, `sessions`, `completionConditions`, `allowedFollowUp`
and direct-user `authorization`. Each session has `backend`, `sessionId`, `project`
and `source` (`dots_host`, the default, or `adapter`). Backend IDs remain `codex-cli`,
`codex-app`, `claude-code`, `claude-app` and `opencode-cli`; registration does not
establish support for any of their external control connections.

`pollIntervalMs` defaults to 30000, `staleAfterMs` to 300000. Each is at least 1000;
staleness cannot be shorter than polling. A watch retains an ownership `epoch`,
state, latest per-session snapshots, original scope, last healthy observation,
instruction history and final host-reported evidence.

States: `watching`, `awaiting_decision`, `awaiting_input`, `paused`, `released`,
`completed`. Idle, unknown, missing and stale observations request Dots's review.
Normal running observations do not continually emit attention events.

## MCP tools

| Tools                                              | Effect                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `watch_create`                                     | Register selected existing sessions without contacting or changing their workers                     |
| `watch_list`, `watch_get`                          | Read scope, observations and delivery history                                                        |
| `watch_poll`                                       | Read enrolled adapter metadata and classify missing/stale host observations                          |
| `watch_observe`                                    | Store official-host evidence reported by Dots, with immutable observation ID                         |
| `watch_instruction_prepare`                        | Reserve and journal an exact follow-up; nothing is sent                                              |
| `watch_instruction_claim`                          | Claim one pending instruction before a verified official host send; no host send is implemented here |
| `watch_instruction_receipt`                        | Persist accepted/not-sent/unknown host results or reconciliation                                     |
| `watch_pause`, `watch_release`                     | Fence management and leave original sessions running                                                 |
| `watch_finish`                                     | Record Dots's report against fresh idle snapshots and referenced passing conditions                  |
| `session_list`, `session_get`, `capabilities_list` | Read provider metadata and actual support boundaries                                                 |
| `events_read`, `decision_ack`                      | Recover attention events and record Dots's observed decisions                                        |

There are 16 tools. Worker creation, arbitrary command execution, provider approval,
external session resume and management resume are not exposed through MCP.

## Observation and follow-up

An observation includes watch/backend/session IDs, `observationId`, state, summary
and nonempty source evidence references. States are `running`, `idle`, `question`,
`permission`, `failed`, `unknown`, `user_intervened`. Host records have provenance
`dots_host_reported`; local metadata has `adapter_metadata`. Replaying the same
observation ID cannot replace later state or refresh old evidence; changed content
under that ID is rejected.

A prepared instruction includes `commandId`, watch/backend/session IDs, exact prompt,
reason, current `epoch` and current `observationId`. Only fresh host-reported idle,
question or failed state is actionable. The caller must stay inside `allowedFollowUp`.
Permission prompts require the user; a claim is not authorization to bypass them.

Commands move from `queued` (not sent) to `dispatching` (host send required), then
`completed` with `delivery: accepted`, `failed` with `delivery: not_sent`, or `unknown`.
Duplicate prepares return the previous record; different input under the same ID
fails. A second claim fails. The session reservation is held across unknown delivery
and restarts. Reservations coordinate kingdots clients, not unrelated host processes.

Dots must use an actually available, official host tool to deliver the exact command
to the same session and retain the host result. If that connection is unavailable,
the command remains unsent. No fallback session may be created.

`watch_finish` requires the current epoch, final report, latest observation IDs and
`evidence: [{condition, reference, passed: true}]` covering every initial condition.
All target snapshots must be fresh and idle; uncertain/pending delivery blocks finish.
Evidence is host-reported, not independently executed or file-hash-verified by the service.

## Local API and events

UI-token endpoints: `GET/POST /api/watches`, `GET /api/watches/:id`, and
`POST /api/watches/:id/{poll,pause,release,resume}`. Resume is user-only and requires
reconciling unknown delivery first. It clears old observations for a fresh host read.
Original sessions are not interrupted. Legacy task creation/execution returns `410`;
historical task records remain readable.

MCP uses its separate token at `/mcp`. Existing event names `task.attention_required`
and `task.completed` retain `arguments: {taskId: watch.id}` for compatibility. Signed
callback verification, retry/deduplication and durable event cursors remain available.
Webhook receipt, an acknowledged decision and real Dots unattended supervision are
separate observations. None of the first two proves the third.
