# Ready to Grow — Private Staging Checklist

This checklist prepares Phase 5. Completing it does not authorize production deployment.

## Approval and isolation

- [ ] Written approval identifies the operator, reviewer, change ticket, staging hostname, and maintenance window.
- [ ] A second operator reviews D1 creation, migrations, secrets, LINE endpoint changes, and first-Admin linking.
- [ ] Staging uses a new Remote D1 database; it never binds `data/dev.db` or a production database.
- [ ] Staging hostname is private to named testers and is not indexed (`X-Robots-Tag: noindex`).
- [ ] No public bootstrap, default Admin password, `/api/dev/login`, or code-only login is available.

## Required bindings and configuration (names only)

Non-secret Worker bindings/variables:

- [ ] `DB` — dedicated staging D1 binding.
- [ ] `ASSETS` — `public/` Workers Static Assets binding.
- [ ] `ENVIRONMENT=staging` — never `local` on a public Worker.
- [ ] `LIFF_ID` — approved staging LIFF identifier.
- [ ] `LINE_CHANNEL_ID` — LINE Login channel identifier used for ID-token verification.

Secrets set through Cloudflare secret management, never source/docs/`.env`:

- [ ] `AGENCY_CODE_HMAC_KEYS` — primary and previous HMAC keys, with documented version/rotation owner.

Not required by the current login flow and therefore must not be added without review:

- [ ] No LINE Channel Secret in frontend or ordinary Worker variables.
- [ ] No Messaging API Channel Access Token.
- [ ] No default Admin password.

## Build and database gate

- [ ] `npm.cmd ci` completes with approved install scripts only.
- [ ] `npm.cmd test` passes with zero failures.
- [ ] `npm.cmd audit` has no unresolved high/critical production vulnerability.
- [ ] `npx.cmd wrangler deploy --dry-run` succeeds.
- [ ] `wrangler.staging.jsonc` was generated from the real Cloudflare D1 UUID, is ignored by Git, and passes `npm.cmd run worker:staging:dry-run`; no zero/example UUID remains.
- [ ] Migrations `0001` through `0005` apply to a fresh isolated D1 copy.
- [ ] `PRAGMA integrity_check` returns `ok`; `PRAGMA foreign_key_check` returns no rows.
- [ ] Unique LINE identity, one active Farmer assignment, append-only audit, and Admin identity triggers are verified.
- [ ] Backup/export and restore rehearsal succeeds before importing any staging data.

## Remote D1 first Admin — operator-only plan

- [ ] Confirm `ADMIN-001` already exists once, has role `admin`, has the reviewed agency credential, and has no default password.
- [ ] If it does not exist, create it only through a reviewed versioned migration; do not add an HTTP endpoint.
- [ ] Two operators compare the intended Admin name/code/status and migration output.
- [ ] Load `LINE_CHANNEL_ID` and `AGENCY_CODE_HMAC_KEYS` into the trusted operator process from the secret manager.
- [ ] Obtain a fresh Admin LINE ID token through an approved secure channel; never paste it into tickets/chat/logs.
- [ ] Run `npm.cmd run worker:admin-line -- link --remote ADMIN-001 --config wrangler.staging.jsonc` only after deployment approval; confirmation names the exact staging database.
- [ ] Compare the displayed identity fingerprint with the Admin through a second channel.
- [ ] Verify exactly one `admin.line_linked` audit operation, zero old sessions, and successful `POST /api/login` with D1 role `admin`.
- [ ] Store the Cloudflare operator activity reference and approval ticket alongside the D1 audit record.

Recovery:

- [ ] Disable the compromised Admin and revoke access first.
- [ ] Require a new ticket, second-person approval, out-of-band identity check, and fresh LINE ID token.
- [ ] Reactivate only through an audited operator migration after containment.
- [ ] Run the documented `recover --remote` flow; verify `admin.line_recovered` and complete session revocation.
- [ ] Use `unlink --remote` only for an explicit reviewed removal and verify `admin.line_unlinked`.

## Cloudflare and HTTP security

- [ ] HTTPS only; no mixed content or HTTP staging URL.
- [ ] Cloudflare Access/allowlist works inside LINE iOS and Android in-app browsers.
- [ ] CSP has no `unsafe-inline` or `unsafe-eval`; LIFF SDK loads only from `static.line-scdn.net`.
- [ ] `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, frame policy, and CSP are present on static pages.
- [ ] Auth success and error responses use `Cache-Control: no-store`.
- [ ] Static assets revalidate correctly and `_headers` is not served as a public asset.
- [ ] Confirm `CF-Connecting-IP` is supplied by Cloudflare and client-supplied forwarding headers cannot change D1 rate-limit keys.
- [ ] Review available Free-plan zone rate-limiting entitlement; create rules only after explicit approval.
- [ ] Monitor Workers CPU/errors and D1 row reads/writes during the test window.
- [ ] Dashboard confirms the actual Zero Trust Free seat entitlement; Access protects the production `workers.dev` URL and works in LINE iOS/Android before LIFF invitations are issued.
- [ ] No zone-WAF/rate-limit entitlement is assumed for `workers.dev`; the existing D1 limiter remains mandatory.

## Staging identity seed

- [ ] Private manifest contains explicit staging-only IDs for one Admin, at least one ICS, and at least one Farmer; it contains no password, LINE ID, or token.
- [ ] `npm.cmd run worker:staging:seed -- <private-manifest> staging-seed.sql` runs with the key ring loaded only in the trusted operator process.
- [ ] A second operator verifies roles, assignment references, HMAC key version, and expected counts before applying the SQL exactly once.
- [ ] Every seeded identity is `unlinked`; generated manifest/SQL is securely removed after application and is never committed.

## LIFF E2E matrix

- [ ] Farmer: new invitation registration, returning login, CRUD, logout, expired session.
- [ ] ICS: new invitation registration, assigned-Farmer isolation, approval/review, logout.
- [ ] Admin: LINE login, Farmer invitation, ICS invitation, revoke invitation, user/assignment management, logout.
- [ ] Invalid/expired/revoked/replayed invitation shows safe generic guidance.
- [ ] Disabled Farmer, ICS, and Admin cannot use an existing session or create a new one.
- [ ] Refresh/back navigation does not redisplay an invitation token.
- [ ] Invitation token is visible only immediately after creation and is absent from storage, logs, invite lists, URLs, and screenshots retained as evidence.
- [ ] LINE verify failure, offline mode, slow response, double-submit, and clipboard denial have understandable UI results.
- [ ] Test LINE iOS, LINE Android, Safari/Chrome external browser, narrow viewport, and Thai text input.
- [ ] Browser console contains no CSP, mixed-content, uncaught exception, or LIFF redirect-loop errors.

## Go/no-go evidence

- [ ] Record test run count, dry-run bundle size, migration list, audit result, and screenshots with all tokens/secrets redacted.
- [ ] Record known limitations and rollback owner.
- [ ] Rollback plan covers Worker version rollback, LIFF endpoint restoration, Admin unlink/recovery, and D1 restore/export.
- [ ] Security reviewer signs off before creating/deploying remote resources.
- [ ] Product owner explicitly approves Private Staging. Production remains a separate approval.
