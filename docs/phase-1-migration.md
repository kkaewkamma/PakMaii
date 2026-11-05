# Phase 1 database migration and recovery

## Safety contract

The migration preserves every `id` and row in `users`, `plots`, `activities`, `approvals`, `lots`, and `reviews`. It creates and verifies a SQLite online backup before applying any migration. Each migration runs in one transaction and records its version only after its foreign-key check succeeds.

Run with:

```powershell
npm.cmd run migrate
```

The command exits before migration if backup integrity, foreign keys, row counts, or protected primary-key sets differ. After migration it repeats the same checks. Re-running is safe because applied versions are stored in `schema_migrations`.

## Recovery

If the process fails before commit, SQLite rolls the migration transaction back automatically. Do not delete the generated backup.

If post-migration verification fails:

1. Stop every Ready to Grow process that can write the database.
2. Preserve the failed database and its `-wal`/`-shm` files for investigation; do not overwrite the verified backup.
3. Verify the named backup with `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, and protected-table row counts.
4. Move the failed database aside and copy the verified backup to the configured `DB_PATH`.
5. Start one application instance and repeat integrity and foreign-key checks before reopening traffic.

No automatic destructive restore is provided. Recovery deliberately requires an operator to confirm the exact source, backup, and destination paths.

## Agency-code HMAC keys

`agency_credentials` stores only a keyed digest, a non-sensitive display hint, and `key_version`. HMAC secrets must live in the hosting secret manager, never in SQLite, source control, logs, API responses, or frontend code.

The future authentication phase should load a key ring containing one primary version plus explicitly retained verification-only versions. Registration lookup computes candidate HMACs server-side for the configured versions. After a match using an old version, it can replace the digest with the primary version inside the same account-linking transaction. Retire an old key only after all unclaimed credentials have been reissued or migrated through a controlled code re-entry process; an HMAC cannot be re-keyed from its digest alone.

Key-version names are metadata and may be stored in the database. Key values must never be stored there. Startup must fail closed when an agency credential references an unavailable key version.

## Assignment history

`farmer_assignments` keeps closed rows with `ends_at`. A partial unique index allows at most one row with `ends_at IS NULL` for each Farmer. There is intentionally no database constraint limiting the number of Farmers per ICS; the 1:5 ratio belongs only to future demo seed data.

