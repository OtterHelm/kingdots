# Verification results

Checked on **2026-10-02 (Asia/Seoul)**. Results describe the tested installation,
not universal support. Raw account, session and machine records stay in ignored
local storage; public documentation contains no account IDs or callback secrets.

## Current observer: 0.1.1

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
