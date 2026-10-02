# Public interfaces

The package exports domain types, `Store`, `Manager`, `Events`, `buildServer`,
and the adapter contract. Native provider differences belong inside adapters.
Provider server messages and repository text never become authorization.

## Task lifecycle

`preparing → running → verifying → awaiting_decision → completed`

Errors/permissions/connection changes can enter `awaiting_input`, `failed`,
`paused`, or `released`. An AI result is not task completion. The initial
checks and artifacts are immutable for the lifetime of a task. A new scope or
completion contract needs a new explicitly authorized task in this release.

Tasks record user-request provenance, selected providers, file scope, baseline
branch/commit/worktree, optional budgets, session ownership epoch, checklist,
evidence, reported usage, blockers, recent/next actions, and healthy/decision
timestamps. Completion evidence binds exit status and output to a file-content
fingerprint. Required artifacts have independent hashes, including ignored
build products.

## MCP

The authenticated `/mcp` endpoint accepts JSON-RPC; `kingdots mcp` proxies
JSONL stdio to the same endpoint. The official MCP SDK's HTTP client is covered
by an integration test. Local UI and MCP tokens are separate. MCP cannot call
user approval or manual resume routes.

| Tool                            | Purpose                                                           |
| ------------------------------- | ----------------------------------------------------------------- |
| `task_create`                   | Enroll a direct user request, prepare a worktree, start execution |
| `task_list`, `task_get`         | Read selected tasks, scope, evidence and command history          |
| `capabilities_list`             | Read independent installed-version feature evidence               |
| `session_list`, `session_get`   | Read session metadata without resuming                            |
| `session_attach`                | Attach only an owned inactive session in the same worktree        |
| `session_send`, `session_steer` | Start a follow-up or guide an active owned turn                   |
| `task_verify`                   | Run saved checks in a sandbox without a model call                |
| `task_complete`                 | Validate evidence and save an evidence-based report               |
| `task_pause`, `task_release`    | Fence new writes and confirm cancellation                         |
| `session_interrupt`             | Interrupt an owned session and pause its automatic management     |
| `events_read`, `decision_ack`   | Recover durable events and acknowledge a Dots decision            |

Execution requests use `commandId`, `reason`, and the task's current `epoch`.
The same ID/input returns the recorded operation. Reusing an ID with different
input is rejected. On uncertain provider acceptance the command is `unknown`;
it is not dispatched again. A transport request ID alone is not an exactly-once
guarantee from a provider.

MCP Events supports `server/discover`, `events/list`, `events/subscribe`, and
`events/unsubscribe`. Events contain only task ID, revision, cause, cursor,
timestamp, and event ID. Retrieve full evidence with `task_get`.

## Local HTTP controls

All `/api/*` calls require a local UI bearer token, except the MCP tool bridge
which requires the distinct MCP token. Cross-site origins and unknown hosts
are rejected. There is no cookie-based authentication.

- `GET /api/status`, `/api/tasks`, `/api/tasks/:id`, `/api/capabilities`
- `POST /api/tasks`
- `POST /api/tasks/:id/{send,steer,verify,complete,pause,release,resume}`
- `POST /api/approvals/:id` with a user decision
- `GET /api/events`, `/api/instructions`
- `POST /api/shutdown`

The user-only resume route can require explicit confirmation that a previous
worker stopped. A new adapter must not infer external ownership from stored
history timestamps. Claude/OpenCode session acquisition after a process
restart remains restricted because their external writer ownership cannot be
proved by this adapter.

The standard CLI runtime applies a no-API-billing execution policy. Codex workers
must use existing ChatGPT authentication. Other backends can expose
`executionBlockedReason` while their execution authentication remains unverified;
stored-history discovery and execution capability evidence stay separate.

## Adapter requirements

Implement `probe`, `list`, `read`, `create`, `send`, `steer`, `interrupt`,
`resume`, `close`, and `onEvent`. Unsupported operations must fail explicitly.
`executeCheck` is an optional sandbox executor; the manager currently uses
the Codex implementation for independent checks. An optional `approve`
callback is reachable only through the user UI controls.

Publish each feature's status, version, platform, test date, evidence and
limitations separately. Installation is not execution verification. External
active sessions require a separate ownership protocol before adoption.
