# Existing-session verification

Run `npm run typecheck`, `npm test` and `npm run build`. Local CI validates the
package and unchanged source as well. Controlled tests do not call provider models.

The observer regressions cover:

- registration/polling/pause without worker creation, external resume, interruption
  or a new Git worktree;
- quiet healthy observations and deduplicated attention for questions/errors;
- immutable observation IDs and replay protection that cannot refresh stale state;
- active, permission, unknown, stale and user-intervened follow-up fencing;
- same-session reservations, one-time claims, unknown delivery and host reconciliation;
- restart cancellation of proven-unsent messages and retention of uncertain sends;
- final reporting against fresh idle snapshots and each original completion condition;
- public worker creation/execution disabled and management resume inaccessible to MCP.

The service does not execute completion tests in a new worker or project clone.
`watch_finish` checks referenced, host-reported evidence and snapshot freshness;
Dots must inspect the actual original-host tests and artifacts. It is not independent
verification of file contents, semantic task quality or the authenticity of a
caller's claimed user request.

`scripts/browser-check.ts` exercises authenticated watch registration, details,
pause/resume, the Dots status panel and mobile layout with a fictitious session ID.
It does not connect or control a real coding session.

`scripts/local-connection-check.ts` checks official MCP SDK initialization, tool
discovery and read-only capability queries without model calls. Its result does
not establish actual Dots host access or an unattended wake-up.

Earlier `scripts/live-codex.ts` and worker tests are historical execution experiments.
They are not the current default product flow or acceptance evidence for supervising
an external session. `test:live` is excluded from CI and consumes provider usage.

The actual release gate is documented in [Dots connection](dots-connection.md):
an already-working session, the initial Dots response ending, a question/error,
same-session follow-up, actual fresh evidence and a final user report without any
additional user message or newly created session. Until independently observed,
unattended supervision must remain unverified.
