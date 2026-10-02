# Repository instructions

## Keep documentation current

When changing behavior, update affected documentation in the same change.
This is an ongoing repository requirement, including work in progress.

- Keep `README.md` and `docs/README.ko.md` aligned on design intent, technical
  features, support limits, installation, deployment and usage.
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
