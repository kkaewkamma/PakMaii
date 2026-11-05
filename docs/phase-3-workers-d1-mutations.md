# Phase 3: Cloudflare Workers + D1 Local Mutation APIs

Phase 3 adds application and Admin mutation APIs to the Worker while preserving the Express + SQLite backend. Authentication creation, login/logout, LINE linking, and invitation redemption remain outside the Worker.

## Mutation endpoints

- `POST /api/plots`
- `PATCH /api/plots/:id`
- `POST /api/activities`
- `POST /api/approvals`
- `PATCH /api/approvals/:id`
- `POST /api/lots`
- `POST /api/reviews`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:id/status`
- `POST /api/admin/assignments`
- `PATCH /api/admin/assignments/:id/end`
- `POST /api/admin/invites`
- `PATCH /api/admin/invites/:id/revoke`

`POST /api/auth/register/invite` is intentionally not registered.

## Atomicity

D1 `batch()` is used for operations that write application state and audit logs together. Conditional mutations use `mutation_guards`: immediately after the protected `UPDATE` or `INSERT ... SELECT`, the same batch inserts SQLite `changes()` into a table constrained to `value = 1`. Zero affected rows violates the constraint and rolls back the complete batch, including audit records.

This protects:

- user status update, session revocation, and audit;
- assignment end and audit;
- invitation eligibility/create/replacement/audit;
- invitation revoke and audit.

Assignment creation closes an existing active assignment, inserts the replacement, and writes its audit record in one batch. The partial unique index still guarantees at most one active assignment per Farmer.

## Configuration

Admin user creation needs a versioned HMAC key ring through the Worker secret binding `AGENCY_CODE_HMAC_KEYS`. The value is never read from `.env` by the local Worker wrapper and is not stored in D1 or source control.

The local config intentionally provides no real key. Tests inject a generated test-only value. Do not add a real key to `wrangler.jsonc`.

## D1 Free Tier indexes

Migration `0002_phase3_mutation_guards_and_indexes.sql` adds indexes for ownership, activity date, approval status, lots, reviews, session expiry, and role/status filtering. Existing bounded activity and invitation queries retain limits of 300 and 200. Other read lists retain the Express contract and should receive cursor pagination before a larger production rollout.

## Run locally

```powershell
npm.cmd run worker:db:migrate
npm.cmd run worker:dev
npm.cmd test
```

Local state remains under `.wrangler/state-ready-to-grow/`. These commands do not access `data/dev.db`, create a remote D1 database, or deploy.

## Security boundary for Phase 4

Invitation redemption design may reuse conditional D1 batches and database guards, but its endpoint must remain absent until LINE verification, account linking, invite consumption, session creation, replay tests, and concurrent redemption all succeed as one security-reviewed workflow.
