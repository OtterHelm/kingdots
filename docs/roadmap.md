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

Only the following release work is required:

The [overnight validation plan](overnight-supervision-plan.md) records the
2026-10-03 interview: Codex app is the first real target, ordinary intervention
targets five minutes, and safe same-conversation resumption is allowed after
confirmed owner exit. The five requested products remain the eventual support
goal; their independent capabilities are not promised before actual trials.

1. Verify authorized same-session sends and host context after the caller ends, then
   actual Dots discovery/linking through a supported local or external OAuth route.
   Keep package/plugin/protocol versions aligned for release. Establish the host
   ownership boundary; idle preflight is not an atomic host reservation.
2. Verify a supported event or Dots check-in that wakes the actual dot after its
   initial response ends without an API-key supervisor or another user message.
3. Run the overnight acceptance on an already-working selected session: healthy
   observation, scoped question, error/stop, same-session follow-up, fresh test/artifact
   evidence and final user report. Verify pause/intervention/uncertain delivery.

The current local suite passes 55 tests. Before release, provide a verified
recovery path for unknown app-host delivery. Manual
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
