# Phase 4B.2 — Admin LINE Identity

Workers Production authenticates an already-linked Admin through the normal `POST /api/login` route. LINE verifies the ID token, and the Worker looks up the verified `sub` in D1; role and status always come from D1. There is no Admin invitation, self-registration, linking, unlinking, recovery, or bootstrap HTTP endpoint.

`POST /api/auth/admin/password-login` remains available to the local Worker only. Both `ENVIRONMENT=local` and a loopback request host are required, so a tunnel or deployed Worker is rejected even if the environment variable is misconfigured. Other requests return `503 ADMIN_PASSWORD_LOGIN_UNAVAILABLE` before reading credentials or running scrypt. Express keeps its existing scrypt password login unchanged.

## First Admin provisioning

Prerequisites:

1. Create the Admin identity through a reviewed database migration or trusted operator process. It must have `role='admin'`, an agency credential, no LINE identity, and no default password. Never create it through a public API.
2. Apply D1 migrations `0004_admin_line_identity_operations.sql` and `0005_admin_identity_audit_actor.sql`.
3. Confirm the operator has Cloudflare D1 access, the intended LINE Login channel, a second-person-approved ticket, and a secure way to obtain the Admin's fresh LINE ID token.
4. Put `LINE_CHANNEL_ID` and `AGENCY_CODE_HMAC_KEYS` into the current trusted process environment from the secret manager. The CLI deliberately does not load `.env`.

Run from an interactive trusted terminal:

```powershell
npm.cmd run worker:admin-line -- link --local ADMIN-001
```

For a future remote database, use `--remote` only during an approved maintenance window. The CLI requires an additional `REMOTE ...` confirmation. It prompts for an operator/ticket reference, reason, and a hidden LINE ID token; verifies the token directly with LINE; displays only a SHA-256 identity fingerprint; and executes one D1 statement. The ID token is never written to disk, D1, command arguments, or logs.

The database trigger accepts only an existing Admin target, rejects disabled accounts and duplicate LINE identities, activates an initially unlinked Admin, revokes all sessions, and appends `admin.line_linked`. The operation table and audit table are append-only.

After provisioning, open LIFF with that LINE account. `POST /api/login` creates a hashed D1 session and routes the user to the Admin dashboard.

## Recovery and unlinking

Recovery is separate from login and must use an approved operator procedure:

1. Verify the incident/request out-of-band and record a ticket reference and reason.
2. Disable the Admin first if compromise is still active. A disabled Admin cannot be recovered or log in.
3. After containment, reactivate it only through a separately reviewed operator migration that also appends a `user.status_changed` audit record; the public Admin APIs cannot bootstrap this recovery.
4. Obtain a fresh ID token for the replacement LINE identity and verify its displayed fingerprint with the Admin through a second channel.
5. Run:

```powershell
npm.cmd run worker:admin-line -- recover --local ADMIN-001
```

Recovery atomically changes the LINE identity, revokes every existing session, and appends `admin.line_recovered` with the operation ID, operator reference, reason, and only old/new LINE suffixes.

To deliberately remove LINE access:

```powershell
npm.cmd run worker:admin-line -- unlink --local ADMIN-001
```

Unlinking revokes sessions and appends `admin.line_unlinked`. It does not change the Admin role. A subsequent link requires the operator-only flow again.

Never place ID tokens, HMAC keys, channel secrets, passwords, or access tokens in the reason/operator fields. Retain Cloudflare access logs and the approval ticket alongside the immutable D1 audit record.

## Atomicity

Migration `0004` implements each operator action as one `INSERT`. D1 executes its validation and apply triggers in the same transaction. Any invalid target, disabled Admin, duplicate LINE identity, constraint failure, audit failure, or session-revocation failure rolls back the operation row and all side effects. The existing unique constraint on `users.line_id` resolves concurrent claims so only one Admin can own a LINE identity.
