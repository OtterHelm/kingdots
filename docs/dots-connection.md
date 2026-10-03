# Dots connection

## Current path

Actual Dots calls the owner-private kingdots account plugin. Its two tools inspect
one locally selected existing Codex conversation and return a correlated no-action
review. The PC service polls outward for those requests; the coding AI does not
produce reports, invoke supervision scripts or send Dots messages.

The verified architecture uses the native Sites OAuth/plugin boundary and device
pairing. A public PC endpoint, separate PC OAuth gateway and additional Codex-local
management plugin are unnecessary. Source and setup are in [relay](../relay/README.md)
and [deployment](deployment.md). The local 18-tool MCP remains a diagnostic interface,
not proof that Dots sees those tools.

## Host and identity boundaries

The PC must start with genuine Codex executor context and installed official host
tools. Check the exact existing conversation, local host and project through an
actual read. Do not substitute a new conversation, invent IDs or concurrently
resume an externally owned session in another process.

MCP data calls require the hosting platform's authenticated user identity under
owner-only access. The first owner identity is pinned. Missing identity is rejected;
another owner is rejected. The service credential does not manufacture a user.
Returned review provenance is an authenticated account, not cryptographic proof
that Dots authored it. Actual Dots tool activity is separate acceptance evidence.

The device credential goes only to the configured trusted HTTPS origin, with
redirects rejected. Requests carry an independent pairing token. UI/MCP tokens,
local endpoints and raw local database files are never sent to the relay.
The PC cancels relay responses above 128 KiB during reading. The relay cancels
request bodies above 96 KiB even when the Content-Length header understates size.

## Requests and returned judgments

Dots begins with inspect_existing_session using a stable commandId. The service
journals a claim before reading the registered host, prepares a bounded snapshot
and posts that exact result once. Records use selected-target aliases and explicitly
mark truncation; they are not model summaries. Conversation text is not permission.

Dots can call record_no_action_review with the returned inspectionId, nonce and
reason. The service validates correlation, stores the judgment in kingdots.sqlite
and then acknowledges collection. Repeated identical reviews do not refresh the
original receipt time; conflicting content is rejected. The dashboard displays
returned reviews and connection health from the same store.

A paused watch's explicit read preserves the paused watch, observation history and
instructions. The relay cannot issue coding instructions, approve permissions,
resume management, change targets or create sessions. Released/completed targets
are blocked. Imported prototype reviews remain unbound history, not current reviews.

## Recovery and release limits

Read/result uncertainty is held instead of blindly re-executing. Disconnects retry
transport polling with bounded backoff, preserving jobs and reviews. An unknown
result receipt has no automatic recovery override. Pending request payloads expire
after 15 minutes; the relay retains ID tombstones so an expired ID cannot start
another read. It deletes expired payloads on subsequent activity.

Bounded actual Dots inspection, judgment return and two one-time scheduled checks
after its initial response passed on the preceding connection implementation.
The consolidated service has controlled tests; actual Dots retesting remains pending.
Neither ordinary polling nor plugin installation schedules Dots.

Regular content review timing, safe same-session intervention, urgent five-minute
response, fresh completion verification, unknown-host-send recovery and actual
overnight operation remain acceptance gates. No model API key, paid model API,
substitute supervisor or worker notification may stand in for actual Dots.

Assign tests directly to the existing Dots conversation as the human user. A coding
worker must not message Dots on the user's behalf or ask it to watch that worker.
Preserve explicit pauses during upgrades and retesting.

See [interfaces](interfaces.md), [verification](verification.md) and
[dated evidence](verification-results.md). Historical probe results establish only
their tested snapshot, not the current runtime or full unattended management.
