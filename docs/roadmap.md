# Minimal delivery scope

The required product is Dots supervising sessions that the user has already started,
including while the user is asleep. Dots remains the decision-maker. No new sessions,
worktrees, worker supervisor or separate judgment model are part of the default flow.

Implemented local foundation: explicit existing-session registration, read-only
metadata polling, host observation records, quiet healthy-state monitoring, attention
events, scoped instruction/receipt journals, duplicate prevention, intervention and
restart fencing, dashboard controls and plugin packaging.

Only the following release work is required:

1. Verify actual Dots access to the user's official existing Codex session read and
   follow-up tools. Establish the real host ownership/control boundary; do not infer
   it from stored CLI history or a kingdots write reservation.
2. Verify a supported event or Dots check-in that wakes the actual dot after its
   initial response ends without an API-key supervisor or another user message.
3. Run the overnight acceptance on an already-working selected session: healthy
   observation, scoped question, error/stop, same-session follow-up, fresh test/artifact
   evidence and final user report. Verify pause/intervention/uncertain delivery.

Until all three pass, overnight supervision remains unverified. Local MCP discovery,
scripted host fixtures and webhook `2xx` are insufficient. More providers, automatic
worker launches, merging, deployment and expanded scheduling features are outside
this correction's scope. Existing experimental adapters are retained without new
support claims.
