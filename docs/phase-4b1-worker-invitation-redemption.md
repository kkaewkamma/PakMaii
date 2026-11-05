# Phase 4B.1 — Worker Invitation Redemption

`POST /api/auth/register/invite` is enabled on the Worker for unlinked Farmer and ICS accounts. It requires an agency code, a 43-character invitation token, and a LINE ID token. The Worker verifies the ID token with LINE and uses only the verified `sub`; client-supplied role and LINE identifiers are ignored.

## Atomic D1 flow

One D1 `batch()` performs all state changes:

1. Conditionally link the target user found by agency HMAC digest and invitation SHA-256 hash.
2. Consume the invitation with a conditional update.
3. Claim/rotate the agency credential to the primary HMAC key.
4. Insert the `account.linked` audit event.
5. Insert the SHA-256 session-token hash.

Each operation is followed by an insert into `mutation_guards`, whose `CHECK(value = 1)` fails the batch unless exactly one row changed. D1 rolls the entire batch back on any failed guard. The existing unique index on `users.line_id` is an additional database-level guard against linking one LINE identity to multiple users.

The response returns the new session token once with `Cache-Control: no-store`. Plaintext invitation tokens, LINE ID tokens, session tokens, and secrets are not logged or persisted. Invalid agency/invitation/account combinations use the same generic 400 response.

## Distributed rate limits

Limits are stored in D1 rather than Worker memory:

- source IP hash: 30 attempts/minute before LINE verification;
- primary agency-code HMAC digest: 10 attempts/15 minutes;
- verified LINE `sub` hash: 10 attempts/15 minutes.

The IP layer is deliberately not the only identity signal. The verified LINE-subject layer prevents bypass by rotating ID tokens for the same LINE account. Production should add Cloudflare edge rate-limiting/WAF rules as an outer abuse-control layer.

## Local verification

```powershell
npm.cmd run worker:db:migrate
npm.cmd test
npx.cmd wrangler deploy --dry-run
```

Set `LINE_CHANNEL_ID` and `AGENCY_CODE_HMAC_KEYS` only through local/production secret facilities when manually testing. Do not put their values in source or `wrangler.jsonc`. The automated test uses generated, non-production values and an isolated ephemeral Miniflare D1 database.

Invitation creation and revocation remain admin-only. The Worker still has no `/api/dev/login`, default admin password, or public bootstrap endpoint. No remote D1 resource or deployment is part of this phase.
