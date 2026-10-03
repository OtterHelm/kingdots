# Verification results

Latest local check: **2026-10-03 (Asia/Seoul)**. Historical Dots checks below were
performed on 2026-10-02. Results describe the tested installation or working tree,
not universal support. Raw account, session and machine records stay in ignored
local storage; public documentation contains no account IDs or callback secrets.

## Actual Dots message probe: 2026-10-03

### Implementation connection gate and local fixes: 0.1.3 working tree

The real existing Dot answered the new bounded connection probe in its normal
conversation. It reported no exposed kingdots `watch_get`/`decision_ack` tools
and no local-specific existing-Codex read tool. It performed no callback, session
instruction, new-task creation or account change. The earlier failed cloud read
was not retried without a new target-mapping basis. Its user-facing JSON is not
an automated local decision receipt.

The earlier post-response follow-up report was also inspected. Dots explicitly
declined to send: it could not verify the target's fresh idle state or user
intervention, and its cloud send schema had no expected-turn/idle condition.
That trial was not an attempted host-write failure.

Inspection found a separate local bug: `decision_ack` looked up watch events only
in the legacy tasks table. Version 0.1.3 resolves watches first, preserves legacy
task compatibility and atomically saves the acknowledgment without changing
watch management. Explicit app-host reads now return a paused/released watch's
snapshot without resuming it or recording an observation. Target enrollment is
still enforced.

The affected app-host/watch/event suites passed **22/22 tests**, and typecheck
passed. The full local suite passed **57/57 tests** and the build passed before
the user-requested pause. These are controlled regressions, not actual Dots callback acceptance.
The subsequent Windows local CI and installed-plugin check are recorded below.
Regular 15-minute content reviews, configurable intervals, active steering,
automatic recovery and overnight management remain unimplemented behind the
failed connection gate.

The local service was started with genuine app context and its existing watch
kept paused. No model API key, paid API, public tunnel or account connector was
created. Private probe IDs and raw conversation content remain ignored locally.

The installed `codex-app-tools` **0.1.5** relay, called by an ordinary Node process
with the genuine local executor context, accepted two bounded messages to the
already-existing actual Dots conversation. The first requested a read-only ready
reply; the second requested the currently exposed existing-task follow-up schema.
The process journaled each command before dispatch and did not retry either send.

Both replies were observed in the actual Dots conversation through the browser.
The ready reply preceded the separate capability request and reply. This proves
actual Dots received and responded to local-program attention messages after its
earlier user-visible reply. It does **not** prove delivery to a coding session or
the five-minute intervention objective; response timestamps were not recovered
through an automated return channel.

| Check                                                       | Observed result                                                                                                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Local program to existing actual Dots                       | Two native host receipts identified the selected existing conversation; both requested replies appeared in its user-facing conversation                                        |
| Native `read_thread` / `wait_threads` return channel        | Engine metadata and delegated input were available, but the observed user-facing Dots replies were absent; five read pages did not recover the ready reply                     |
| Dots's currently exposed follow-up schema                   | Dots reported `mcp__codex_apps__cloud_threads_send_message`, requiring `prompt` and `threadId`; the description covers an existing cloud task, with no local `hostId` selector |
| That tool controlling the selected local Codex conversation | **Unverified**; the capability probe did not send or interrupt the coding conversation                                                                                         |
| Coding-session instructions from these probes               | None; no new conversation, model API key, tunnel or account/billing change                                                                                                     |
| Usage                                                       | No model call in the local collection/relay program; actual Dots product usage was unavailable, not zero                                                                       |

A finite background trial was prepared for the next gate: observe the source
Codex response end, re-read the original conversation, then ask actual Dots to
deliver the previously authorized file-free marker once through its own official
existing-task tool if its authorization and target checks permit it. Match the
original target, host-provided sender provenance, correlation value, actual reply
and file fingerprint. New or unverifiable input stops the local trial; unknown
delivery is held without retry. A sent attention message cannot be atomically
recalled or reserve the target, so this is a bounded experiment, not production
intervention safety. Its result is recorded below.

The local plugin was 0.1.2 during that diagnostic. It did not add a supported service
command, expose an endpoint or pass overnight acceptance. Private identities,
messages and receipts remain in ignored local storage.

### Resumed Windows CI and installed plugin: 0.1.3

The trusted Windows local runner passed
[run 37104580129](https://github.com/OtterHelm/kingdots/actions/runs/37104580129)
against clean commit `e1a748b`: dependency installation, typecheck, **57/57 tests**,
build and package all exited successfully. The local receipt records an unchanged
source fingerprint and retains the package locally; it contains no uploaded
private logs or test data.

Installation then found the compatibility `.codex-plugin/plugin.json` still
declared 0.1.2 while the portable manifest declared 0.1.3. The working tree corrected
that metadata and refreshed the existing local plugin. An official MCP SDK client
connected using the installed 0.1.3 stdio configuration, checked both manifest
versions and the running service version, and discovered **18 tools**. Its explicit
`watch_host_read` returned the enrolled original local Codex conversation in
`running` state. The paused watch, epoch, observations, events and commands were
unchanged; `observationStored` was false and coding-session commands remained zero.
This was a local-program check, not an actual Dots tool call or callback.

Read-only browser inspection also confirmed a custom MCP creation form in the
tested ChatGPT account, offering a server URL and OAuth authentication. No form
was submitted, public origin configured, OAuth grant approved or connector created.
The previously rejected public tunnel launch was not retried. The gateway remains
unconfigured, and real account OAuth compatibility and Dots tool exposure are
still unverified. No model API key or paid model API was used.

### Finite post-response trial result: 0.1.2

The model-free program observed the original Codex response complete and its
final answer, then successfully read that same existing local conversation and
the selected Dots engine metadata. It sent one correlated attention request to
the existing actual Dots conversation after the source response ended; the native
host returned an accepted receipt. No further human message was needed for those
reads and that dispatch.

For the next five minutes, the program did **not** verify correlated guidance from
Dots in the original coding conversation or the expected marker response. The
recorded result is `guidance_or_marker_not_verified_within_five_minutes`. It sent
one local result notice to the same existing Dots conversation and received a
native receipt. It did not retry an instruction, create a conversation or change
credentials or account settings.

This passes **one finite post-response read/attention trial**, not safe guidance,
an automated decision-return channel, service restart continuity, the five-minute
intervention objective or overnight supervision. The local record does not reveal
whether Dots attempted its own follow-up tool or declined it; do not infer a
permission denial, permanent incompatibility or successful target delivery from
that absence. No target reply was verified, so a post-reply file comparison was
not completed either.

A subsequent local `status` check reported the service offline. That is a runtime
observation, not a failure of the earlier completed diagnostic; continuous
supervision is not currently established.

## Earlier planning relay check: 2026-10-03

For the existing-session supervision plan, an ordinary Node process used the
installed official `codex-app-tools` 0.1.5 relay with genuine executor context to
read metadata for the selected existing actual Dots conversation on its durable
host. The host returned the expected conversation and an idle state. Combined
with the earlier local Codex read, this establishes the program's access to local
Codex content and Dots engine metadata, **not direct tool access from Dots or a
read of its user-facing conversation**.

The send and wait methods were advertised; neither was used to send a message in
this planning check. It started no AI conversation or model request and opened
no external tunnel. A finite read-only diagnostic ran for ten minutes but expired
before the source response ended. Its result was
`source_turn_completion_not_observed`, with no message sent. This is a timing
failure of that trial, not evidence that background context was denied. No
post-response Dots decision or unattended acceptance is claimed by that check.

The [interview and validation plan](overnight-supervision-plan.md) keeps Codex
app as the first real target, all five products as the eventual support goal,
safe same-ID resumption after confirmed owner exit, and a measured five-minute
intervention objective. Correlated existing-app messages are a proposed fallback
that still requires real send, response and background-lifecycle evidence.

## Latest bridge/service check: 0.1.2 (2026-10-03)

The implementation check after the documentation snapshots below passed
`npm run typecheck`, `npm run build` and **55/55 automated tests**. The earlier
instruction round-trip failure was fixed by omitting an inapplicable undefined
host signature. The duration regression now establishes running work before
advancing its recorded deadline, avoiding a startup-timing-dependent assertion.
The app-host suite now has eight tests, including pause during transport startup
and service shutdown before native dispatch; the gateway suite has seven.

The published bridge snapshot `a56ed569627dfc3b95759f2782afbbe1757c69b6` passed
the dedicated Windows local CI: install, typecheck, **55/55 tests**, build, package
allowlist and unchanged-source fingerprint. The package and receipt remain on
the local runner. [CI run 37032763913](https://github.com/OtterHelm/kingdots/actions/runs/37032763913).

| Check                               | Result and scope                                                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Real Windows local service          | Restarted at version 0.1.2 with genuine existing executor context                                                                        |
| Installed official app bridge       | `codex-app-tools` 0.1.5 read the selected existing local Codex chat and its actual running state                                         |
| Active-session protection           | Preparing a follow-up to that running chat was rejected; no native instruction was sent                                                  |
| Existing authentication             | ChatGPT login/standard-provider preflight passed; this was not a model call or a per-session billing measurement                         |
| Local plugin                        | 0.1.2 installed/enabled; official SDK discovered all 18 local MCP tools                                                                  |
| Dashboard                           | Browser fixture passed registration, details, pause/resume, selected-watch OAuth consent, grant revocation, Dots panel and mobile layout |
| Dependency advisories               | `npm audit --json`: zero known advisories for the installed lockfile                                                                     |
| Actual Dots discovery/write/wake-up | **Still unverified**; no external gateway, new AI chat, API key or billing setup was created by this check                               |

This establishes one actual local read through the relay. It does not establish
safe live sending, durable app context after the caller ends, compatibility with
every installed app version, hosted OAuth linking, or Dots supervision after its
initial response. App-host idle preflight is not an atomic host reservation.
The temporary browser OAuth grants used only a local fixture and fictitious watch.

The user subsequently authorized a bounded temporary HTTPS/Dots test. Official
Cloudflare `cloudflared` 2026.9.3 was downloaded and its published SHA-256 digest
matched. The execution environment's tool policy rejected the tunnel launch
(`blocked by policy`). No tunnel or account connector was created, and the bounded
local watch was paused. This is an infrastructure execution restriction in this
test environment, not evidence that hosted Dots linking is impossible. No live
instruction or post-response Dots acceptance was performed.

## Earlier documentation snapshot: 0.1.2

Retested on **2026-10-03 (Asia/Seoul)** after source changes during documentation
work. Package, lockfile and plugin manifests now declare `0.1.2`. This is local
working-tree evidence, not a released-package or GitHub CI receipt.

| Check                                         | Result                            | Scope                                                                                                            |
| --------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                           | Passed                            | Service and dashboard                                                                                            |
| `npm run build`                               | Passed                            | TypeScript and Vite output                                                                                       |
| `npm test`                                    | **52 passed, 1 failed; 53 total** | Controlled fixtures, no provider model calls                                                                     |
| App-host tests                                | 6 passed                          | Includes subscription-only authentication policy                                                                 |
| OAuth gateway tests                           | 7 passed                          | Includes official SDK HTTP connection and revoked event-owner checks                                             |
| Documentation validation                      | Passed                            | Relative links checked, both watch examples parsed against the current schema, all 18 local MCP tools documented |
| Real Dots/host/external deployment acceptance | Not tested by this check          | Remains a separate gate                                                                                          |

The remaining failure is the duplicate prepared-instruction comparison in
`tests/watch.test.ts`: undefined `hostSignature` is absent after JSON persistence.
The earlier 16-versus-18 tool assertion now passes. The full `prepack` release
gate remains unpassed by this check. This documentation work does not modify the
implementation or its tests; it records their observed current status.

## Earlier working-tree check during this update

Checked locally on **2026-10-03 (Asia/Seoul)** while updating documentation.
At that initial check, package/plugin manifests declared `0.1.1` while new
app-host/gateway protocol strings declared `0.1.2`. The later retest above records
the updated manifest versions and test outcome.

| Check                                          | Result                                 | Scope                                                                                   |
| ---------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------- |
| `npm run typecheck`                            | Passed                                 | Service and dashboard types                                                             |
| `npm run build`                                | Passed                                 | TypeScript output and Vite dashboard                                                    |
| `npm test`                                     | **48 passed, 2 failed; 50 total**      | Controlled fixtures, no provider model calls                                            |
| App-host fixture tests                         | 5 passed                               | Send-once, fresh-state fencing, unknown delivery, intervention and transport provenance |
| OAuth gateway fixture tests                    | 5 passed                               | Local consent/cookies/PKCE, rotation/revocation, scopes and restricted listener         |
| Real app-host read/send                        | Not tested in this documentation check | Fixtures do not establish installed-host compatibility                                  |
| External proxy and actual Dots linking/wake-up | Not tested                             | No external deployment, account connection or unattended acceptance                     |
| Package release gate                           | Not passed by this check               | The failing full suite prevents a clean `prepack` gate                                  |

The failures were in `tests/watch.test.ts`:

- A duplicate prepared-instruction comparison differs because an undefined
  `hostSignature` property is omitted when the record is persisted as JSON.
- The public tool-count assertion expects 16 while the registry now exposes 18.

This documentation change records the observed failures; it does not modify the
underlying work-in-progress implementation or turn the earlier successful CI
receipt into evidence for the new bridge/gateway. Rerun and append fresh results
after those sources change.

## Verified observer installation: 0.1.1 (2026-10-02)

Version 0.1.1 implements local records for Dots supervising user-selected existing
sessions. The essential Dots connection gate has not passed. This workflow does
not create workers or worktrees.

| Check                                   | Result                                           | Evidence and limits                                                                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local Windows CI                        | Passed                                           | [Run 37011862699](https://github.com/OtterHelm/kingdots/actions/runs/37011862699), commit `912a2e0898a48de98f1bcff5717d09d76b950058`: types, **40/40 tests**, build, package and source fingerprint |
| Observer safety                         | Passed in controlled tests                       | Existing-session registration without new workers; fresh observations; duplicate claims; unknown delivery; intervention; restart fencing; referenced completion conditions                          |
| Local dashboard                         | Passed controlled browser check                  | Registration, details, pause/resume, Dots panel and mobile layout with a fictitious session; no real session control                                                                                |
| Installed local plugin                  | Passed                                           | `kingdots@kingdots-local` 0.1.1 installed and enabled; absolute stdio executable and data-directory paths                                                                                           |
| Local MCP                               | Passed                                           | Official SDK connected to the installed stdio configuration, listed **16 tools**, queried watches and discovered event protocol `2026-07-28`; no provider model calls                               |
| Actual Dots kingdots tools              | **Not connected in the tested Dots environment** | User-authorized probe of the existing dot found no `kingdots`, `watch_list` or `capabilities_list` tools; neither query could be called by Dots                                                     |
| Actual Dots existing local session read | **Attempted; failed**                            | Official `cloud_threads.read` call failed with `unsupported placement format version 2`; the local Codex caller's successful read does not substitute for a Dots read                               |
| Actual Dots same-session instruction    | Not tested                                       | Probe was read-only; no message or interruption was sent to the selected coding conversation                                                                                                        |
| Actual Dots event/check-in              | **Unverified**                                   | Dots queried available event sources and reported kingdots absent. Scheduled-check tools were present, but no schedule was created or post-response execution tested                                |
| Live kingdots subscriptions             | None at check time                               | Local subscription count was 0; no recorded Dots decision. An empty count alone is not proof that the host lacks event support                                                                      |
| Account/permission/billing changes      | None                                             | No API key, tunnel, computer-access grant, billing change, new session or worker was created by this check                                                                                          |

The actual Dots report was delivered in its existing conversation. That report
proves the bounded probe ran; it does **not** prove kingdots can wake Dots, read or
control local sessions, or finish overnight supervision. The placement error is
an observed host compatibility failure; its underlying cause is not established.
Do not label it a permission denial or promise that a reconnect will fix it.

### Retest after personal-PC access was granted

The user subsequently enabled the dot's personal-PC access and authorized a
bounded retest in the same existing dot conversation. The dot called
`cloud_threads.list_environments` and confirmed that the PC was connected,
attached and authorized for tasks.

That connection did not expose a direct official read tool for the selected
existing local conversation. Dots reported that its available PC execution route
would create a separate task conversation, which the user had excluded. It did
not use that route, repeat the earlier failed cloud read, send a test instruction,
or create a one-time schedule. kingdots tools remained absent from its tool list.

The retest therefore confirms **personal-PC connection only**. Existing-session
reading, sending and post-response requery remain blocked or untested. New
sessions, credentials, billing and files were not changed. Usage was unavailable,
not measured as zero. Neither Dots's built-in supervision nor kingdots's ability
to supply the missing connection has passed this user's scenario.

## Installation is not actual Dots access

The Codex-local plugin install and ChatGPT's account plugin connections are
separate. The checked ChatGPT personal-plugin page had no entries. The initial
browser view confirmed only the cloud computer. Personal-PC access was later
confirmed by the actual Dots retest above; that did not establish a working
existing-session or kingdots tool connection. These observations do not prove all
local plugin paths unsupported.

According to [Dots computers and apps](https://learn.chatgpt.com/docs/dots/computers-and-apps),
personal-PC access is separately enabled in the ChatGPT desktop app on that PC.
Codex computer access and Work Sync alone are insufficient. Availability of the
specific local kingdots plugin must still be proved by a real Dots tool call.

According to [MCP Events](https://developers.openai.com/plugins/build/mcp-events),
the actual host must discover and subscribe to events and verify a signed
callback. Local protocol discovery, a webhook `2xx`, instruction claims and
`decision_ack` each prove separate steps; none alone proves post-response Dots
judgment. An API-key tunnel remains disabled under the no-API-billing constraint.

## Remaining acceptance

- Expose kingdots tools to actual Dots and successfully call read-only queries.
- Read a user-selected existing local coding session through a working official
  host route; reconcile ownership and current activity before any write.
- Prove authorized guidance reaches the same existing session without a second
  process, a new session, or interruption of healthy work.
- After the initial Dots response ends and without another user message, handle a
  routine question and an error, inspect fresh test/artifact evidence and report.
- Verify pause, manual intervention, unknown delivery and recovery with the real
  host, beyond controlled local tests.

Claude Code, OpenCode and Codex/Claude desktop external control remain experimental
or unverified. No coding-agent model calls were made in this connection check;
the actual Dots probe uses the existing product allowance. Broader adapter work
does not replace the required Dots/Codex existing-session acceptance.

## Historical worker experiment: 0.1.0

Earlier tests used Windows, Node.js 24.18.0, npm 11.16.0, Git 2.55.0.windows.3 and
Codex CLI 0.145.0 with existing ChatGPT login. That version passed 29 controlled
tests plus a live Codex repair, follow-up, interruption and worktree-preservation
experiment. Its supervisor was a test script, not actual Dots. Public worker
creation/execution endpoints were disabled in 0.1.1; those results are historical
and **cannot pass the current overnight supervision requirement**.

See [test scope](verification.md), [connection acceptance](dots-connection.md) and
[interfaces](interfaces.md). Keep tested versions, actual failures and untested
steps distinct whenever this record is updated.
