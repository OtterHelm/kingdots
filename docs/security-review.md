# Security and publication review

## 2026-10-04 — 0.1.5 security and publication review

Reviewed the 0.1.5 working tree based on `493d4cb572ec2fff01d64bf684cb2ce2f6b390ab`.
This covers source authentication, bounded transport, dependency advisories,
current source, reachable history, packaged files and available public Actions
logs. It is a scoped review, not an independent penetration test.

### Confirmed issues and fixes

1. **Encoded local-route authentication bypass.** In 0.1.4, the authentication
   hook classified the raw URL while Fastify could route an encoded spelling to
   the same handler. An isolated unauthenticated API read returned 200, and an
   encoded spelling could change which UI/MCP token was expected. Version 0.1.5
   authenticates Fastify's matched route. The regression failed before the fix
   and passes after it, including token-role separation and permitted valid calls.
   This affects clients that can reach the local listener; loopback binding is
   not authentication. Replace older running builds. The installed 0.1.5 service
   rejects unauthenticated encoded API and MCP requests with 401.
2. **Transport byte limits were applied after full buffering.** Request/response
   size checks rejected large bodies only after reading them. Controlled streams
   demonstrated consumption of their entire oversized contents. The relay now
   cancels input beyond 96 KiB, and the PC cancels responses beyond 128 KiB while
   reading. Regressions cover a dishonest Content-Length and early cancellation.
   Relay audience, pairing and target scope are unchanged.
3. **Schema-tool development dependency advisory.** The relay lockfile included
   esbuild 0.18.20 through the deprecated esbuild-kit chain. npm reported four
   affected-package entries for one moderate advisory,
   [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99).
   A targeted override pins nested esbuild to 0.25.12. A clean lockfile/install
   resolved the stale nested entry; schema generation passed with no migration
   change. Both root and relay audits now report zero known advisories, and CI
   audits both lockfiles. This was development tooling, not a model API runtime.
4. **Runner identifiers in public CI logs.** Source/history/package checks found
   no known personal values, but 21 of 22 available Actions logs contained the
   PC name, Windows account name and home path. No known key/token, Codex session
   ID or app pipe matched in those logs. The owner approved deletion of those
   public logs and encrypted repository masking values, with local backups and
   run results preserved. Actual cleanup and new-job masking results are recorded
   in [verification results](verification-results.md). A privacy-ready variable
   gates self-hosted jobs so an unconfigured runner does not emit new metadata.
   Masks must be present before job setup; a later step cannot erase earlier logs.

### Publication checks

- Gitleaks 8.30.1, downloaded from its official release with a matching published
  checksum, found no credential-signature leak in all 22 reachable commits, the
  proposed source or 22 available Actions logs. Scans run locally with redacted
  output; raw records are not uploaded by the scanner.
- A separate comparison checked available local vault credentials and Codex
  authentication values, private connection IDs/email, registered-session IDs,
  PC/account identifiers and personal paths. No matches in 78 source files,
  306 unique history blobs or the 92-member package. Synthetic URL-authority
  email candidates in test fixtures were reviewed; they are not actual contacts.
- Git authors/committers use GitHub noreply addresses. License attribution is
  retained. GitHub secret scanning and push protection are enabled, with zero
  open secret-scanning alerts at the check. Non-provider patterns/validity checks
  and automatic Dependabot security updates were not enabled by this work.
- The inspected Windows database/vault ACLs had no allow rule for Everyone,
  built-in Users or Authenticated Users. This is evidence for that installation,
  not every custom data directory.

### Remaining boundaries

Known-advisory checks and these regressions cannot guarantee absence of every
vulnerability or unknown personal value. No independent penetration test, broad
fuzzing campaign or complete third-party/platform audit was performed. Same-user
processes can decrypt DPAPI; local conversation records are plaintext and may
contain private text. Authorized relay snapshots cross a private hosting boundary
and masking is not complete anonymization. Authenticated account provenance does
not independently prove Dots authorship. Human authorization remains an assertion
for trusted clients, and follow-up scope is not a semantic prompt sandbox.

App-host preflight and send are not an atomic host reservation. Unknown delivery,
other providers and actual unattended Dots control remain separately unverified.
The security upgrade preserves explicit pauses and original sessions.

## Earlier review records

This records the 0.1.0 source/publication review. Version 0.1.1 changes the public
workflow to existing-session observation: worker creation/execution is disabled,
permission decisions remain in the original host, and completion evidence is
explicitly host-reported. Its added regressions cover observation replays, one-time
instruction claims, uncertain delivery, intervention and restart fencing. These
checks do not verify the actual Dots wake-up or external host control connection.

Reviewed on **2026-10-02**. This is a scoped source review, regression verification,
dependency advisory check, and publication scan. It is not an independent penetration
test or a guarantee that the preview has no vulnerabilities.

## App-host and gateway boundaries in the earlier reviewed snapshot

Documentation updated on **2026-10-03** to describe current source. This addition
does not extend the historical publication scan, dependency audit or security
review below to the new working tree.

- The installed app-tool bridge requires genuine executor context, checks the
  selected local Codex session/project and rechecks idle state before sending.
  Preflight and send are separate operations; no atomic host reservation exists.
  Writes additionally require existing ChatGPT authentication and standard provider
  configuration; API-key, custom-provider and unknown contexts are blocked.
- The gateway uses a separate loopback listener and exposes scoped OAuth/MCP,
  without the dashboard/local API. External HTTPS forwarding must target only
  that listener, and needs its own deployment review.
- S256 PKCE, exact supported callback/resource matching, a browser-bound consent
  cookie, local code confirmation, expiring single-use codes and rotating refresh
  tokens constrain authorization. Access/refresh token hashes are in SQLite.
- The authenticated local UI selects existing app-host watches and read/manage
  scopes. Revocation pauses watches managed by that grant and stops its events;
  origin changes revoke prior grants. Local clients retain their own authority.
- `allowedFollowUp` is a recorded scope for Dots to honor, not a semantic prompt
  sandbox. Claimed direct-user authorization is not cryptographic proof.
- Unconfirmed app-host sends remain unknown and reserved. Public manual receipts
  cannot forge app-host provenance; a verified recovery path is still needed.

The 2026-10-03 implementation review checked these scope/authentication boundaries
against the source and controlled regressions. All 55 tests passed, including
eight app-host and seven gateway tests. Pause/closure is checked immediately before
native dispatch after asynchronous transport startup; shutdown waits for receipts.
An already-dispatched request cannot be recalled by this local fence.
The actual local host read and active-session rejection also passed.
See [dated results](verification-results.md).

`npm audit --json` again reported zero known advisories for the installed lockfile.
No actual Dots link, unattended acceptance, deployed proxy review or independent
penetration test was performed. The historical publication scan below remains
limited to its stated snapshot.

The current 0.1.2 publication scan checked 75 tracked/nonignored source files for
credential signatures, private keys, personal Windows paths and known local
identifiers; no matches were found. Local protocol probes, session snapshots,
OAuth fixtures and downloaded helper binaries remain under ignored `.kingdots`.
The package allowlist check passed for 90 members and excluded local records.

## Historical review: 2026-10-02

## Publication and privacy checks

- Scanned all three reachable commits through `5a5f323` (182 file versions) for
  provider/GitHub credentials, private keys, literal webhook secrets, known account
  identifiers, personal Windows paths, and the development machine identifier.
  No matching secrets or personal identifiers were found.
- Checked the current source for email addresses outside dependency notices.
  The matches were test fixtures and a malicious-host regression example.
  Git commit authors use the public contributor profile and GitHub noreply address.
- Confirmed that local records, `.kingdots`, environment files, authentication
  files, SQLite databases, logs, and generated tarballs are not committed.
  Package contents are independently checked by `scripts/ci.ps1`.
- Removed unrelated project names from the current public documentation. Earlier
  commits retain their original documentation; Git history was not rewritten.
- Dependency license notices retain the original authors' attribution as required.
- GitHub secret scanning and push protection are enabled. The repository's
  secret-scanning API reported zero open alerts at review time.

The scan checks known signatures and identifiers. It cannot identify every possible
secret format or guarantee that arbitrary future task logs contain no private data.
Do not publish the data directory, authenticated dashboard URLs, provider histories,
runner authentication files, or raw task logs.

## Dependency advisories

`npm audit --json` reported **0 known vulnerabilities** for the installed lockfile,
including development dependencies (287 dependency entries reported by npm).
This result is a snapshot of npm's available advisory database, not proof that every
dependency or provider executable is safe. Run the audit again when dependencies change.

## Source and regression review

| Area              | Observation and verification                                                                                                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local API         | CLI binds to `127.0.0.1`; UI and MCP use separate random tokens. User approval and management resume remain UI-only.                                                                                                       |
| Browser requests  | Host and same-origin checks run before routing. Regression tests cover missing/wrong tokens, cross-site origins, loopback addresses, and malformed/non-local Host headers.                                                 |
| Command execution | Local subprocess helpers use argument arrays with `shell: false`; unsupported Windows `.cmd` shims are refused rather than passed to a shell. Completion checks use the provider sandbox executor.                         |
| Workspace paths   | Artifact paths use realpath containment checks. File scope and current verification fingerprints are checked before completion.                                                                                            |
| Persistence       | SQLite values use bound parameters; command IDs, ownership epochs, and uncertain delivery prevent automatic duplicate execution.                                                                                           |
| Callback delivery | HTTPS only, public-address validation, pinned DNS lookup, signed payloads, bounded responses, and no redirect following. Callback regression tests cover private/mapped addresses, signatures, retries, and deduplication. |
| Credentials       | Windows vault secrets use current-user DPAPI. Provider diagnostic stderr is not retained. Codex API-key and unknown authentication are blocked; the default service holds unverified Claude/OpenCode execution.            |
| Local CI          | Dedicated runner, trusted `main` events, no PR checkout trigger, read-only workflow token, and no persisted checkout credentials. CI uses isolated provider configuration and excludes actual model work.                  |

Two issues were corrected during this review:

1. Splitting Host at the first colon admitted some non-loopback IPv6 literals and
   malformed ports. Host validation now accepts only exact loopback authorities
   with a valid optional port. This did not bypass bearer-token authentication.
   Regression tests reproduce the previously accepted forms and require rejection.
2. The unverified Claude adapter compared a shell command with a saved argument
   array joined by spaces. Shell metacharacters could change the meaning of that
   comparison. This automatic allow path was removed; Bash requests retain the
   explicit provider/user permission flow. Claude execution remains disabled in
   the standard service until its authentication and runtime are independently verified.

The focused API/callback regression suite passed all six tests after the Host fix.
The Claude permission regression also passed with an injected SDK fixture and no
provider process or model call.
The local CI also runs type checking, the complete automated suite, builds, and
package/source validation for each published `main` commit; use the run for the
specific commit as current evidence.

## Security boundaries and remaining work

- Authenticated MCP access is permission to operate the enrolled work. The
  `authorization.source` field records the caller's assertion; it is not
  cryptographic proof of a human instruction. Dots and the host must preserve
  the boundary between user instructions and repository/tool content.
- File scope is enforced through worker instructions and completion checks. It
  is not per-file OS access control. A worktree does not itself isolate arbitrary
  project scripts, Git configuration, or package lifecycle scripts.
- DPAPI does not isolate secrets from other processes running as the same Windows
  user. Task content and evidence are retained locally and can contain private data.
- Provider executables, local account configuration, and the self-hosted runner
  remain part of the trusted environment. Untrusted code must not be approved or
  merged merely because a workflow has read-only GitHub permissions.
- No independent penetration test, broad fuzzing campaign, or complete review of
  third-party source has been performed. Desktop control, other provider runtimes,
  and actual unattended Dots follow-up remain separately unverified.

Recheck credentials, dependency advisories, regression tests, and package contents
before releases. Describe the actual tested scope when reporting security results.

## 0.1.4 implementation scope change

The standalone PC OAuth gateway, duplicate local management-plugin installer,
finite device probe, legacy worker manager, adapter execution/approval handlers
and worktree creation code are removed. The existing private
relay is deployment source; its PC transport now runs in the main local service
and stores correlated jobs/reviews in the canonical database. Existing host tools
and their permissions remain in force. Imported old evidence has no current scope.

Relay traffic uses the configured trusted HTTPS origin with redirects rejected,
the native hosting service credential and separate pairing token. Returned account
identity does not independently prove Dots authorship. Conversation masking is
limited, so records may contain private text. Expired remote payloads are removed;
request-ID tombstones remain. Unknown result acknowledgments are held.

This description updates implementation boundaries; it does not refresh the
earlier audit date or claim an independent review of the consolidated runtime.
