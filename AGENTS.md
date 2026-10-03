# Repository instructions

## Keep documentation current

When changing behavior, update affected documentation in the same change.
This is an ongoing repository requirement, including work in progress.

- Keep `README.md` and `docs/README.ko.md` aligned on design intent, technical
  features, support limits, installation, deployment and usage.
- Treat the two READMEs as equivalent translations: preserve the same sections,
  paragraphs, table rows, examples, commands, links and support claims. Translate
  prose and labels and adjust relative links for their directories; do not add
  language-specific content or make one README a shortened summary. Update both
  whenever shared content changes.
- Keep READMEs focused on project introduction and usage. Put dated test counts,
  failed connection probes, experiment history and detailed release gates in
  verification/connection documents. Summarize current experimental support once
  in the README support section instead of repeating warning banners.
- Update `docs/interfaces.md` for tool, schema, route, scope, source, event or
  delivery changes.
- Update `docs/deployment.md` and `docs/dots-connection.md` for CLI/configuration,
  packaging, upgrade, host prerequisite or connection changes.
- Update `docs/roadmap.md` when implementation status or release gates change.
- Add dated results to `docs/verification-results.md` only for checks performed.
  Preserve historical evidence and identify the tested version or working tree.
  Keep controlled fixtures and actual Dots acceptance distinct.
- Keep security review dates and dependency notices tied to the snapshot actually
  reviewed. A documentation edit is not a new security audit.
- Follow `docs/CONTRIBUTING.md` for contributor validation and documentation scope.

Base claims on source, manifests, tests and recorded verification. Do not describe
planned, experimental or unverified paths as released support. Do not publish local
account/session IDs, personal machine paths, tokens, callback secrets or private logs.

## Prevent security and privacy regressions

- Record confirmed security/privacy issues in `docs/security-review.md`: affected
  snapshot, trigger, root cause, impact, fix, regression evidence and remaining
  limits. Preserve history and add only checks actually performed to
  `docs/verification-results.md`; never include raw secrets or personal values.
- A security fix needs a focused reproduction that fails before and passes after
  the fix. Authentication must follow the router's matched route, including
  encoded aliases, and preserve the separate UI/MCP token roles.
- Enforce request/response byte limits during streaming. Checking only after
  reading the whole body is not a memory bound. Cover understated Content-Length.
- Audit both root and relay lockfiles. A clean dependency audit does not prove
  source authentication, privacy or session control is safe. Validate overridden
  build dependencies with the affected tool before reporting a fix.
- Before publication, check current source, reachable Git history and packaged
  files. Check available public CI logs separately when CI or privacy boundaries
  change. Source scans and `.gitignore` do not protect Actions logs.
- Never hard-code runner identity in workflows. Self-hosted jobs require the
  approved privacy-ready setting and encrypted masking values before starting.
  Verify actual new job logs, including setup output. Do not report skipped jobs
  or configured masking alone as a successful privacy/CI check.
- A runner account, machine or home-path change requires new masking validation.
  Preserve explicit pauses and local evidence while upgrading security fixes.
- Deleting public logs and uploading personal masking values require the owner's
  explicit authorization. Keep approved local backups and workflow results.
