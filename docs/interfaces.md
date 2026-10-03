# Existing-session supervision interfaces

Dots is the supervisor. The public service registers existing sessions and records
observations and scoped decisions. It does not create worktrees, start workers,
resume external provider processes or approve permissions. The `app_host` bridge
can read and send to an enrolled local Codex app conversation through installed
official app tools. Dots remains the decision-maker.

Observation and decision tools belong to Dots's supervision workflow. Coding
sessions must not invoke them to report their own status, notify Dots or run a
reporting relay. The collector reads existing host records and creates attention
events from observed state; workers are not asked to produce supervision messages.
An ordinary question or tool result in the original session can be observed
without becoming a worker-to-Dots notification or granting authority.

## Watch record

`watch_create` requires `goal`, `sessions`, `completionConditions`, `allowedFollowUp`
and direct-user `authorization`. Each session has `backend`, `sessionId`, `project`
and `source` (`dots_host`, the default, `app_host`, or `adapter`). Backend IDs remain `codex-cli`,
`codex-app`, `claude-code`, `claude-app` and `opencode-cli`; registration does not
establish support for any of their external control connections.
`source: app_host` is accepted only with `backend: codex-app`.

| Source      | Observation provenance                               | Follow-up path                                             |
| ----------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| `app_host`  | `app_host_verified`, produced by the local transport | `watch_instruction_send`; currently local `codex-app` only |
| `dots_host` | `dots_host_reported`, reported by the caller         | Dots uses a verified host tool and records claim/receipt   |
| `adapter`   | `adapter_metadata`                                   | Metadata alone cannot authorize a live external write      |

`pollIntervalMs` defaults to 30000, `staleAfterMs` to 300000. Each is at least 1000;
staleness cannot be shorter than polling. A watch retains an ownership `epoch`,
state, latest per-session snapshots, original scope, last healthy observation,
instruction history and final host-reported evidence.

States: `watching`, `awaiting_decision`, `awaiting_input`, `paused`, `released`,
`completed`. Idle, unknown, missing and stale observations request Dots's review.
Normal running observations do not continually emit attention events.

## MCP tools

| Tools                                              | Effect                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `watch_create`                                     | Register selected existing sessions without contacting or changing their workers           |
| `watch_list`, `watch_get`                          | Read scope, observations and delivery history                                              |
| `watch_poll`                                       | Read enrolled app-host state/adapter metadata and classify missing or stale observations   |
| `watch_observe`                                    | Store official-host evidence reported by Dots, with immutable observation ID               |
| `watch_host_read`                                  | Read an enrolled local Codex app conversation and record transport-generated host evidence |
| `watch_instruction_send`                           | Recheck the host and send a prepared app-host instruction once; retain transport receipt   |
| `watch_instruction_prepare`                        | Reserve and journal an exact follow-up; nothing is sent                                    |
| `watch_instruction_claim`                          | Claim one pending `dots_host` instruction before Dots's own official host send             |
| `watch_instruction_receipt`                        | Persist `dots_host` accepted/not-sent/unknown results or reconciliation                    |
| `watch_pause`, `watch_release`                     | Fence management and leave original sessions running                                       |
| `watch_finish`                                     | Record Dots's report against fresh idle snapshots and referenced passing conditions        |
| `session_list`, `session_get`, `capabilities_list` | Read provider metadata and actual support boundaries                                       |
| `events_read`, `decision_ack`                      | Recover attention events and record Dots's observed decisions                              |

There are 18 local tools. Worker creation, arbitrary command execution, provider approval,
external session resume and management resume are not exposed through MCP.

## Observation and follow-up

An observation includes watch/backend/session IDs, `observationId`, state, summary
and nonempty source evidence references. States are `running`, `idle`, `question`,
`permission`, `failed`, `unknown`, `user_intervened`. Host records have provenance
`dots_host_reported` or `app_host_verified`; metadata has `adapter_metadata`. Replaying the same
observation ID cannot replace later state or refresh old evidence; changed content
under that ID is rejected.

A prepared instruction includes `commandId`, watch/backend/session IDs, exact prompt,
reason, current `epoch` and current `observationId`. Only fresh host-reported idle,
question or failed state is actionable for preparation. The app-host send additionally
requires the actual host to be idle with the same signature as preparation.
The local ownership epoch is checked again immediately before native dispatch,
after asynchronous authentication and transport startup. Pause before that point
prevents sending; a request already passed to the host cannot be recalled locally.
The caller must stay inside `allowedFollowUp`.
Permission prompts require the user; a claim is not authorization to bypass them.

Commands move from `queued` (not sent) to `dispatching` (host send required), then
`completed` with `delivery: accepted`, `failed` with `delivery: not_sent`, or `unknown`.
Duplicate prepares return the previous record; different input under the same ID
fails. A second claim fails. The session reservation is held across unknown delivery
and restarts. Reservations coordinate kingdots clients, not unrelated host processes.

### App-host delivery

1. `watch_host_read({watchId, sessionId})` validates local Codex session/project
   identity and records the snapshot during active management. It also returns
   recent turns for Dots to inspect. An explicit read of a paused or released
   watch returns the snapshot with `observationStored: false` without changing
   management, observations, events, reservations or commands.
2. `watch_instruction_prepare` records the exact prompt and current observation,
   epoch and host signature. It reserves the selected session within kingdots.
3. `watch_instruction_send({watchId, commandId, epoch})` reads the host again.
   A changed signature or non-idle state becomes `failed`/`not_sent` without a send.
   A management pause during the read fences delivery.
4. The service claims the instruction and invokes the installed official
   `send_message_to_thread` on the same local session. It retains a target-specific
   receipt; an unconfirmed host response becomes `unknown`.

The installed official `read_thread` and `send_message_to_thread` tools require
real executor app context. No caller-supplied observation or manual receipt may
impersonate the app-host transport. New external user input detected against a
prior snapshot pauses management; recognized kingdots delegation does not.
The read/send sequence is not an atomic host reservation.

`decision_ack` resolves the event's `taskId` as an existing-session watch first,
then as a legacy task for backward compatibility. Its decision and timestamp are
stored atomically. A watch acknowledgment does not create a worker, alter the
watch's control state or establish an actual Dots connection. The generic
acknowledgment is not a completed periodic content review.

Before sending, the bridge checks existing ChatGPT authentication and standard
provider configuration. API-key, custom-provider and unknown contexts are blocked.

### Dots-host delivery

Dots reads through its own actually available official host tool, records
`watch_observe`, prepares and claims the command once, sends the exact prompt into
the same session, then records `watch_instruction_receipt`. Claim/receipt does
not provide a host connection. If none is available, leave the command unsent.
Neither path may create a fallback session.

App-host `unknown` delivery remains reserved. Current public tools do not expose
an app-host reconciliation override; do not fabricate a receipt or edit the database
to unlock it. Dots-host unknown delivery can be reconciled through retained actual
host evidence and `watch_instruction_receipt`.

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

The local listener also exposes UI-only `GET /api/gateway`,
`POST /api/gateway/configure`, `POST /api/gateway/approvals/:id` and
`POST /api/gateway/grants/:id/revoke`. Only the authenticated local dashboard/API
can configure the origin or approve/revoke grants. Local MCP uses its separate token
at `/mcp`.

## OAuth gateway

A separate loopback listener exposes discovery metadata, OAuth endpoints and
`POST /mcp`, with no dashboard or `/api/*`. `gateway-configure` sets its external
HTTPS origin. A separately deployed proxy forwards only this listener.

Authorization uses a public client, exact supported ChatGPT HTTPS callback,
resource-bound authorization code, S256 PKCE and the original browser's secure
cookie. Pending consent lasts 10 minutes; codes last 2 minutes and are single-use.
The user matches the displayed code in the local dashboard and chooses existing
`app_host`/`codex-app` watches and a subset of requested scopes.

| Scope                               | Gateway tools                                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `kingdots:read`                     | `watch_list`, `watch_get`, `watch_host_read`, `events_read`, `capabilities_list`                                                         |
| `kingdots:read` + `kingdots:manage` | Also `watch_poll`, `watch_instruction_prepare`, `watch_instruction_send`, `watch_pause`, `watch_release`, `watch_finish`, `decision_ack` |

The gateway exposes 12 tools. `watch_host_read` requires read scope but updates
observation/intervention records; its local MCP annotation is not read-only.
Lists/events are filtered to consented watches; direct IDs and decision events are
checked against that scope. Watch creation, manual observation/claim/receipt,
provider-wide session browsing, resume and grant approval are not exposed.

Access tokens last one hour; refresh tokens last seven days and rotate on use.
Their hashes are persisted. Each watch has at most one active gateway management
grant; this does not exclude local clients or lock the external host. Grant revocation
invalidates tokens, pauses managed watches and stops that grant's subscriptions.
Changing origin revokes prior grants. External connector/Dots compatibility is
unverified; source behavior is not a certification of OAuth compliance.

## Experimental Dots pull relay

The separate source in `experiments/dots-pull-relay` is a connection-gate probe,
not an extra set of local service tools. Its stateless HTTP `POST /mcp` supports
initialization, static discovery and two tools:

| Tool | Input | Result and boundary |
| ---- | ----- | ------------------- |
| `inspect_existing_session` | Stable `commandId` (8–128 letters, digits, `_.:-`) | Queue one read, then return snapshot, `inspectionId` and nonce; no arbitrary target |
| `record_no_action_review` | `inspectionId`, nonce, reason (1–4000 characters) | Record only `continue_observation`; no session instruction, approval or resume |

Data-bearing MCP calls require the platform's trusted authenticated-user identity;
the first account is pinned under the owner-private hosting boundary. Missing
identity returns 401 and another identity returns 403. Discovery contains no
conversation data. The platform's service credential does not create a user.

The PC uses outbound HTTPS with the officially provisioned Sites service credential
and its separate pairing token. The worker checks `DEVICE_PAIR_DIGEST`. Endpoints
are `GET /device/jobs` (atomically claim one request and retrieve reviews),
`POST /device/result` (matching request ID/nonce, snapshot or error), and
`POST /device/decision-collected` (mark a review retrieved).

One queued/claimed inspection exists at a time. Identical command IDs return the
original result. A claimed/unknown request is never automatically requeued.
Conflicting results and changed duplicate reviews are rejected. Request/review
records expire after 15 minutes; cleanup occurs on the next relay request. HTTP
bodies are limited to 96 × 1024 decoded string units and serialized snapshots to
72 × 1024 string units (UTF-8 byte sizes can be larger). The PC bounds
record text and explicitly marks truncation; it performs no model summarization.

The finite PC helper preserves the selected paused watch and records requests
before host reads. A judgment is correlated by inspection ID and nonce, but its
authenticated account identity alone is not proof of actual Dots authorship.
Actual tool activity must also be checked. These records do not update service
review timestamps, activate management or satisfy the post-response review gate.

## Events

Existing event names `task.attention_required`
and `task.completed` retain `arguments: {taskId: watch.id}` for compatibility. Signed
callback verification, retry/deduplication and durable event cursors remain available.
Webhook receipt, an acknowledged decision and real Dots unattended supervision are
separate observations. None of the first two proves the third.

See [deployment](deployment.md), [Dots connection](dots-connection.md) and
[verification](verification.md) for configuration and acceptance boundaries.
