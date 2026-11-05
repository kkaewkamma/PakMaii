# Phase 2: Cloudflare Workers + D1 Local Foundation

Phase 2 keeps `server.js` and the existing SQLite application unchanged. The Worker was introduced as a separate runtime entrypoint with public configuration/health checks and authenticated read-only APIs. Mutation support added later is documented in `phase-3-workers-d1-mutations.md`.

## Safety boundaries

- Wrangler local state is stored under `.wrangler/state-ready-to-grow/` and never uses `data/dev.db`.
- `scripts/wrangler-local.js` disables Wrangler's automatic `.env` loading. Worker local development therefore does not inherit the Express application's secrets.
- The Worker does not register `/api/dev/login`, login, logout, registration, invitation redemption, or any other mutation route.
- No remote D1 database is configured or created by the local commands below.

## Install and initialize

```powershell
npm.cmd install
npm.cmd run worker:db:migrate
```

The migration command is idempotent. It applies versioned SQL from `d1/migrations/` to the isolated local state directory.

## Run the local Worker

```powershell
npm.cmd run worker:dev
```

Open `http://127.0.0.1:8787`. Static files come from `public/`; `/api/*` is routed through the Worker.

Available Phase 2 endpoints:

- `GET /api/health`
- `GET /api/config`
- `GET /api/me`
- `GET /api/plots`
- `GET /api/activities`
- `GET /api/approvals`
- `GET /api/lots`
- `GET /api/risks` (ICS only)
- `GET /api/reviews` (ICS only)
- `GET /api/admin/users` (Admin only)
- `GET /api/admin/assignments` (Admin only)
- `GET /api/admin/invites` (Admin only)
- `GET /api/admin/unlinked-farmers` (Admin only)

The local D1 database starts without users or sessions. Authenticated routes therefore return `401` until an explicit, non-production test fixture is inserted. Phase 2 intentionally provides no seed account, default Admin password, or authentication mutation.

## Tests

```powershell
npm.cmd test
```

The test suite creates disposable databases under the operating system's temporary directory. The D1 test invokes Wrangler with `--local`, applies the migration, and verifies:

- integrity and foreign keys;
- required tables;
- unique constraints;
- one active assignment per Farmer;
- assignment role triggers;
- append-only audit triggers.

Contract tests run the Express and Worker read-only handlers against the same relational fixture and compare HTTP status and JSON bodies. They also assert that `/api/dev/login` and mutation routes are absent from the Worker.

## Current limitations

- Mutation and authentication endpoints remain on Express until Phase 3/4.
- Local D1 data is not an automatic copy of `data/dev.db`.
- Archive Plot is not present in the current Express schema/API/UI and was not introduced in Phase 2.
- Worker sessions are read from D1 but Phase 2 does not create or revoke them.
- `LIFF_ID` is intentionally empty in the local Wrangler config. Production bindings and secrets are outside Phase 2.
