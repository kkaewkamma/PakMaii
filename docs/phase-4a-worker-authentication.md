# Phase 4A: Worker Authentication Foundation

Phase 4A adds LINE login, Admin password login, D1 session creation/revocation, and persistent login throttling. Invitation redemption, registration approval, Admin LINE linking, and development login remain absent from the Worker.

## Authentication endpoints

- `POST /api/login` verifies the supplied ID token with `https://api.line.me/oauth2/v2.1/verify` using the server-side `LINE_CHANNEL_ID`. Only the verified `sub` is used to find a user. Client-supplied role or LINE user ID fields are ignored.
- `POST /api/auth/admin/password-login` finds credentials through all active HMAC key versions, verifies the stored scrypt credential, rotates the agency digest to the primary HMAC key, writes an audit record, and creates the session in one D1 batch.
- `POST /api/logout` deletes only the authenticated session hash.
- `GET /api/me` continues to load role and status from D1 on every request.

## Session decision

Phase 4A retains the existing Bearer API contract. A random 32-byte token is returned once, stored by the current frontend in `sessionStorage`, and only its SHA-256 hash is stored in D1. Sessions expire after seven days and disabled users are rejected even when an unexpired session exists.

An `HttpOnly; Secure; SameSite` cookie would reduce token theft through JavaScript, but switching now would change the established API/frontend contract and requires CSRF protection plus LIFF browser/in-app compatibility testing. Cookie migration is deferred to Phase 4B; it must not be enabled without both controls.

## Distributed rate limiting

Table `auth_rate_limits` implements shared D1 fixed-window counters:

- Admin password: 5 attempts per agency-code HMAC digest per 15 minutes.
- LINE login: 20 attempts per ID-token SHA-256 hash per minute.

No plaintext agency code, ID token, password, or IP address is stored. These counters are shared across Worker isolates and do not depend on process memory. Before production, add an edge Rate Limiting/WAF rule for broad invalid-token flooding because an attacker can rotate invalid token strings. Cloudflare's Rate Limiting binding is another option and is locally simulatable, but a production namespace/rule is deliberately not created in this phase.

## scrypt benchmark

The existing parameters are unchanged: `N=16384`, `r=8`, `p=1`, `keyLength=64`, `maxmem=64 MiB`.

Run the isolated workerd benchmark with:

```powershell
npm.cmd run worker:benchmark:scrypt
```

The benchmark entrypoint is separate from `worker/index.js`, has no assets, D1, secrets, or application endpoints, and is not part of the production Worker configuration.

Two Phase 4A runs measured 32–63 ms, with a combined average of 43.0 ms over ten workerd invocations (the reusable script's final run averaged 35.4 ms). Every sample exceeded the Workers Free CPU budget of 10 ms. Parameters were not weakened. Admin password login therefore remains a Cloud Demo blocker on the Free plan unless the project uses Workers Paid or moves password verification to a suitable external authentication service.

## CSP and XSS

`public/_headers` now gives Workers Static Assets the same CSP sources as Express plus `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'self'`, and a restrictive Permissions Policy.

Residual risks:

- `public/index.html` contains multiple inline scripts and styles, so CSP still requires `unsafe-inline`.
- The frontend uses `innerHTML` extensively. Most database values pass through `esc()`, but this pattern is fragile and one missed escape could expose the Bearer token in `sessionStorage`.
- Third-party LINE LIFF JavaScript is allowed from `static.line-scdn.net`.

Before cookie migration or production release, split scripts/styles into static files, remove `unsafe-inline`, replace dynamic `innerHTML` with DOM construction/text nodes where practical, and add browser CSP/XSS regression tests.

## Required bindings

Production requires bindings/secrets supplied outside source control:

- `DB`
- `LINE_CHANNEL_ID`
- `LIFF_ID`
- `AGENCY_CODE_HMAC_KEYS`

No real values belong in `wrangler.jsonc`, `.env` commits, frontend assets, or logs.
