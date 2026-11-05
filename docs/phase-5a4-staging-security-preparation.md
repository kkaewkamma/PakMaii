# Phase 5A.4 — Staging Security and Deployment Preparation Evidence

Prepared on 2026-10-15. This phase did not seed Remote D1, set remote secrets, deploy a Worker, create Access resources, or link an Admin.

## Migration trigger equivalence

Source of the before-image: `backups/ready-to-grow-source-pre-staging-2026-10-15.zip`, SHA-256 `DE72DD08535C2002C5844D936700310417884D83C324EBFC53BD646ECA6B3D08`.

| Migration | Before SHA-256 | After SHA-256 | CASE expressions |
|---|---|---|---:|
| `0001_initial_schema.sql` | `FA787F1401B9E2772B8F5FD5650867AC10D0545FB83D8B47CFEA07FEF4437C24` | `828C48360BFDF53EA81CC5A3C0C4DBBF8BA7A9561AE2A8EC02DA4987FCED78F5` | 6 |
| `0004_admin_line_identity_operations.sql` | `D0F79418D7E5FF23D229A5C1ABEC540101E6A9720781C180177C656658945EF7` | `BAF845625E5A55EBF10FDECCA2E605035E8944E5C5AE871D3A730D3554F232B0` | 2 |

The only content changes are `SELECT CASE ... END;` to `SELECT (CASE ... END);`. A byte comparison after removing those added parentheses exactly equals each before-image. Trigger names, timing, target tables, predicates, `RAISE(ABORT, ...)` messages, side effects, and transaction boundaries are unchanged.

Verification:

- All eight CASE expressions remain present.
- Local migration and integrity tests pass.
- Assignment role guards still reject non-ICS/non-Farmer/non-Admin participants.
- Admin link/recover/unlink guards still enforce role, status, current identity, and unique LINE identity.
- Remote migration history contains `0001` through `0005`; no migration remains pending.
- Remote schema inventory contains 17 D1-reported tables, 20 explicit indexes, and 8 triggers.

The syntax change works around the D1 remote statement splitter while remaining equivalent SQLite SQL.

## Synthetic seed manifest

The local, ignored file `staging-identities.example.json` contains:

- one unlinked Admin (`ADMIN-STG-001`);
- five unlinked ICS identities (`ICS-STG-001` through `ICS-STG-005`);
- twenty-five unlinked Farmer identities (`F-STG-001` through `F-STG-025`);
- exactly five explicit Farmer assignments per ICS.

All names and identifiers are synthetic. The manifest has no password, LINE identity, invitation, token, or real personal data. The generator stores only the primary key-version HMAC digest and the last four-character hint. Generated SQL is ignored and must be removed after one reviewed use.

Local isolated D1 result:

| Role/status | Count |
|---|---:|
| `admin/unlinked` | 1 |
| `ics/unlinked` | 5 |
| `farmer/unlinked` | 25 |

Each ICS has five active Farmers. Plaintext-like values in `code_digest`: 0. Admin-password rows: 0. LINE-linked users: 0.

## HMAC secret setup plan

1. Two operators approve a key version such as a date/version identifier. Do not reuse the local test key.
2. Generate at least 32 cryptographically random bytes in an approved password/secret manager and store the recovery copy there. Encode as base64url and form `version:base64url-key`.
3. On a trusted terminal, run `npx.cmd wrangler secret put AGENCY_CODE_HMAC_KEYS --config wrangler.staging.jsonc` and paste into Wrangler's hidden prompt. Do not place the value in command arguments, `.env`, clipboard history, tickets, screenshots, shell transcripts, or source.
4. A second operator verifies only the secret name/version and Wrangler success—not its value.
5. Generate the seed SQL in the same trusted process using the identical key ring. Review IDs/roles/counts, apply once after separate approval, then securely remove the generated SQL and private manifest.
6. Rotation format is `newVersion:newKey,previousVersion:previousKey`. Generate new credentials with the primary key; retain the previous key only for the documented transition, then re-HMAC or retire old credentials before removal.

## Private deployment design

`workers.dev` is public whenever enabled unless Access protects it. The deployment must therefore not rely on application authentication as the private perimeter.

Safest no-public-window sequence:

1. Confirm Zero Trust Free subscription/seat entitlement in the dashboard.
2. Before the first Worker deploy, enable account-level **Protect all Workers → All traffic** with an Allow policy restricted to named staging tester emails. This protects existing and future Worker production and preview URLs.
3. Verify there is no `Bypass everyone` policy. Default-deny remains in effect.
4. Deploy only after Access is active. Immediately verify an unauthenticated request is redirected/blocked before the Worker executes.
5. Once the Worker exists, optionally replace the account-wide rule with a Worker-level `worker` destination for `ready-to-grow-staging`, but overlap the policies and test before removing the broader rule.

Recommended policy: named tester emails only, one-time PIN or the approved IdP, 4–8 hour session, no email-domain wildcard, no service-token bypass for browsers, and production plus preview coverage. Access must cover the entire Worker, not only `/api/*`.

LIFF caveat: Access requires a `CF_Authorization` browser cookie. LINE's iOS/Android in-app browsers must be tested with the same browser instance through the full Access → LIFF flow. Avoid forcing cookie `SameSite=Strict`, which Cloudflare documents can cause redirect loops; do not disable Access to work around a failure. Incognito/private browsing is not a valid compatibility test because third-party cookie blocking can interfere.

## Remaining gates

- Zero Trust Free entitlement and named tester list are not yet confirmed in the account dashboard.
- Access has not been created, so deployment is not authorized.
- LINE LIFF has not been tested on a physical iOS or Android device.
- Remote seed, `AGENCY_CODE_HMAC_KEYS`, Worker deploy, LIFF endpoint change, and Admin LINE linking each require separate approval.
