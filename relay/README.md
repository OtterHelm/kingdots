# kingdots private relay

This is the deployable account connection used by kingdots, not a separate PC
program or supervisor. Actual Dots initiates reads of one user-selected existing
Codex session and returns no-action judgments. The PC transport lives in
src/relay.ts within the main service.

## Scope

The two MCP tools are inspect_existing_session and record_no_action_review.
There are no coding instruction, approval, session creation or resume tools.
Workers never compose supervisor reports or notify Dots.

The private hosting platform supplies OAuth and authenticated-user identity.
Data calls pin one owner; service credentials do not create an end-user identity.
Device endpoints also require a pairing token matching DEVICE_PAIR_DIGEST.

Requests and decisions expire after 15 minutes. Cleanup removes their payloads
on the next request, retaining request-ID tombstones to prevent re-execution.
Keep the deployment owner-private. Authenticated account provenance alone is not
independent proof of Dots authorship or overnight management.

## Deploy or update

Use the native Sites workflow. Reuse project_id from an existing private
.openai/hosting.json and retain its account plugin; never create another Site as
an update. The public hosting.template.json contains no personal project ID.
Copy it to a private hosting.json using the actual native provisioning response.

For development in a checkout, npm ci installs the locked schema tooling.
npm test runs controlled relay fixtures; npm run db:generate generates schema
changes. Build and validate with scripts/build.mjs and scripts/validate-artifact.mjs
using the supported native Sites workflow. Push the exact source, package from
that source and privately deploy the matching version. Fixtures are not shipped
in the local kingdots npm distribution.

Use the actual native Site origin/service credential to configure the main PC
service through protected stdin. Set its printed devicePairDigest as
DEVICE_PAIR_DIGEST on the relay. See [deployment](../docs/deployment.md).
Do not create model API keys or paid model settings. Check hosting availability
and applicable terms separately.

The PC runs no finite probe executable and stores no new sidecar database.
Canonical local jobs and reviews are in kingdots.sqlite. Prior prototype files
are preserved as historical recovery evidence only.

## Verification

Root npm test runs both main-service and relay fixtures without model calls.
Tests distinguish static discovery from authenticated data access, target scope,
nonce correlation, conflict rejection, once-only claims and expired ID reuse.

Historical bounded actual Dots trials belong in [verification results](../docs/verification-results.md).
The consolidated runtime's actual Dots retest is pending. Neither this relay nor
its plugin implements ongoing review scheduling or establishes live coding control.
