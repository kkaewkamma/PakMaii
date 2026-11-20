# Changelog — PakMaii (Ready to Grow)

บันทึกประวัติการพัฒนาทั้งหมดของโครงการ **PakMaii / Ready to Grow** เรียงตามลำดับจริงตั้งแต่เริ่มต้น จนถึงรอบ Production Readiness Sprint (`https://github.com/kkaewkamma/PakMaii`)

---

## [Unreleased / Roadmap — `v0.4.0`]
แผนงาน Production Readiness Sprint ระยะถัดไป (ตัดระบบ QR Traceability และ Phase 5 ออกตามขอบเขตที่กำหนด):
- **[Phase 6] LINE Notifications:** เชื่อมต่อ LINE Messaging API ฝั่งเซิร์ฟเวอร์พร้อม Consent, Retry และ Deduplication
- **[Phase 7] Production Readiness:** ทดสอบ LINE LIFF บนอุปกรณ์จริง iOS/Android, ตรวจ SQLite suite บน Node 20/22 LTS, และทบทวนเอกสาร Backup/Rollback

---

## [v0.3.1] — 2026-11-20 — Modular ES Architecture, Playwright E2E & Scope Refinement

### PR #9–#12 — Incremental Architecture Refactoring & Playwright E2E
- สกัด `shared/validation.js` และ `shared/audit-domain.js` ใช้งานร่วมกันระหว่าง Express และ Cloudflare Workers
- แยก Monolith `public/app.js` ออกเป็น Native ES Modules (`public/js/core/` และ `public/js/views/`) พร้อมจัดโครงสร้าง `public/app.css` เป็น 18 หมวดหมู่
- เพิ่มระบบทดสอบเบราว์เซอร์อัตโนมัติ Playwright (`Desktop` และ `Mobile-LIFF` iPhone 13 Emulation)
- ตัดระบบ QR Traceability (`showPublicTraceabilityProposal`) และตัด Phase 5 (Smart Farm Log / Production Cost Tracking) ออกจากขอบเขตโปรเจกต์เพื่อลดความซับซ้อนเกินความจำเป็น

---

## [v0.3.0] — 2026-11-20 — Production Readiness Sprint (Phases 1–3)

### PR #1 — Phase 1: End-to-End Workflow Reliability & Audit Logs (`70744bb`)
- เพิ่ม [`docs/RULE.md`](docs/RULE.md) กำหนดกฎถาวรของโปรเจกต์ (Dual-Runtime parity, RBAC, strict CSP, Versioned migrations, Non-fabrication)
- บังคับกรอกเหตุผล (`comment`) เมื่อไม่อนุมัติคำขอปัจจัยการผลิต (`PATCH /api/approvals/:id` -> `400`) ทั้งใน `worker/index.js` และ `server.js`
- บันทึกเหตุการณ์ `approval.reviewed` และ `review.created` ลงตาราง `audit_logs` ใน `worker/repository/d1.js` (`guardedBatch` / `batch`) และ `server.js` (`db.transaction`)
- เพิ่มสถานะ loading skeleton และปุ่ม retry (`ลองใหม่อีกครั้ง`) ใน `loadTab()` ของ `public/app.js`
- เพิ่มการทดสอบ E2E Workflow & RBAC บน Miniflare + D1 (`test/worker-e2e-workflow.test.js`)

### PR #2 — Phase 2: Real Photo Evidence Layer & Font CSP (`39722e4`)
- เพิ่ม D1 migration [`d1/migrations/0007_photo_evidence.sql`](d1/migrations/0007_photo_evidence.sql) และ SQLite migration [`db/migrations/003_photo_evidence.js`](db/migrations/003_photo_evidence.js)
- พัฒนา `worker/storage.js` (Cloudflare R2 storage abstraction แบบ fail-closed คืน `503 EVIDENCE_STORAGE_UNAVAILABLE` เมื่อยังไม่ผูก bucket) และ `lib/evidence-storage.js` (Private local disk storage พร้อม path traversal protection)
- เพิ่ม API `POST /api/evidence`, `GET /api/evidence/:id` และ `GET /api/evidence/:id/content` ตรวจ Magic Bytes (JPEG/PNG/WebP ≤ 5 MB), บังคับสิทธิ์ข้ามแปลง/ข้ามสายงาน ICS, และส่ง security headers (`nosniff`, `default-src 'none'; sandbox`, `private, no-store`)
- อัปเกรดฟอร์มบันทึกกิจกรรมและการตรวจแปลงให้รองรับกล้อง (`capture="environment"`), คลังภาพ, ย่อขนาดภาพก่อนอัปโหลด, แสดงความคืบหน้า (%), เปิดดูด้วย `FileReader` (`blobToDataUrl`) และแยกป้ายโหมด Demo ชัดเจน
- เพิ่ม `font-src 'self' data:` ใน `public/_headers` และ `helmet` CSP ของ `server.js` พร้อมชุดทดสอบ `test/worker-photo-evidence.test.js`

### PR #3 — Phase 3: ICS Audit Assistant (`b03c966`)
- เพิ่ม D1 migration [`d1/migrations/0008_ics_audit_assistant.sql`](d1/migrations/0008_ics_audit_assistant.sql) และ SQLite migration [`db/migrations/004_ics_audit_assistant.js`](db/migrations/004_ics_audit_assistant.js) สำหรับตาราง `inspection_checklists`, `review_assessments` และ `corrective_actions`
- แยกโครงสร้างชุดรายการตรวจสำหรับ `PGS`, `EU_ORGANIC` และ `FAIRTRADE` อิสระต่อกัน และตั้งสถานะเริ่มต้นเป็น `draft_unvalidated` ("รอการยืนยันเกณฑ์") พร้อมจำกัดสิทธิ์การยืนยันเกณฑ์เฉพาะ Admin
- เพิ่ม `/api/checklists` (GET/POST/PATCH), ปรับปรุง `GET /api/risks` ให้ตรวจจับความเสี่ยง 5 ประเภท (`overdue_action`, `inactive`, `pending`, `missing_evidence`, `open_action`), ปรับปรุง `POST/GET /api/reviews`, เพิ่ม `/api/corrective-actions` (บังคับกรอก `resolution_note` ก่อนปิดเป็น `resolved`), และเพิ่ม `GET /api/audit-logs`
- อัปเกรด UI แท็บ `reviews` (`buildIcsReviewsView`), แท็บ `risks` (`buildIcsRisksView`), ส่วน Admin ใน `loadAdminOverview`, โหมด Demo (`public/demo.js`) และเพิ่มชุดทดสอบ `test/worker-ics-audit.test.js`

### PR #4 — Repository Standards & Project-Wide Changelog
- เพิ่ม [`.github/pull_request_template.md`](.github/pull_request_template.md) และ `CHANGELOG.md` สรุปลำดับการพัฒนาทั้งหมดตั้งแต่เริ่มโปรเจกต์

---

## [v0.2.0] — UX/UI Redesign (Phases 0–5) (`7e05adc`..`459fd57`)
จัดทำและรวมโค้ดไว้บน `main` (ก่อนเปลี่ยนมาใช้โครงสร้าง Feature PR ตั้งแต่ v0.3.0):
- `7e05adc`: Phase 0 Data Integrity — ลบ simulated voice fallback, canned certifications และ single-click approval
- `cc25816`, `c8658aa`: Phase 1 Design System — self-hosted `IBM Plex Sans Thai` (`public/fonts/`), design tokens และแถบจังหวะบันทึก 14 วัน (`create14DayRhythmTrack`)
- `f5bf91e`: Phase 2 Responsive Shell — Desktop Sidebar ≥1024px (240px / 1200px max-width), Top Tabs (640–1023px) และ Mobile Dock 4+เพิ่มเติม (<640px)
- `3110ec9`: Phase 3 Farmer UX — กล่อง "สิ่งที่ต้องทำวันนี้", 3-Step Activity Wizard และข้อมูลระยะปรับเปลี่ยนตามจริง
- `a03adb5`: Phase 4 ICS UX — เชื่อม `/api/risks`, ฟีดกิจกรรมล่าสุด, ตัวกรองคำขอ/ผลตรวจ และ Split-View Approval Review
- `459fd57`: Phase 5 Admin Overview & Traceability Proposal — หน้าภาพรวมระบบ + ตาราง RBAC แบบอ่านอย่างเดียว, ตัวอย่าง Public Traceability (QR proposal) และ `@media print`

---

## [v0.1.0] — Foundation & Core Platform (`cf1f7d9`..`6533839`)
- `cf1f7d9`: Initial setup โครงสร้าง Dual-Runtime (`server.js` Express + SQLite และ `worker/index.js` Cloudflare Workers + D1), LINE LIFF authentication, invitation redemption และ server-side RBAC
- `388002f`..`6533839`: พัฒนา Public Demo Sandbox แยกส่วน (`worker/demo-worker.js`, `public/demo.js`), D1 migration `0006_ready_to_grow_features.sql`, คู่มือ Spark Hack Season 2, การบีบอัดภาพฝั่ง client, CSV Export และแจ้งเตือน LINE เบื้องต้น
