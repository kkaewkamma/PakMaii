# Phase 5A.5 — Cloudflare Access Gate Review

Reviewed on 2026-10-15. No seed, secret, Worker deployment, or Admin linking was performed.

## Observed configuration

- Plan: Zero Trust Free.
- Existing Workers: zero projects.
- Account Workers subdomain: `readytogrow-app.workers.dev`.
- Access: enabled for all Workers.
- Scope: all production and preview traffic.
- Authentication policy: `Cloudflare account — Allow`.
- Session duration: 24 hours.

This is a valid pre-deployment private perimeter: Cloudflare documents that the `all_workers` destination protects current and future Worker production and preview URLs, and checks Access before a request reaches the Worker. With zero existing Workers, enabling the account-wide policy does not disrupt another Worker.

## Account policy risk

`Cloudflare account — Allow` authorizes every member of the Cloudflare account, not only `k.kaewkamma@gmail.com`. It is acceptable for a one-owner private staging account only while that email is the sole account member and account membership is tightly controlled.

Risks compared with an email-specific policy:

- Any future account member automatically becomes a staging tester without a separate Access-policy review.
- A collaborator added for DNS, billing, or another Cloudflare product also receives staging application access.
- Offboarding depends on Cloudflare account membership rather than the staging tester list.
- Cloudflare-account compromise grants both control-plane privileges and application access, reducing separation of duties.
- The policy does not prove that the approved tester list contains exactly one email.

Preferred control before deployment: replace or supplement the broad account-member Allow with a reusable Access policy whose Include selector is the exact email `k.kaewkamma@gmail.com`, then remove the broader account-member Allow. Do not use an email-domain wildcard, `Everyone`, or `Bypass`. If the account policy is retained, first capture evidence that this is the only account member and require a membership review before every demo.

## Deployment gate

Before deployment:

1. Dashboard shows Zero Trust Free and `Protect all Workers → All traffic` active.
2. Policy tester allows the approved tester and denies an unrelated identity.
3. No Bypass/Public/Everyone rule exists.
4. Account membership or exact-email policy is reviewed.
5. Staging dry-run and automated tests pass.

Immediately after deployment, before changing LIFF:

1. Request `https://ready-to-grow-staging.readytogrow-app.workers.dev/` without cookies or Access headers.
2. Require an Access redirect/block response; an application `200` is a stop condition and requires rollback/disable of the Worker route, not an Access bypass.
3. Authenticate as the approved tester and verify the page loads.
4. Repeat the unauthenticated test for `/api/health`, `/api/config`, and a random static asset path. All must be intercepted by Access.
5. Confirm Worker logs contain no request corresponding to the unauthenticated blocked probe where Access observability supports that check.

## Next-round execution order

Each group requires separate approval:

1. **Exact-email Access hardening** (recommended): change Allow selector to `k.kaewkamma@gmail.com`; verify policy tester.
2. **Secret setup**: generate and retain a 32-byte HMAC key in the approved secret manager; set `AGENCY_CODE_HMAC_KEYS` through Wrangler's hidden prompt.
3. **Remote seed**: regenerate reviewed SQL with that same key ring, confirm 1 Admin/5 ICS/25 Farmers and 25 explicit assignments, capture a D1 bookmark, apply once, then verify counts and remove the generated file.
4. **Private deploy**: re-run tests/dry-run, verify Access active, deploy, then immediately perform unauthenticated denial tests before any LIFF endpoint change.
5. **LIFF validation**: update the staging endpoint only after the perimeter test passes; test Access → LIFF in the physical LINE iOS/Android browser without disabling Access.
6. **Admin linking**: perform the separately approved two-operator flow only after LINE and Access checks pass.
