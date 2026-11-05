# Phase 4B.3 — Frontend and Staging Security

## Frontend security

The frontend is split into `index.html`, `app.css`, and `app.js`. It contains no inline scripts, inline styles, inline event attributes, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, or dynamic function construction. API/user values are rendered through `textContent` or text nodes. Evidence URLs are parsed and accepted only when their protocol is HTTPS.

The static-asset CSP uses `default-src 'none'`, allows scripts only from the same origin and the official LINE LIFF SDK host, and contains neither `unsafe-inline` nor `unsafe-eval`. Workers Static Assets apply rules from `public/_headers`; API responses use headers from Worker code. This distinction follows Cloudflare's [Static Assets headers documentation](https://developers.cloudflare.com/workers/static-assets/headers/).

Bearer sessions remain in `sessionStorage` for API-contract compatibility. Invitation tokens exist only in an in-memory variable, are displayed once after creation, can be hidden, and are never put into local/session storage or logs.

## Authentication UX

- `REGISTRATION_REQUIRED` opens the invitation registration form without exposing the LINE token.
- A generic registration failure explains that an invitation may be invalid, expired, revoked, or already used without revealing which agency identity exists.
- Disabled/unavailable accounts get a dedicated message.
- A 401 on an authenticated request clears the Bearer token and shows a session-expired screen.
- Logout revokes the backend session, clears browser state, and does not silently retain an invitation token.
- Admin invitation selection includes unlinked Farmer and ICS identities and shows backend-provided agency code, role, and status.

## Rate limiting

Worker login and redemption use D1-backed distributed limits keyed by layered stable signals:

- LINE login: trusted Cloudflare client-address hash before verification, then verified LINE `sub` hash.
- Invitation redemption: trusted client-address hash, agency HMAC digest, then verified LINE `sub` hash.
- Admin password login: localhost only and keyed by agency HMAC digest.

`CF-Connecting-IP` is read only when `request.cf` exists. Local/direct requests use one non-user-controlled fallback key, so a caller cannot spoof forwarded headers. IP is only a coarse pre-verification abuse signal; stable verified identities are the main controls, consistent with Cloudflare's advice not to rely on shared IP addresses as the sole key.

`auth_rate_limits` cleanup is amortized: each key receives one deterministic cleanup slot in 64 windows. A cleanup deletes at most 100 rows older than 24 hours (or two windows, whichever is longer). This avoids a cron dependency and prevents cleanup spikes on every request.

For private staging on the Workers Free plan, retain the D1 layer and add an outer Cloudflare rate-limiting rule if the selected zone entitlement exposes it. Suggested draft rules:

1. `/api/login`: Managed Challenge or block above 30 requests/minute per visitor.
2. `/api/auth/register/invite`: Managed Challenge or block above 20 requests/minute per visitor.
3. Optionally protect all `/api/*` above a substantially higher threshold.

Do not create these rules until Phase 5 approval. Cloudflare documents both [zone WAF rate-limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/create-zone-dashboard/) and the [Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/). Binding periods are 10 or 60 seconds and counters are per Cloudflare location, so it is an outer abuse layer rather than a replacement for D1 identity-based controls. Monitor D1 usage because Free-plan row limits are enforced and exceeding them rejects queries until reset; see the [D1 Free-tier notice](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/).

## LIFF browser staging plan

1. Use a dedicated HTTPS staging hostname and dedicated staging D1 database.
2. Configure the existing LINE Login channel's permitted callback/LIFF endpoint only after approval; do not change Provider or production identifiers accidentally.
3. Restrict the staging hostname to approved testers using Cloudflare Access or an equivalent allowlist that works inside the LINE in-app browser.
4. Test LINE iOS, LINE Android, and an external mobile browser.
5. Verify first login, `REGISTRATION_REQUIRED`, Farmer invitation, ICS invitation, Admin LINE login, logout, session expiry, disabled account, expired/revoked invitation, back/refresh, clipboard denial, and poor-network retries.
6. Inspect browser console and Network panels for CSP violations, mixed content, cached auth responses, token leakage, redirect loops, and duplicate submissions.
7. Confirm `/api/dev/login` is 404 and public Admin password login is 503.
8. Confirm all auth responses, including errors, carry `Cache-Control: no-store`.

The executable Phase 5 gate is in `STAGING_CHECKLIST.md`.
