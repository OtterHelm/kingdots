# Deployment and upgrades

## Prerequisites

The first validated OS is Windows with Node.js 24, npm and Git. Existing Codex app
reads require its installed official codex-app-tools and genuine executor context.
Start kingdots from an existing Codex chat's executor. Do not manufacture another
conversation or copy connection metadata to pretend a host context exists.
The host's existing authentication and permission checks remain in force.

Build with npm ci and npm run build; start with node dist/cli.js start and open the
dashboard with node dist/cli.js open. The service inherits its starting environment.
A service started elsewhere does not gain app context simply because the dashboard
is opened from Codex later. Check status.appHost and an actual selected-session read.

## Local service

One user-owned background Node process serves the API/dashboard and retrieves
pending Dots requests through outbound HTTPS. It uses windowsHide and normal user
permissions. There is no second PC OAuth listener, standalone device probe,
30-minute transport deadline or duplicate management-plugin installer.

| Setting | Meaning |
| ------- | ------- |
| --data-dir PATH | Explicit data directory |
| KINGDOTS_HOME | Data directory when the option is absent |
| KINGDOTS_PORT | Loopback port; absent defaults to an available port |
| start / serve | Background / foreground service |
| stop / status / doctor / open | Lifecycle, status, capabilities, authenticated dashboard |
| mcp | Optional local stdio diagnostics |
| relay-configure | Protected stdin connection configuration; service must be stopped |

Default storage is %LOCALAPPDATA%\\kingdots. If absent, an existing
%LOCALAPPDATA%\\DotsKing directory remains in use. instance.json and service.lock
identify the owned service. service.log stays local. secrets.bin uses current-user
Windows DPAPI. kingdots.sqlite is the canonical record store.

The API and dashboard bind to 127.0.0.1. UI and MCP have different tokens. Do not
forward the local listener, its API or authenticated dashboard URL to the internet.

## Private relay configuration

Deploy or reuse the owner-private [relay](../relay/README.md). Keep its native project
and account plugin IDs; don't create another deployment for each update. Sites
provides OAuth/account access and a service credential. The device pairing token
is separate; neither is a model API key.

While stopped, run node dist/cli.js relay-configure. Its prompt reads a single
JSON line through protected stdin, not command arguments. Supply:

```json
{
  "origin": "https://YOUR_TRUSTED_RELAY_HOST",
  "watchId": "registered-watch-id",
  "sessionId": "registered-existing-session-id",
  "serviceBearer": "PROVISIONED_HOSTING_SERVICE_CREDENTIAL",
  "enabled": true
}
```

The service validates that the target is a registered Codex app_host session.
Only an HTTPS origin without embedded credentials, path, query or fragment is
accepted. Credentials must come from the actual trusted hosting deployment.
Never post real values in issues or shell command lines. Configuration prints
only its enabled flag and the pairing token's SHA256 digest; set that digest as
DEVICE_PAIR_DIGEST on the private relay.

Reconfiguration can omit serviceBearer to reuse the vault credential. enabled
defaults to false. Configuration does not resume management. The service retrieves
requests only when this connection is explicitly enabled. Paused watches remain
available for explicit read/no-action reviews without changing their control state.
Released/completed watches are not available to the relay.

## Package and upgrade

npm pack validates types/tests/build. The package includes dist, web-dist,
deployable relay sources, documentation and licenses. Fixtures, deleted prototype
runners, plugins, local credentials and private hosting manifests are excluded.
Clean build output prevents removed modules surviving from an earlier build.
Trusted Windows CI also validates the tarball and unchanged source.

Pause management, inspect uncertain delivery, and stop the old service before
installing a new build. Preserve the data directory. Version 0.1.4 adds canonical
relay_jobs and relay_reviews tables without deleting old tasks, watches or commands.
Earlier sidecar journals are imported once as unbound historical evidence.
Original files remain for recovery; migration does not create a relay target,
enable a connection or resume a watch.

Reconfigure explicitly if needed, start the same service and inspect status plus
the dashboard's connection/review records. Unknown results remain held. Updating
the private relay reuses its original plugin; the old optional kingdots-local
management plugin can be removed without removing bundled official host tools.

The version is not assumed to be published to npm. CI does not publish npm packages,
create GitHub Releases, install updates or deploy the relay automatically.
See [connection](dots-connection.md) and [local CI](local-ci.md).
