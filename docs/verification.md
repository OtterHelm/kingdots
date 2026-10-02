# Verification and current limitations

## Automated checks

`npm test` uses controlled adapters and temporary Git projects. It verifies:

- preservation of original files/index and copying dirty/untracked work;
- failure → scoped follow-up → fresh tests → completion;
- command deduplication and conflicting IDs;
- stale/missing evidence, missing artifacts and file-scope violations;
- repeated failures, immediate write fencing and cancellation;
- session ownership, unknown delivery and restart recovery;
- independent task concurrency and optional budget behavior;
- unavailable usage without fabricated values;
- UI/MCP role separation and cross-site request rejection;
- signed callback verification, durable delivery and bounded retries;
- official MCP SDK initialization, tool discovery and invocation.
- API-key/unknown authentication refusal, authentication changes between turns;
- CLI background service start/status/stop.

`npm run test:live` independently uses the actual installed Codex App Server
and an isolated fixture. It stores the installed version, task, commands,
test output, usage when available, cancellation/resume outcome and limitations
under `.kingdots/live-*/result.json`. Inspect `passed` and the individual
results; the presence of the file is not a passing assertion.

This test uses a scripted supervisor. It does **not** verify Dots wake-up.
The real Dots acceptance test is described in `dots-connection.md` and requires
a user-configured actual Dots local-computer/plugin connection without API billing.

`npx tsx scripts/local-connection-check.ts` tests official SDK tool calls over
local stdio without a model invocation or provider API key. It records local
connectivity separately from the still-unverified actual Dots wake-up.

## Compatibility boundaries

- Windows is the first target. Tests on another OS do not imply support there.
- Codex App Server is an experimental upstream dependency. Capability evidence
  is associated with the observed provider version and must be retested after
  an upgrade. Windows sandbox rejects custom output caps; this adapter uses
  the native default there and retains the sandbox.
- Codex chooses the account's `model/list` default unless a supported task
  model is supplied. It does not edit the user's global model configuration.
- Claude uses the official SDK and activity hooks. Live steering is disabled
  in this adapter; send a follow-up after the query finishes. Actual account
  execution has not been declared verified by installation alone.
- OpenCode selects v1/v2 clients by installed major version. It reconnects
  event streams and re-queries owned session status/results. Missed events are
  recorded as a gap; it does not claim replay from a live-only stream.
- Desktop application control remains development planned. Code/Chat/Cowork
  must not be represented as interchangeable products.
- Strict token caps are refused. Claude's native budget is an estimated-cost
  budget, not a billing guarantee. Dots task-level usage is unavailable.
- Completion validates prescribed checks and scope, not the semantic quality
  of arbitrary tests. Dots must still review whether the evidence meets the goal.
- Provider sandboxes and user review remain in force. The local API itself is
  not an OS sandbox; credentials with access to it must remain private. User
  approval does not install, enable, or change provider/account permissions.

Production unattended support must remain unverified until the complete Dots
scenario passes. No code in this preview publishes a package, pushes source,
configures a user account, creates a schedule, or grants provider permissions.
The explicit `install-plugin` command adds a local Codex plugin using a dedicated
marketplace. It does not issue account credentials or change billing settings.

The [local CI pipeline](local-ci.md) runs the same gates with a dedicated
self-hosted Windows runner and retains a commit/file-bound receipt and package
on the user's computer. `test:live` is not part of automated CI. Actual runner
connectivity and a successful workflow execution must be verified separately.
