# Security and publication review

This records the 0.1.0 source/publication review. Version 0.1.1 changes the public
workflow to existing-session observation: worker creation/execution is disabled,
permission decisions remain in the original host, and completion evidence is
explicitly host-reported. Its added regressions cover observation replays, one-time
instruction claims, uncertain delivery, intervention and restart fencing. These
checks do not verify the actual Dots wake-up or external host control connection.

Reviewed on **2026-10-02**. This is a scoped source review, regression verification,
dependency advisory check, and publication scan. It is not an independent penetration
test or a guarantee that the preview has no vulnerabilities.

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
