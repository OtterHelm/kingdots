# Deployment and upgrades

kingdots runs on the user's Windows PC under that user's permissions. It is
distributed as source or an npm-compatible tarball. External HTTPS infrastructure
is optional and separately operated. The current CI produces local packages;
registry publication and service replacement are not automated.

## Source installation

Requirements: Windows, Node.js 24, npm and Git. Have the selected coding sessions
and provider sign-in already available. The `install-plugin` command requires the
Codex executable. Other operating systems have not been validated.

```powershell
git clone https://github.com/OtterHelm/kingdots.git
Set-Location kingdots
npm ci
npm run typecheck
npm test
npm run build
node dist/cli.js start
node dist/cli.js install-plugin
node dist/cli.js open
```

`start` launches a hidden background process and is idempotent for a live service
using the same data directory. `serve` runs in the foreground. `status` reports
the local URL, PID, separate `gatewayUrl`, app-host prerequisites and gateway
configuration. `stop` requests service shutdown; it leaves original coding sessions
running. This CLI does not install automatic service startup at Windows login.
Shutdown fences new host dispatch before draining in-flight HTTP requests, then
waits for any already-started host receipts before closing persistent records.

## App-host prerequisites

For `source: app_host`, start the service through an existing Codex chat executor.
The bridge requires genuine `CODEX_THREAD_ID` and `CODEX_APP_TOOLS_PIPE_PATH`, plus
an installed `codex-app-tools` server under the actual Codex plugin cache. Do not
invent those values or copy another conversation's context to bypass host controls.

The service inherits context at startup. Running `start` in a Codex executor does
not change the environment of a service already started from an ordinary terminal.
Pause management, inspect delivery state and stop/restart when changing that context.
Check `status.appHost`, then an actual `watch_host_read` of the enrolled local
session/project. `available: true` establishes prerequisites, not host compatibility.

`doctor` inspects provider adapters; it does not establish app-host or actual Dots
connectivity. The installed app-tool version remains a compatibility dependency.
See [connection and acceptance](dots-connection.md).

Writes also check existing ChatGPT login and standard provider configuration.
API credentials, custom providers and unknown authentication are blocked before
dispatch. Reads/context availability alone do not establish permission to send.

## Configuration and local records

| Setting                                   | Behavior                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `--data-dir PATH`                         | Highest-priority data directory; pass it consistently to commands                                       |
| `KINGDOTS_HOME`                           | Data directory when no CLI override is supplied                                                         |
| Default directory                         | `%LOCALAPPDATA%\kingdots`; preserve existing `%LOCALAPPDATA%\DotsKing` when the new directory is absent |
| `KINGDOTS_PORT`                           | Dashboard/local API port; default `0` chooses an available port                                         |
| `KINGDOTS_GATEWAY_PORT`                   | Separate gateway port; default `0` chooses an available port                                            |
| `gateway-configure --origin HTTPS_ORIGIN` | Persist the gateway's external HTTPS origin; no path, query, credentials or IP literal                  |

Both listeners bind to `127.0.0.1`. For example, set ports before starting a stopped
service if an external proxy needs a stable gateway target:

```powershell
$env:KINGDOTS_PORT = '47100'
$env:KINGDOTS_GATEWAY_PORT = '47101'
node dist/cli.js start
node dist/cli.js status
```

Records include `kingdots.sqlite`, `secrets.bin`, `instance.json`, `service.lock`,
`service.log` and the generated local plugin marketplace. SQLite stores watches,
observations, commands and hashed OAuth token records. Windows DPAPI protects local
UI/MCP tokens and callback secrets for the current user. Do not publish the data
directory or authenticated dashboard URLs. A copied DPAPI vault is not a portable
cross-user credential backup.

The installed plugin contains absolute Node, CLI and data-directory paths. Moving
the checkout or changing Node/package/data locations requires `install-plugin`
again. Local MCP and the service must point to the same data directory.

## Package installation

From the source checkout:

```powershell
npm pack
$packageVersion = node -p "require('./package.json').version"
npm install --global ".\kingdots-$packageVersion.tgz"
kingdots start
kingdots install-plugin
kingdots open
```

`prepack` runs types, tests and build before creating the tarball. It includes
`dist`, `web-dist`, `plugins`, `docs`, README, license, notices and package metadata.
The current manifest supplies the filename; do not assume registry availability.
In Windows shells that block npm PowerShell shims, use `npm.cmd`.

## External gateway deployment

1. Choose a stable HTTPS hostname and separately configure a TLS proxy or tunnel
   forwarding to `status.gatewayUrl`. Preserve the configured hostname and OAuth
   browser cookies; do not cache OAuth/MCP responses.
2. Forward only the gateway listener. The dashboard listener, `/api/*`, local UI
   token and local MCP token remain private on the PC.
3. Run `gateway-configure --origin https://YOUR_GATEWAY_HOST`. This persists issuer
   and resource URLs; it does not create DNS, TLS, forwarding or a ChatGPT connector.
4. Follow [Dots connection](dots-connection.md) for connector compatibility, local
   consent, selected-watch permissions and real acceptance.

An unconfigured gateway rejects requests. Origin changes revoke existing grants.
The external connection remains experimental and the deployed proxy is outside the
controlled gateway tests. The disabled API-key Secure MCP Tunnel is a different
transport; this OAuth gateway does not need a Platform API key.

## Upgrade and recovery

1. Pause management and inspect queued, in-flight and `unknown` instructions.
   Unknown delivery must be reconciled against the original host before further sends.
2. Stop the old service. Retain the data directory; make any database backup after
   shutdown so the SQLite state is consistent.
3. Build/install the new source or tarball. Start with the same data directory and
   genuine app context when using `app_host`.
4. Run `install-plugin`, reload supported plugin connections and inspect tools in
   a fresh conversation. Existing running processes do not reload changed files.
5. Check status, proxy target and actual reads. Explicitly resume paused watches
   through the authenticated dashboard and collect fresh observations.

Restart pauses automatic management, increments the ownership epoch, cancels
proven-unsent queued commands and retains uncertain sends. There is no automatic
retry of unknown delivery. The current public app-host tools do not expose a manual
receipt/reconciliation override; unresolved app-host delivery remains a recovery
limit rather than a reason to edit records or bypass the reservation.

## CI and releases

The trusted Windows runner executes install, types, tests, build, package allowlist
and unchanged-source checks. It keeps the tarball, hash and receipt locally.
Publishing to npm, GitHub Releases, running-service replacement and external proxy
configuration require separate release work. See [local CI](local-ci.md),
[verification](verification.md) and [contributing](CONTRIBUTING.md).
