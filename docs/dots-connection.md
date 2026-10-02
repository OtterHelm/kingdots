# Connect Dots without API billing

The default connection is local stdio MCP. No Platform API key, tunnel runtime,
model API fallback, payment setup or automatic credit purchase is used.

Run `kingdots install-plugin` (or `node dist/cli.js install-plugin` from a built
checkout). This prepares a dedicated per-user local marketplace, binds absolute
Node/CLI paths and installs the local plugin through the supported Codex CLI.
It preserves other marketplace entries and never handles provider API keys.

Alternatively, build/install the CLI, then use the repo marketplace at
`.agents/plugins/marketplace.json` to install `kingdots@kingdots-local` through
the desktop app or supported Codex plugin CLI. The package's MCP command is
`kingdots mcp`. For a checkout without a package installation, register the
absolute Node/compiled CLI paths with `codex mcp add` instead. The CLI uses the
same per-user protected local service tokens; those are not paid provider API keys.

Restart or reload supported plugin connections, connect the computer to the
actual dot through its profile, and test that the dot can use the local tools.
Ordinary Codex plugin discovery is not proof that the cloud dot can use them.
See [computer and app access](https://learn.chatgpt.com/docs/dots/computers-and-apps)
and [local plugins](https://developers.openai.com/plugins/build/plugins).

If direct local events cannot wake Dots, use only a supported task-specific
scheduled check-in in the actual Dots environment and run the acceptance below.
Do not manufacture an API supervisor or claim an ordinary chat heartbeat is Dots.

## Optional official tunnel path — disabled

The following reference is retained for interoperability. Do not start this path
under the current no-API-billing requirement. It needs a runtime API key, and the
official guide does not establish a transport price. An inert tunnel may exist
in the account; without a runtime/client it does not forward local tools.

This is a user-operated account setup step. Review credentials, tunnel
associations, developer-mode access, and plugin permissions before proceeding.
Do not paste secrets into an AI conversation or repository files.

1. Install/build kingdots and make its CLI available to the tunnel process.
   Start the service and run `kingdots doctor`.
2. Follow the [official Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).
   Create a tunnel associated with the intended Platform organization and
   ChatGPT workspace. A tunnel runtime API key is required; it is not a new
   judgment model and does not establish provider usage accounting.
3. Configure the official tunnel client to invoke the stdio command
   `kingdots mcp`. Alternatively use the absolute Node and compiled CLI paths.
   Pass the same `KINGDOTS_HOME` as the service. The stdio bridge authenticates
   locally without putting the dashboard token into the tunnel profile.
4. Run the official client's `doctor`, then `run`. kingdots implements legacy
   MCP initialization for local clients and the `2026-07-28` discovery/event
   methods for the documented MCP Events integration. The installed tunnel
   and Dots versions must be tested for compatibility.
5. Register a developer-mode plugin using the tunnel connection. Add the
   management skill from `plugins/kingdots/skills/manage-work/SKILL.md` through
   a supported plugin authoring workflow. Do not invent connector IDs or
   manually substitute tunnel IDs into an undocumented manifest field.
6. Ask Dots to manage a selected small Git project with explicit checks.
   Subscribe to `task.attention_required` and `task.completed`, with
   `arguments: {taskId: "the-created-id"}`. The subscription API verifies the
   signed callback and persists its owner, filters, expiration, and delivery
   records. Secret storage uses the local protected vault.

The [official MCP Events guide](https://developers.openai.com/plugins/build/mcp-events)
defines callback verification, Standard Webhooks signatures, and payloads.
kingdots retries transient webhook failures up to five attempts, preserving
the event ID. It stops retrying rejected or expired endpoints and never follows
redirects. Callback DNS addresses are checked and pinned on every connection.

## Required end-to-end acceptance

- Record the original Dots request, selected task ID, and subscription.
- Let the original response finish, then provide no further user message.
- Observe the worker result, saved verification, webhook receipt, and Dots's
  subsequent `task_get`/`decision_ack`/follow-up activity.
- Exercise a failing check, a repair instruction, and fresh passing checks.
- Confirm Dots's final evidence-based report reaches the user.
- Confirm no intermediate approval is requested for scoped routine work.
  Confirm required provider permission prompts still wait for the user.
- End the subscriptions/follow-up schedule after completion or release.

Webhook `2xx` only proves receipt. `decision_ack` records a follow-up observed
through MCP but cannot prove the original response ended or the final report
was delivered. The dashboard therefore keeps unattended acceptance unverified
until the real scenario is independently observed and documented.

If event connectivity is unavailable, test a supported Dots scheduled check-in
with this same acceptance scenario. Reuse the existing task context and stop
the follow-up after completion/release. kingdots does not create account
schedules or a replacement model loop itself.

The computer, desktop app, service, and tunnel must remain online for local
steps. Work does not silently migrate to a different machine or cloud folder.
