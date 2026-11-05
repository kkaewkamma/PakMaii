# Phase 5A.1 — Cloudflare Private Staging Preparation

เอกสารนี้เป็น runbook สำหรับเจ้าของโปรเจกต์ที่ยังไม่เคย deploy Cloudflare การทำ Phase 5A.1 **ยังไม่อนุญาต** ให้สร้าง resource, migrate remote หรือ deploy และไม่เกี่ยวข้องกับ `data/dev.db`.

## 1. Architecture และ Free Tier gate

Staging ใช้ Worker หนึ่งตัวบน `workers.dev`, Static Assets จาก `public/`, และ D1 ใหม่ชื่อที่ลงท้ายด้วย `staging`. `/api/*` เข้า Worker ก่อน ส่วนไฟล์อื่นให้ `ASSETS` ตอบจาก origin เดียวกัน. Worker ไม่มี `/api/dev/login`; Admin password login ตอบปฏิเสธเมื่อ `ENVIRONMENT` ไม่ใช่ `local`.

ค่าที่ต้องติดตามก่อนและระหว่าง demo ตามเอกสาร Cloudflare ณ 15 ตุลาคม 2026:

- Workers Free: 100,000 requests/วัน, 10 ms CPU/HTTP request, RAM 128 MB, 50 subrequests/request, 64 variables/Worker, static assets 20,000 ไฟล์ และไฟล์ละไม่เกิน 25 MiB.
- D1 Free: 10 databases/account, 500 MB/database, 5 GB/account, 50 queries/Worker invocation, 5 ล้าน rows read/วัน และ 100,000 rows written/วัน. ตั้งแต่ 1 กันยายน 2026 การเกิน daily rows ทำให้ query ล้มเหลวจน reset เวลา 00:00 UTC.
- D1 Time Travel บน Free ย้อนหลังได้ 7 วัน. ใช้เป็น recovery window ไม่ใช่ long-term/off-account backup.
- Login ปกติรอ LINE `fetch` จึงไม่คิดเป็น CPU ระหว่างรอ แต่โค้ด parse/crypto/D1 ยังนับ. scrypt 32–63 ms จึงถูกปิดใน public Worker ตามเดิม.

ลิงก์อ้างอิง: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

## 2. One-time account setup (ยังไม่รันใน Phase 5A.1)

1. สร้าง/เลือก Cloudflare account และเปิด Workers subdomain. URL จะเป็น `https://ready-to-grow-staging.<account-subdomain>.workers.dev`; ยังไม่ต้องซื้อหรือย้าย DNS.
2. เปิด Zero Trust Free และตรวจหน้า subscription/seat entitlement ของ account จริงก่อนใช้งาน. อย่าอนุมานจากชื่อ plan. เพิ่ม tester ที่ระบุตัวตนเท่านั้นและจำกัดจำนวนไม่เกิน entitlement ที่ dashboard แสดง.
3. สร้าง Access Self-hosted application ครอบ production `workers.dev` URL ของ Worker นี้ และ policy Allow เฉพาะอีเมล tester. ห้าม Bypass `/api/*` หรือหน้า callback.
4. ทดสอบ Access login จาก LINE iOS/Android ก่อนเชิญผู้ใช้. Access cookie/redirect อาจทำงานต่างจาก browser ภายนอก; หากเกิด redirect loop ให้หยุด ไม่ถอด Access เพื่อแก้ชั่วคราว.

Cloudflare ระบุว่า Access ป้องกัน production/preview `workers.dev` URLs ได้ แต่ URL นั้น public หากไม่เปิด Access: [workers.dev access](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/). Account limits ไม่ใช่หลักฐานเรื่องราคา/seat; เจ้าของต้องยืนยัน Zero Trust Free subscription ใน dashboard: [Cloudflare One limits](https://developers.cloudflare.com/cloudflare-one/account-limits/).

WAF/zone Rate Limiting Rules ต้องมี zone จึงไม่ใช่ gate ที่รับประกันได้สำหรับ `workers.dev` staging และ feature/จำนวน rule แตกต่างตาม plan. ห้ามซื้อ plan หรือสร้าง rule จน dashboard ยืนยัน entitlement. ใช้ D1 distributed limiter ที่มีอยู่เป็น mandatory control; Access เป็น private perimeter. หากภายหลังใช้ custom domain ให้ประเมิน Free zone rule ใน dashboard และยึดข้อจำกัดจาก [WAF rate limiting parameters](https://developers.cloudflare.com/waf/rate-limiting-rules/parameters/) ณ วันเปลี่ยนแปลง.

## 3. Remote D1 และ config ที่ไม่มี placeholder

คำสั่งต่อไปนี้เป็นคำสั่งที่เตรียมไว้ **ห้ามรันก่อนอนุมัติ Phase 5**:

```powershell
npx.cmd wrangler login
npx.cmd wrangler d1 create ready-to-grow-staging
```

บันทึก UUID ที่ Wrangler คืนมา แล้วสร้าง config จริงซึ่งถูก `.gitignore` และ script จะปฏิเสธ UUID ศูนย์/ชื่อที่ไม่ใช่ staging:

```powershell
npm.cmd run worker:staging:config -- --database-id <UUID-FROM-CLOUDFLARE> --database-name ready-to-grow-staging --worker-name ready-to-grow-staging --liff-id <STAGING-LIFF-ID> --line-channel-id <LINE-LOGIN-CHANNEL-ID>
npm.cmd run worker:staging:dry-run
```

`wrangler.staging.jsonc` ที่ได้แยกจาก `wrangler.jsonc` local และไม่มี secret. ห้าม commit. ตรวจ output dry-run ว่า entrypoint คือ `worker/index.js`, binding คือ `DB`/`ASSETS`, routes API-first และ `ENVIRONMENT=staging`.

ก่อน migration ให้ reviewer ตรวจ migrations `0001`–`0005`, บันทึก current D1 bookmark และ approve change ticket. แล้วจึงเปิด gate และรัน:

```powershell
$env:RTG_STAGING_CHANGE_APPROVED='YES'
npm.cmd run worker:staging:migrate
Remove-Item Env:RTG_STAGING_CHANGE_APPROVED
```

หลัง migrate ตรวจ `PRAGMA foreign_key_check`, ตาราง/trigger/index, migration list และ constraints ด้วย `wrangler d1 execute ... --remote --config wrangler.staging.jsonc`. ห้ามแก้ migration ที่เคย apply; เพิ่ม migration version ใหม่เท่านั้น.

## 4. Secrets และ variables

ตั้ง secret หลัง resource creation ผ่าน prompt ของ Wrangler; ห้ามส่งค่าบน command line, ticket, chat หรือเอกสาร:

```powershell
npx.cmd wrangler secret put AGENCY_CODE_HMAC_KEYS --config wrangler.staging.jsonc
```

รายการทั้งหมด:

| Name | Type | Purpose |
|---|---|---|
| `DB` | D1 binding | dedicated staging database |
| `ASSETS` | Static Assets binding | `public/` |
| `ENVIRONMENT` | variable | ต้องเป็น `staging` |
| `LIFF_ID` | variable/identifier | frontend LIFF initialization |
| `LINE_CHANNEL_ID` | variable/identifier | backend ID-token audience verification |
| `AGENCY_CODE_HMAC_KEYS` | secret | primary/previous agency-code key ring |

ไม่ต้องใช้ LINE Channel Secret, Channel Access Token, Admin password, `.env`, `DEV_AUTH_ENABLED`, `DB_PATH` หรือ `PORT` ใน Worker.

## 5. Staging seed (ไม่มี default credential)

สร้าง manifest ชั่วคราวนอก source control เช่น `staging-identities.private.json` โดยกำหนด integer id, `agencyCode`, display `name`, `role` และ Farmer `assignedTo` เป็น agency code ของ ICS. ต้องมี Admin หนึ่งคน, ICS อย่างน้อยหนึ่งคน และ Farmer อย่างน้อยหนึ่งคน. ห้ามมี field `password`, `lineId` หรือ `token`.

โหลด HMAC key ring จาก secret manager เข้า process ชั่วคราว แล้วสร้าง SQL ที่เก็บเฉพาะ digest:

```powershell
npm.cmd run worker:staging:seed -- C:\secure\staging-identities.private.json staging-seed.sql
```

ผู้ตรวจคนที่สองเทียบ IDs/roles/assignment/counts; apply ไฟล์เพียงครั้งเดียวด้วย `wrangler d1 execute ... --remote --file staging-seed.sql --config wrangler.staging.jsonc`. จากนั้นลบ manifest/SQL อย่างปลอดภัย. Seed ตั้งทุกบัญชีเป็น `unlinked`, ไม่มี password/session/invitation/LINE identity. ใช้ Admin operator linking ก่อน แล้ว Admin จึงสร้าง invitation ครั้งเดียวให้ Farmer/ICS ผ่าน UI.

## 6. First Admin LINE provisioning — two-person gate

1. Operator A เตรียม ticket, maintenance window และยืนยันว่า `ADMIN-001` มี role `admin`, status `unlinked`, LINE NULL และ credential digest หนึ่งรายการ.
2. Operator B ตรวจ config UUID/database name, migration `0001`–`0005`, seed result และ LINE Channel ID โดยไม่เห็น secrets.
3. Operator A โหลด `AGENCY_CODE_HMAC_KEYS` และ `LINE_CHANNEL_ID` เข้า trusted terminal จาก secret manager แล้วรับ ID token สดจาก Admin ผ่านช่องทางที่อนุมัติ.
4. รันเฉพาะหลัง deployment approval:

```powershell
npm.cmd run worker:admin-line -- link --remote ADMIN-001 --config wrangler.staging.jsonc
```

CLI ตรวจ LINE กับ LINE โดยตรง, แสดงแค่ fingerprint, และต้องพิมพ์ confirmation ที่มีชื่อ D1 staging. Database trigger ทำ link + audit + session revocation แบบ atomic. Operator B ตรวจ audit `admin.line_linked`, user role/status และไม่มี token ใน logs. Recovery/unlink ใช้ ticket ใหม่, out-of-band identity check และคำสั่ง `recover`/`unlink` เดิม; ห้ามทำผ่าน HTTP.

## 7. LINE Login และ LIFF staging

ใช้ Provider และ LINE Login Channel เดิมตามข้อกำหนดโครงการ หรือสร้าง LIFF app staging แยกภายใต้ Channel เดิมถ้านโยบาย/โควตาอนุญาต:

1. Endpoint URL: production `workers.dev` URL แบบ HTTPS และ path `/` (ไม่ใช่ preview URL).
2. Scopes: `openid`, `profile`; ไม่เพิ่ม scope ที่ไม่ใช้.
3. ตั้ง LIFF app name ให้ระบุ `Ready to Grow Staging` ชัดเจน.
4. ตรวจ Channel ID ตรงกับ `LINE_CHANNEL_ID`; Worker verify `id_token` กับ LINE และใช้เฉพาะ verified `sub`.
5. Rich Menu/ข้อความทดสอบใช้ `https://liff.line.me/<LIFF_ID>` และส่งเฉพาะ tester; อย่าแทน production link โดยไม่มี rollback record.
6. Access policy ต้องยอมให้ tester ผ่านก่อน LIFF init และต้องไม่แทรก redirect ที่ทำ state/token หลุดใน URL. ทดสอบทั้งเปิดจาก LINE OA และ external browser.

## 8. Deployment commands prepared, not executed

ลำดับหลังได้รับอนุมัติ: `wrangler login` → create D1 → generate config → dry-run → set secret → bookmark → migrate → integrity checks → seed → deploy → enable/verify Access → set LIFF endpoint → link Admin → smoke tests.

คำสั่ง deploy ที่เตรียมไว้แต่ยังห้ามรัน:

```powershell
npx.cmd wrangler deploy --config wrangler.staging.jsonc
```

## 9. E2E smoke matrix

- Public perimeter: ผู้ไม่มี Access ถูกปฏิเสธ; tester ผ่าน Access ใน LINE iOS/Android; security headers/CSP/noindex อยู่ครบ.
- Farmer: redeem invitation, returning LINE login, create/edit plot, activity/history, cross-account 403, logout, expired/disabled session.
- ICS: redeem invitation, เห็นเฉพาะ assigned Farmer, approve/reject/review, cannot mutate Farmer plot, logout.
- Admin: normal LINE login, create Farmer/ICS, assignment create/end, invitation create/copy-once/revoke, no token in list/storage/log, logout.
- Abuse/error: invalid/expired/revoked/replayed invite, double submit, duplicate LINE, LINE verify failure, rate-limit 429, D1 constraint mapping, offline/slow LINE.
- Persistence: deploy a no-op version/restart isolate and confirm D1 data/session behavior remains; Express test suiteยังผ่าน.

## 10. Rollback, backup และ recovery

ก่อน migration/deploy บันทึก Worker version ID, LIFF endpoint เดิม, D1 current bookmark, row counts และ migration list. Free Time Travel เก็บ 7 วันเท่านั้น.

- Worker regression: rollback ผ่าน Cloudflare version deployment แล้วตรวจ health/config/login.
- LIFF regression: คืน Endpoint URL เดิมจาก change record.
- Migration/data corruption: หยุด writes/Access ก่อน; reviewer ยืนยัน bookmark; ใช้ `wrangler d1 time-travel restore ... --bookmark ...` ซึ่งเป็น destructive operationและต้องมีอนุมัติใหม่; บันทึก `previous_bookmark` เพื่อ undo.
- Admin compromise: ปิด account/revoke sessions ก่อน แล้วใช้ reviewed recover flow.
- Long retention: export แบบ redacted/encrypted ไป storage ที่อนุมัติใน phase ถัดไป; Free Time Travel ไม่ใช่ off-account backup.

ห้ามลบ staging database เพื่อ rollback โดยไม่มี row-count/export/bookmark verification. Production เป็น resource/config/approval แยกทั้งหมด.
