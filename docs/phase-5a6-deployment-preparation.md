# Phase 5A.6 — Private Staging Deployment Preparation

Prepared on 2026-10-15. No remote secret, seed, Worker version, deployment, or Admin link was created.

## Gates verified

- Owner-confirmed Access: Zero Trust Free; Protect all Workers enabled; All traffic (production + preview); exact-email Allow policy `Ready to Grow Staging Testers` for `k.kaewkamma@gmail.com`; no account-member/public/bypass policy.
- Worker config: `ready-to-grow-staging`, `ENVIRONMENT=staging`, D1 `ready-to-grow-staging` / `cd385968-8137-4fdf-adc0-58a963b53ce4`, `ASSETS`, and `/api/*` Worker-first routing.
- Remote migrations: `0001`–`0005`; `users`, `farmer_assignments`, `agency_credentials`, and `sessions` remain empty.
- Current pre-seed bookmark: `00000003-00000000-00005104-6dc596163203c17c25372b13bb9c1a6c`.
- Seed manifest SHA-256: `E1D6E25B3617DD9FC47D581CCC28387C1DDEC62CBB159AAF997460504745CFA6`.

## Secret and candidate-version procedure

Do not use `wrangler secret put` for the first Worker: Cloudflare documents that command as creating a new version and deploying it immediately. That would collapse the secret and deployment approval gates.

After explicit secret/version-upload approval:

1. Generate at least 32 random bytes in the approved password manager and save `version:base64url-key` in its secure record.
2. Run `npm.cmd run worker:staging:upload-version`. The operator enters the approval reference and pastes the key ring into a hidden prompt.
3. The script validates the key ring, writes a mode-restricted temporary JSON file outside the project, runs `wrangler versions upload --strict --secrets-file ...`, then deletes the file in `finally`.
4. This uploads a candidate Worker version and secret but does not deploy traffic. Record the Version ID and confirm the secret name only.
5. Never capture terminal video/screenshots while entering the value. Never place it in `.env`, command arguments, source, chat, tickets, or logs.

## Remote seed procedure

After separate seed approval and only after the production staging key is safely retained:

1. Capture a fresh Time Travel bookmark and verify all four seed-related tables remain empty.
2. Load the same key ring into a trusted process environment without `.env`.
3. Generate `staging-seed.sql` from `staging-identities.example.json`.
4. Two operators verify manifest hash, 1 Admin, 5 ICS, 25 Farmers, five explicit Farmers per ICS, no password/LINE/token fields, and no plaintext agency code in generated SQL.
5. Apply once to Remote D1, then verify 31 unlinked users, 25 active assignments, 31 agency credentials, zero passwords/sessions/LINE IDs, and unchanged migration history.
6. Remove generated SQL and clear the process environment. Retain only its SHA-256 and approval evidence.

## Private deployment procedure

After separate deploy approval:

1. Confirm Access exact-email policy remains active for all production and preview traffic and has no bypass.
2. Re-run tests and dry-run.
3. Deploy the recorded candidate Version ID with `wrangler versions deploy <VERSION_ID>@100 --name ready-to-grow-staging`.
4. Immediately request `/`, `/api/health`, and `/api/config` with a clean client containing no Access cookie. Require Access redirect/block; any application `200` is a stop condition.
5. Authenticate as the approved tester and verify the same-origin frontend/API, CSP, no-store auth responses, Worker logs, and D1 usage.
6. Only after the perimeter passes, update the staging LIFF Endpoint and test on physical LINE iOS and Android browsers without disabling Access.

Rollback: deploy the previous Worker version if one exists; for the first release disable the Worker route if Access validation fails. Restore D1 only with a separately approved Time Travel operation using the captured bookmark.
