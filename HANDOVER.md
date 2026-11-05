# Ready to Grow — Source Code Handover

## What this repository contains

Ready to Grow มี runtime สองชุดที่ต้องรักษาความเข้ากันได้:

- `server.js`, `lib/`, `db/`, `scripts/migrate.js`: Express + SQLite เดิม.
- `worker/index.js`, `worker/repository/d1.js`, `d1/migrations/`: Cloudflare Worker + D1.
- `public/`: frontend เดียวสำหรับทั้งสอง runtime; CSP อยู่ใน `public/_headers`.
- `test/`: Express, Worker/workerd, D1 migration, auth/RBAC และ frontend security tests.

ห้ามใช้ `data/dev.db`, `.env`, `.local-secrets/` หรือ `.wrangler/` เป็นข้อมูลส่งมอบ/production. ไฟล์เหล่านี้เป็น local state และถูก ignore.

## First setup

1. ติดตั้ง Node.js 20+.
2. รัน `npm.cmd ci` และ `npm.cmd test`.
3. Local Express: ใช้ `.env.example` เป็นรายการชื่อค่าเท่านั้น; ห้ามส่งต่อ `.env` จริง.
4. Local Worker: `npm.cmd run worker:db:migrate` แล้ว `npm.cmd run worker:dev`.
5. Private staging: อ่าน [Phase 5A.1 runbook](docs/phase-5a1-private-staging-preparation.md) และ [staging checklist](STAGING_CHECKLIST.md). ต้องมีอนุมัติก่อนสร้าง Cloud resource.

## Security invariants

- Role/status/assignment มาจาก backend database เท่านั้น.
- Production authentication ของ Farmer/ICS/Admin ใช้ verified LINE ID token. Worker public ไม่มี dev login และไม่ทำ scrypt Admin login.
- Sessions และ invitation tokens เก็บ SHA-256 hash; agency codes เก็บ HMAC digest พร้อม key version.
- Invitation single-use/expiry/revoke และ account linking เป็น atomic D1 operations.
- First Admin linking/recovery เป็น interactive operator-only CLI ไม่มี public bootstrap/self-registration.
- ห้าม log/store LINE ID token, plaintext invitation, password, HMAC key, Channel Secret หรือ access token.
- ห้ามแก้ migration ที่ apply แล้ว; เพิ่มเลข version ใหม่.

## Configuration ownership

Tracked `wrangler.jsonc` เป็น local เท่านั้นและมี zero UUID โดยตั้งใจ. Staging config ต้องสร้างหลัง Cloudflare คืน UUID จริงด้วย `npm.cmd run worker:staging:config`; output `wrangler.staging.jsonc` ถูก ignore. Production config ต้องออกแบบและอนุมัติแยก ห้าม copy staging แล้วเปลี่ยนชื่ออย่างเดียว.

Cloudflare secret ปัจจุบันมีเพียง `AGENCY_CODE_HMAC_KEYS`. `LIFF_ID` และ `LINE_CHANNEL_ID` เป็น identifiers แต่ต้องควบคุมการเปลี่ยนแปลง. ระบบ login ปัจจุบันไม่ต้องใช้ LINE Channel Secret หรือ Messaging API token.

## Operational ownership

กำหนดชื่อบุคคลจริงใน ticket สำหรับ Product owner, Cloudflare operator, Security reviewer, LINE Console owner, D1 recovery owner และ incident contact. ใช้ two-person approval สำหรับ D1 migrations, secret rotation, first Admin linking/recovery, LIFF Endpoint change และ deploy/rollback.

หลักฐานแต่ละ release: commit/source archive hash, test count, `npm audit`, Wrangler version/dry-run size, migration list, D1 bookmark/row counts, Worker version, Access policy screenshot, LIFF configuration screenshot และ smoke-test reportที่ปิดบัง token/identity.

## Known limits and next work

- Workers Free มี CPU 10 ms/request; scrypt จึงอยู่ Express เท่านั้น.
- D1 Free daily row limitsทำให้ staging หยุด query ได้เมื่อเกินโควตา; monitor dashboard.
- Access-in-LIFF ต้องพิสูจน์บน iOS/Android จริงก่อนเปิด demo.
- Time Travel Free ย้อนหลัง 7 วันและไม่ใช่ off-account backup.
- ยังไม่มี file upload/R2, automated remote backup, production domain, remote D1 หรือ deployment.
- Phase 5 ต้องได้รับอนุมัติแยกเพื่อสร้าง staging resources; Production ต้องมี approval ใหม่อีกครั้ง.

## Safe release order

Tests → reviewed config → D1 bookmark → migrations → integrity checks → staging seed → Worker deploy → Access verification → LIFF Endpoint change → Admin operator link → cross-role smoke tests → evidence/sign-off. หาก gate ใด fail ให้หยุดและใช้ rollback section ใน Phase 5A.1 runbook.
