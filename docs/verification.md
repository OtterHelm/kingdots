# Existing-session verification

Run npm run typecheck, npm test and npm run build. Windows local CI additionally
validates the package and unchanged source. Controlled tests do not call provider
models; actual Dots acceptance is recorded separately.

Observer and app-host regressions cover registration without worker creation,
quiet observations, immutable IDs, stale/permission/active-state fencing,
reservations, uncertain delivery, intervention, pause during dispatch, shutdown,
restart and fresh completion-condition references. Public MCP cannot approve
permissions or resume management. UI and MCP credentials have separate roles;
Host and Origin checks reject browser cross-site commands.

Relay regressions cover request-driven reads, nonce/target correlation, changed
review rejection, unchanged paused watches, held unknown result delivery, release
fencing and idempotent import of old evidence without granting current authority.
Remote fixtures cover owner/device authentication, atomic once-only claims,
concurrent request exclusion, result/review conflicts and expired-ID tombstones.

Metadata adapter fixtures ensure stored Codex/Claude records cannot establish
external idle ownership, unknown sessions do not cause creation, and a read-only
Codex client refuses unexpected host approval requests. Old adapter execution
tests were replaced by these actual current-contract checks.

Official MCP SDK tests verify local discovery and calls. Retained historical task
evidence is created as a fixture without executing a worker. Removed worker-manager
and standalone OAuth-gateway suites no longer test deployed functionality.
Manual prototype scripts and provider-usage live runners have been removed.

For UI checks, use the built loopback dashboard with a local authenticated browser.
Confirm connection state, returned review history, imported-history labels,
management controls and narrow-screen rendering. Do not publish screenshots
containing personal IDs, paths, credentials or conversation text.

The actual release gate is Dots managing an already-working selected session after
its initial response ends, without additional user messages, replacement sessions
or worker reports. Verify proactive regular reviews, urgent questions/errors,
safe same-session follow-up, fresh tests/artifacts and final reporting.
This remains unverified. The consolidated read/no-action path also requires an
actual Dots retest; historical probe passes do not certify it.

watch_finish checks fresh host-reported evidence and references. The service does
not independently run completion tests or verify original file contents.

See [connection](dots-connection.md) and [dated results](verification-results.md).
Coverage here is a procedure description, not an assertion of a new actual Dots pass.
