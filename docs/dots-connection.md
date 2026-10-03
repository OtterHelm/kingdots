# Dots supervises existing sessions

The local plugin and experimental OAuth gateway supply kingdots records and
attention events. Dots remains the supervisor. Host access can use the local
`app_host` bridge or Dots's own verified tools on the `dots_host` path.

## Local setup

1. Build the checkout, start the local service and run `kingdots install-plugin`
   (or `node dist/cli.js install-plugin`). This refreshes the versioned installed
   plugin and binds absolute executable and data-directory paths.
2. Check the actual Dots profile separately. `install-plugin` installs a local
   Codex plugin; it does not register a private ChatGPT plugin or grant Dots access
   to the PC. Dots's cloud computer is also distinct from the personal computer.
   The documented personal-PC connection is in the ChatGPT desktop app on that
   PC: dot profile → Computers → Your computer → Allow access. Review that access
   explicitly; do not change credentials or permissions during a read-only check.
   A Codex computer connection or Work Sync alone does not grant Dots this access.
   Reload supported plugin connections and verify actual Dots tool calls. Do not
   assume a Codex-local plugin will be exposed to Dots automatically.
3. For `app_host`, start the service from a genuine existing Codex executor and
   inspect `status.appHost`. Verify an actual `watch_host_read` of the selected
   local session/project. `available` only reports prerequisites. A terminal-started
   running service will not acquire app context from a later `start` command.
   For `dots_host`, verify Dots's own official read/follow-up tools instead.
4. Enroll those existing sessions with `watch_create`. Registration must not start
   a session, resume a second process or prepare a new worktree.

See [deployment](deployment.md) for environment, ports and restart procedures.

## Experimental existing-app attention path

A bounded diagnostic using the installed official app-tool relay delivered
read-only attention messages to an already-existing actual Dots conversation.
Both replies appeared in its normal conversation. This does not require an
externally exposed endpoint, a new AI conversation or a model API key.

The tested native read/wait methods returned Dots engine metadata but omitted
those user-facing replies. Do not parse arbitrary transcript text or mark a
native send receipt as a returned Dots decision. Dots also reported an official
existing-cloud-task follow-up tool; acceptance of an existing local Codex target
still needs independent verification. This diagnostic is not a supported CLI or
plugin connection mode, and the installed plugin does not activate it.

One finite program also re-read the original Codex conversation and Dots metadata
and dispatched attention after the source response ended. It did not verify a
correlated same-session instruction and marker reply within its five-minute
window. Background read/notification evidence does not establish unattended
control, a stable standalone host contract or recovery after app/service restart.

See the [validation plan](overnight-supervision-plan.md) and
[dated results](verification-results.md) for the background, same-session,
authorization, intervention and overnight gates.

## Experimental external OAuth route

The current source adds a separate gateway for an OAuth-capable ChatGPT connector.
Actual registration, activation, connector compatibility and Dots tool exposure
remain unverified. These steps describe the implemented contract; they do not
imply every account exposes a compatible setup screen.

1. Start the local service with genuine app context. Register the existing local
   Codex session as `backend: codex-app`, `source: app_host` with its original goal,
   conditions and allowed follow-ups. The gateway cannot create watches.
2. Separately prepare a stable public HTTPS hostname forwarding only to
   `status.gatewayUrl`. Keep the dashboard/local API private and its tokens local.
3. Configure the origin on the PC:

   ```powershell
   node dist/cli.js gateway-configure --origin https://YOUR_GATEWAY_HOST
   ```

   This configures metadata; it does not deploy forwarding or register a connector.
   Set `KINGDOTS_GATEWAY_PORT` before startup if forwarding needs a stable port.

4. In an actually supported connector flow, use `https://YOUR_GATEWAY_HOST/mcp`.
   The client must support discovery, exact callback/resource and S256 PKCE.
   The browser shows a matching consent code.
5. On the PC, run `open`, inspect the Dots/connection panel, match the code and
   select eligible existing watches. Read permission is required; management is
   optional and must be requested by the client. Complete the original browser
   flow without exposing tokens or consent cookies.
6. Verify actual Dots calls `watch_list`, `watch_get` and `watch_host_read` for the
   selected watch. Verify unrelated watches and local APIs are inaccessible.
   Same-session sending needs its own user-authorized real host test.

Scopes are `kingdots:read` and optional `kingdots:manage`. The gateway exposes
12 selected-watch tools out of 18 local tools. One active gateway management
grant is allowed per watch; this does not lock local clients or the host.
Revocation pauses that grant's managed watches and stops its subscriptions.
Changing origin revokes old grants.

No Platform API key is required. The disabled API-key Secure MCP Tunnel is a
separate transport. See [interfaces](interfaces.md) for expiry, scopes and delivery.

See [Dots computers and apps](https://learn.chatgpt.com/docs/dots/computers-and-apps)
and [local plugin packaging](https://developers.openai.com/plugins/build/plugins).
Local tool discovery in a normal Codex chat does not establish actual Dots access.

## Historical connection observations: 2026-10-02

The 2026-10-02 check of version 0.1.1 connected to the installed local MCP plugin,
listed all 16 tools and queried watches without a provider model call. A separate,
user-authorized request to the actual existing dot found no exposed kingdots
tools. Its official `cloud_threads.read` call for the selected existing local
Codex conversation failed with `unsupported placement format version 2`. This
does not establish a permission failure or a successful session read.

Dots reported that scheduled-check tools were available, but kingdots was absent
from its listed event sources. No schedule was created and no post-response
wake-up was tested. Existing-session sending was deliberately not attempted.
See [verification results](verification-results.md) for the separate outcomes.
Registration, activation and host compatibility remain unresolved; an API-key
tunnel is not an acceptable fallback under this project's no-API-billing policy.

After the user enabled personal-PC access, actual Dots confirmed the PC was
connected and authorized through `cloud_threads.list_environments`. It still had
no direct official tool for reading the selected existing local conversation.
The available PC execution route would create a separate task conversation, so
it was not used under the no-new-session requirement. kingdots tools were still
absent. No instruction or one-time schedule was created; personal-PC access alone
has not passed this scenario.

## Wake-up and follow-up

On 2026-10-03, the version 0.1.2 local service used the installed official app-tool
relay to read the selected existing Windows Codex conversation and verify its
running state. A follow-up preparation was correctly rejected while it was active.
No live instruction was sent. This local proof does not substitute for an actual
Dots call or for durable host context after the caller's response ends.
The external OAuth route has not been deployed or connected to the user's account.

Use supported MCP Events or an actually supported Dots check-in. For the existing
event contract, subscribe to `task.attention_required`/`task.completed` using
`arguments: {taskId: watch.id}`. Keep subscription scope limited to enrolled watches.
The service retains signed verification, retry records and durable event cursors.
See [MCP Events](https://developers.openai.com/plugins/build/mcp-events).

On attention, Dots reads `watch_get` and refreshes original host state:

- For `app_host`, use `watch_host_read`, inspect returned conversation context,
  prepare a scoped instruction and call `watch_instruction_send`. The bridge
  rechecks an unchanged idle state, sends once and stores the transport receipt.
- For `dots_host`, use Dots's own official read, `watch_observe`, prepare/claim,
  actual same-session host send and `watch_instruction_receipt`.

If host access is unavailable, leave the instruction unsent and report the limit.
App-host permission/running/changed state blocks a prepared send. Lost host results
remain unknown and reserved; the public app-host path has no manual receipt override.
An idle preflight or kingdots reservation is not an atomic write lock on the host.

Do not manufacture a separate API supervisor or use an arbitrary normal-chat loop
as proof that actual Dots wakes automatically. Secure MCP Tunnel operation remains
disabled because its runtime requires an API key under the no-API-billing constraint.
No credentials, billing settings or account schedules are changed by this setup.

## Required acceptance

- Start an ordinary coding session before assigning supervision to Dots.
- Give Dots the exact session ID, original goal, scope and completion conditions.
- Let Dots's initial response end, then send no further user message.
- Observe healthy work without an unnecessary instruction or a new session.
- Reproduce a routine question and an error/stop. Observe actual Dots inspecting
  context and sending authorized follow-ups into that same existing session.
- Confirm Dots reads fresh test/artifact evidence and delivers the final report.
- Verify permission/user-only decisions stay pending, manual intervention fences
  automatic writes, and pause/release leaves the original session running.
- Verify a lost host response becomes unknown and is reconciled before another send.
- Stop the subscription/check-in when management is paused, released or completed.

Webhook `2xx`, instruction claims, host-reported receipts and `decision_ack` are
records of separate steps. None proves the initial response ended, the actual dot
woke, or a final report reached the user. This acceptance remains unverified.

Current fixture passes are recorded separately in [verification results](verification-results.md).
They do not complete actual Dots acceptance or supersede the historical probe.

The PC, desktop app and local service must remain available. Failure to read a
session must be reported as unknown/unavailable, not as healthy or completed work.
