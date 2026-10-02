# Contributing to kingdots

Preserve the existing-session design: Dots makes decisions, users select work and
scope, and kingdots retains observations and delivery records. Keep intervention,
uncertain delivery and completion evidence visible.

## Develop and validate

Use Windows, Node.js 24, npm and Git. From a checkout:

```powershell
npm ci
npm run typecheck
npm test
npm run build
```

`npm run dev` runs the service; `npm run dev:web` runs Vite. See
[deployment](deployment.md) for data directories and ports. Run checks appropriate
to the change; behavioral changes need relevant regression coverage. Controlled
tests use fixtures without provider model calls. `npm pack` runs validation and build.
The historical `test:live` calls a provider, consumes usage and is excluded from CI.

## Submit a change

Open an issue for a bug or substantial design proposal, or submit a focused PR.
Describe the problem, resulting behavior, checks and limits. Use fictitious
sessions in examples; remove account IDs, real session IDs, private paths, tokens
and raw provider output from public reports.

Use a matching commit/PR prefix: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`,
`test:` or `chore:`. External PRs do not automatically run on the maintainer's PC;
the self-hosted workflow runs trusted `main` changes. See [local CI](local-ci.md).

## Documentation belongs with the change

Keep both READMEs useful to a new user: purpose, design choices, technical functions,
support limits, installation, deployment and usage. Update relevant documents in
the same change, rather than deferring them to release.

| Change                                      | Documentation to review                               |
| ------------------------------------------- | ----------------------------------------------------- |
| User-visible feature or support status      | Both READMEs and `docs/roadmap.md`                    |
| Tool, schema, route, scope, source or event | `docs/interfaces.md` and examples                     |
| CLI, configuration, package or upgrade      | `docs/deployment.md` and both READMEs                 |
| Host or Dots connection                     | `docs/dots-connection.md` and support statements      |
| Test scope or acceptance gate               | `docs/verification.md` and dated verification results |
| Security boundary or dependencies           | Security review and applicable third-party notices    |

Check commands against the CLI/manifest, examples against schemas, tool counts
against the registry, and local links against real files. Preserve historical
results. Fixture tests, local host calls, OAuth tests and actual Dots wake-up prove
different steps. Record only observed evidence and do not refresh audit dates
without rerunning the audit. Persistent repository rules are in
[AGENTS.md](https://github.com/OtterHelm/kingdots/blob/main/AGENTS.md).

## License

Contributions use the repository's [Apache-2.0 license](../LICENSE). Retain
applicable notices and third-party terms.
