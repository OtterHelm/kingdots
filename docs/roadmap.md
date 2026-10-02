# Delivery roadmap

Implemented foundations: CLI lifecycle, durable task/command/event store,
worktree isolation, Codex execution and independent sandbox verification,
provider adapter contracts, MCP, signed webhook outbox, local dashboard,
user controls and installable plugin/package sources.

Release gates:

1. **Connections:** complete real capability tests for each installed provider.
   Verify Dots's local MCP and wake-up path without API billing on the actual
   account. Unsupported desktop features remain visibly planned.
2. **First automatic management:** pass a real Dots small-task flow including
   an initial response ending, failed verification, repair, fresh verification
   and final report. A scripted supervisor is insufficient for this gate.
3. **Other providers:** pass the same ownership, result, interruption and
   recovery scenarios for Claude Code/OpenCode and any supported desktop APIs.
4. **Multiple sessions:** extend native provider stress tests for event gaps,
   process restart, user intervention and independently scoped parallel work.
   The existing fixed-count-free task manager must retain its safety properties.
5. **Public distribution:** confirm all claimed capabilities against versioned
   evidence, review the package/license inventory, and explicitly publish the
   npm package/source/plugin through supported distribution channels.

API billing is prohibited. Native Codex workers enforce ChatGPT authentication;
other provider execution requires independently verified subscription/local-model
authentication before enabling. Official tunnel setup is disabled, and its
runtime key was not issued. No paid fallback is part of this release gate.

Accounts, credentials and publication are separate user-operated steps. Do not
turn a future roadmap item or an AI result into authorization to perform them.
