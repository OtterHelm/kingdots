# Minimal delivery scope

The required product is Dots supervising sessions that the user has already started,
including while the user is asleep. Dots remains the decision-maker. No new sessions,
worktrees, worker supervisor or separate judgment model are part of the default flow.

Implemented local foundation: explicit existing-session registration, read-only
metadata polling, host observation records, quiet healthy-state monitoring, attention
events, scoped instruction/receipt journals, duplicate prevention, intervention and
restart fencing, dashboard controls and plugin packaging. Current work also adds
an installed Codex app-tool bridge, transport-generated observations and receipts,
plus a separate OAuth gateway with local consent and selected-watch scopes.
Controlled fixtures cover those additions. One actual installed-host read of the
selected local conversation passed on Windows, with active-session sending blocked.
Actual Dots compatibility and live idle-session sending remain unverified.

Version 0.1.3 fixes watch-event decision acknowledgments and permits explicit
paused/released app-host reads without changing management. The latest real Dots
discovery still lacks kingdots read/decision tools. These are prerequisite fixes;
the approved 15-minute configurable proactive review loop and safe automatic
recovery are gated on that connection and are not implemented yet.

Bounded native app messages now have actual Dots receipt and user-facing reply
evidence. The read/wait return path omits those replies. The next connectivity
trial is Dots's own existing-task follow-up tool against the selected local Codex
conversation. One finite program passed post-response reads and attention
dispatch, but did not verify correlated guidance and a marker reply within five
minutes. Local-target sending and sustained/restarted background operation remain
unverified. See [dated results](verification-results.md).

Proactive observation remains the user's requirement: Dots starts looking at the
selected existing sessions using automatically collected host records. Coding
AIs must not compose status reports, notify Dots or run reporting scripts. The
collector reads existing records under Dots's supervision. A reliable dashboard and Dots
information delivery can be intermediate milestones, but they do not replace
the required actual Dots management loop. Narrow the first real trial to Codex
app before expanding providers or the interface.

Only the following release work is required:

The [overnight validation plan](overnight-supervision-plan.md) records the
2026-10-03 interview: Codex app is the first real target, ordinary intervention
targets five minutes, and safe same-conversation resumption is allowed after
confirmed owner exit. The five requested products remain the eventual support
goal; their independent capabilities are not promised before actual trials.

1. Verify actual Dots reads and durable no-action decision return through a supported
   local or external OAuth route, then authorized same-session sends and host context
   after the caller ends.
   Keep package/plugin/protocol versions aligned for release. Establish the host
   ownership boundary; idle preflight is not an atomic host reservation.
2. Verify a supported event or Dots check-in that wakes the actual dot after its
   initial response ends without an API-key supervisor or another user message.
3. Run the overnight acceptance on an already-working selected session: healthy
   observation, scoped question, error/stop, same-session follow-up, fresh test/artifact
   evidence and final user report. Verify pause/intervention/uncertain delivery.

The local CI and installed-plugin results are in [verification results](verification-results.md).
Before release, provide a verified recovery path for unknown app-host delivery. Manual
app-host receipts are deliberately not accepted by the public tools.

Until all three pass, overnight supervision remains unverified. Local MCP discovery,
scripted host fixtures and webhook `2xx` are insufficient. More providers, automatic
worker launches, merging, deployment and expanded scheduling features are outside
the current Codex acceptance work. After it passes, qualify Codex CLI, Claude Code,
Claude app and OpenCode CLI against the same existing-session scenario. Existing
experimental adapters remain without new support claims until those trials pass.

Maintain both READMEs, [interfaces](interfaces.md), [deployment](deployment.md),
connection and verification records alongside behavior changes. Search/promotion
recommendations are in [discoverability](discoverability.md); public claims must
remain consistent with these release gates.
