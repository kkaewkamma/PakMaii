# PakMaii (Ready to Grow) — Project Rules

1. **Read project documentation before coding:** Always inspect `README.md`, `docs/HANDOVER.md`, `docs/DEVELOPMENT_STATUS.md`, `docs/STAGING_CHECKLIST.md`, `docs/`, and the actual source code before making changes.
2. **Preserve dual-runtime compatibility:** Keep Express + SQLite (`server.js`, `lib/`, `db/`) and Cloudflare Workers + D1 (`worker/`, `d1/migrations/`) aligned and compatible.
3. **Preserve verified LINE authentication and server-side RBAC:** Never bypass verified LINE ID token authentication, session hashing, HMAC agency code verification, or server-side role/assignment checks.
4. **Never weaken security for convenience:** Maintain strict CSP (`public/_headers` and `helmet` in `server.js`), avoid `innerHTML`/inline styles/inline scripts, and never log or store secrets/tokens in plaintext.
5. **Never display fake data as real certification evidence:** Keep Public Demo (`public/demo.js`) strictly isolated from authenticated real-backend behavior, and never fabricate compliance, inspection, voice, or QR certification claims.
6. **Never modify applied database migrations:** Always add new versioned migrations in `d1/migrations/` (and matching SQLite setup/migrations) rather than editing already-applied migrations.
7. **Use responsive, farmer-friendly Thai UI:** Write concise, clear Thai copy for farmers and ICS officers, preserve mobile usability (especially LINE LIFF), and ensure accessible touch targets and states.
8. **Write automated tests for new functionality:** Every bug fix, API change, migration, or UI workflow must include automated tests.
9. **Run regression tests before completion:** Always run tests after final edits and report exact commands and observed pass/fail/skip counts without extrapolation.
10. **Never deploy or modify remote resources without approval:** Do not run remote deployments, remote D1 migrations, secret changes, LINE Console edits, or send real LINE notifications without explicit owner approval.
11. **Report actual test results and limitations in Thai:** Clearly separate Demo, Local Express, Staging, and Production readiness and document any environment blockers honestly.
