# Experimental Dots pull relay

This bounded connection probe lets **Dots initiate** inspection of one existing
Windows Codex app conversation and return a correlated no-action review. It does
not implement released automatic supervision, periodic reviews or coding control.
Workers never compose reports, call these supervision tools or notify Dots.

```mermaid
sequenceDiagram
    participant D as Actual Dots
    participant R as Owner-private MCP relay
    participant P as PC transport
    participant S as Existing Codex app session
    D->>R: inspect_existing_session(commandId)
    P->>R: Poll queued requests over outbound HTTPS
    R-->>P: One claimed read request
    P->>S: Read existing records through local kingdots
    S-->>P: Existing host records; no worker report
    P->>R: Return correlated snapshot
    R-->>D: Snapshot, inspection ID and nonce
    D->>R: record_no_action_review(ID, nonce, reason)
    P->>R: Retrieve and store review
```

## Scope and authorization

- The two remote tools accept no arbitrary project/session target. Only the one
  user-selected original conversation is read, using a paused enrolled watch.
- No new AI, coding instruction, permission approval, watch resume, worker-to-Dots
  message or model API key exists in this probe.
- Sites owns OAuth and the owner-private access boundary. MCP discovery exposes no
  private records. Data calls require its trusted authenticated-user identity.
- PC requests require both the provisioned Sites service credential and a separate
  device pairing token. Service access does not manufacture an end-user identity.
- Recent conversation records cross the authenticated hosting boundary. Requests
  expire after 15 minutes and are deleted on the next relay request. The owner
  binding remains; local journals are retained for verification by the user.
- Unknown delivery is held. Reusing a command ID returns the original result; it
  never starts a second read. Decisions require the matching ID and nonce.
- Authenticated account identity is not independent proof of Dots authorship.
  Actual Dots tool activity must be correlated with the received local review.

## Reproduce the connection gate

Use Node.js 24 on Windows. Build the root project and start its service from a
genuine existing Codex executor. Enroll that original session with `app_host`,
then pause its watch. Do not invent app context or enroll a replacement session.

Register an owner-private Site using its native tools. Copy the returned project
ID into a local `.openai/hosting.json` based on `hosting.template.json`; do not
commit that file. Native Sites provisioning supplies the service credential and
private plugin. Never create a model API key or enable paid settings for this test.
If a required host feature needs new paid setup, stop and report that limitation.

In this directory, install locked development dependencies with `npm ci`, run
`npm test`, generate schema changes with `npm run db:generate`, and use the native
Sites workflow to build, validate and privately publish the exact pushed source.
The migrations and build are separate from the main local service. Keep the
owner-only audience. Use the returned deployment URL and plugin ID unchanged.

From the repository root, run `node experiments/dots-pull-relay/device-probe.mjs
setup` in a protected input session. Supply one JSON line containing `serviceBearer`
and `origin`, using the actual native Sites credential and successful deployment
URL. The helper stores secrets in a **separate current-user Windows DPAPI vault**;
it prints only the device token's SHA256 digest. Set that digest as the hosted
secret `DEVICE_PAIR_DIGEST`. Never place credentials in source, shell arguments,
screenshots or a chat prompt. Never forge authenticated-user headers.

Then run `node experiments/dots-pull-relay/device-probe.mjs serve` from the root.
It polls outward for at most 30 minutes, journals a request before reading and
leaves the original watch paused. `status` prints counts and transport evidence,
without conversation content or original session IDs. No request means no read.

Connect the provisioned private plugin in the actual Dots account. The human user
assigns the initial test directly to their existing Dot: call the inspection tool
with a stable command ID, then record a no-action review using its returned ID and
nonce. Do not send a worker-originated setup notification. Check the actual Dot's
tool activity against the local journal. Next, separately test a supported Dots
check-in after its initial response ends. Neither deployment nor HTTP success is
actual Dots acceptance.

## Files and limits

`worker/relay.js` implements the stateless MCP/device endpoints. `db/` and
`drizzle/` contain the D1 schema and generated migrations. `device-probe.mjs` is
the finite Windows transport. `tests/` contains controlled Node SQLite fixtures;
they also run in the repository's existing Windows CI, without provider login.

The probe is kept in the Git checkout and excluded from the npm/local-plugin
distribution. It does not update last-Dots-review timestamps, schedule reviews,
provide active instructions or establish overnight acceptance. See
[connection](../../docs/dots-connection.md), [interfaces](../../docs/interfaces.md)
and [dated verification](../../docs/verification-results.md).

License: [Apache-2.0](../../LICENSE).
