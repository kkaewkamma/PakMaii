# Ready to Grow — สรุปสถานะการพัฒนาและแผนงาน (Development Status)

เอกสารสรุปความคืบหน้าของโครงการ Ready to Grow สำหรับทีมพัฒนา

---

## 1. ภาพรวมสถานะโครงการปัจจุบัน (Current Status: PHASE 1-3 SPRINT UPDATED)

- **ความพร้อมของระบบ:** อัปเดต Phase 1 (End-to-End Workflow Reliability + CSP `font-src` commit `959a201`), Phase 2 (Real Photo Evidence Storage Abstraction & R2-Ready Layer), และ Phase 3 (ICS Audit Assistant: Configurable Checklists, Multi-Signal Risk Detection, Findings & Corrective Actions / CAPA, Audit Logs) แล้ว
- **Automated Tests:**
  - ชุดทดสอบเป้าหมาย Phase 1–3 (`worker-ics-audit.test.js`, `worker-e2e-workflow.test.js`, `worker-photo-evidence.test.js`, `frontend-security.test.js`, `demo-mode.test.js`, `public-demo-worker.test.js`): ผ่าน **38/38 รายการ (100% Pass)**
  - หมายเหตุเรื่อง `better-sqlite3` บน Node.js v26.13.0: ไฟล์เทสต์ฝั่ง Express + SQLite ใน `npm test` ยังต้องรันด้วย Node.js 20/22 LTS เพื่อตรวจ native binary (`better_sqlite3.node`)
- **Public Demo Environment:** Deploy แยกต่างหากบน Cloudflare Workers:
  `https://ready-to-grow-demo.readytogrow-app.workers.dev` (แยกจากระบบจริงทั้งหมด; ยังไม่ได้ re-deploy หลังอัปเดต Phase 1–3)

---

## 2. สิ่งที่พัฒนาเสร็จสมบูรณ์แล้ว (Completed Features)

### ก. ระบบแกนกลางและฐานข้อมูล (Core & Database)
- [x] โครงสร้างฐานข้อมูลเชิงสัมพันธ์สมบูรณ์ รองรับ Foreign Keys, Triggers, และ Audit Logs (`approval.reviewed`, `review.created`, `evidence.uploaded`, `checklist.created`, `checklist.updated`, `corrective_action.created`, `corrective_action.updated`)
- [x] ระบบ Dual-Runtime รองรับทั้ง Express + SQLite (Local) และ Cloudflare Workers + D1 (Edge)
- [x] D1 Migrations: `0001` – `0008` (เพิ่ม `0007_photo_evidence.sql` และ `0008_ics_audit_assistant.sql`) และ SQLite Migrations `001` – `004`
- [x] Automated Tests บน Miniflare D1: `test/worker-e2e-workflow.test.js`, `test/worker-photo-evidence.test.js`, `test/worker-ics-audit.test.js`

### ข. ระบบความปลอดภัยและสิทธิ์ผู้ใช้ (Security & RBAC)
- [x] แยกบทบาทชัดเจนระหว่าง Farmer, ICS, และ Admin
- [x] ป้องกันการเข้าถึงข้อมูลข้ามเกษตรกร (Farmer 1 ไม่เห็นข้อมูลและภาพหลักฐานของ Farmer 2)
- [x] ป้องกัน ICS เข้าถึงข้อมูลเกษตรกรนอกสายงาน (ICS 1 ไม่สามารถอนุมัติคำขอ เปิดภาพหลักฐาน บันทึกผลตรวจ หรือสร้าง/ปิด CAPA ของ Farmer สายงาน ICS 2)
- [x] เฉพาะ Admin สามารถยืนยันสถานะชุดรายการตรวจ (`validation_status='validated'`) และตั้งค่าเริ่มต้นเป็น `draft_unvalidated` เพื่อไม่ให้สับสนระหว่างการตรวจภายใน ICS กับการรับรองมาตรฐานอย่างเป็นทางการ
- [x] Public Demo ทำงานเป็น Client-Side Sandbox ตัดสิทธิ์การเข้าถึง Admin API เด็ดขาด
- [x] Security Headers และ CSP เข้มงวด (รวม `font-src 'self' data:` สำหรับฟอนต์ self-hosted `IBM Plex Sans Thai`, Magic-byte check ภาพ JPEG/PNG/WebP และ `default-src 'none'; sandbox` เมื่อเสิร์ฟภาพหลักฐาน)

### ค. ประสบการณ์ผู้ใช้ ภาพหลักฐาน และผู้ช่วยตรวจ ICS (UX, Evidence & Audit Assistant)
- [x] แถบจังหวะบันทึก 14 วัน (`create14DayRhythmTrack`), Sidebar/Bottom 4+เพิ่มเติม, 3-Step Activity Wizard, Split-View Approval, Admin Overview & RBAC Matrix
- [x] ระบบอัปโหลดภาพหลักฐานแบบ R2-ready (`worker/storage.js`) และ Local private storage (`lib/evidence-storage.js`) รองรับกล้อง + คลังภาพ ย่อขนาดฝั่ง client แสดงความคืบหน้า และแยกป้ายตัวอย่างในโหมด Demo ชัดเจน
- [x] ระบบผู้ช่วยตรวจประเมินภายใน ICS Audit Assistant: แยกหมวดหมู่ `PGS` / `EU_ORGANIC` / `FAIRTRADE` อิสระ, รายการตรวจกำหนดเอง (`checklist`), คัดกรองความเสี่ยง 5 ประเภทใน `/api/risks` (รวมขาดภาพหลักฐานและ CAPA เกินกำหนด), บันทึกข้อบกพร่องและติดตามการแก้ไข (`corrective-actions`) พร้อมสรุปผลก่อนปิดรายการ และตาราง Audit Log

---

## 3. ปัญหาที่ยังพบและข้อจำกัดปัจจุบัน (Known Limitations)

1. **Cloudflare R2 Bucket & Remote D1 Migration สำหรับ Staging/Production:**
   - ชั้นแอปพลิเคชันและ Migration (`0007_photo_evidence.sql`, `0008_ics_audit_assistant.sql`) พร้อมแล้ว แต่ยังไม่ได้รัน Migration บน Remote D1 หรือสร้าง R2 Bucket (`EVIDENCE_BUCKET`) จริง (หากยังไม่ผูก R2 API จะ fail-closed คืน `503 EVIDENCE_STORAGE_UNAVAILABLE`)
2. **การยืนยันเกณฑ์มาตรฐาน Checklist อย่างเป็นทางการ:**
   - ชุดรายการตรวจเริ่มต้นของ `PGS`, `EU_ORGANIC` และ `FAIRTRADE` ถูกทำเครื่องหมายเป็น `draft_unvalidated` ("รอการยืนยันเกณฑ์") จนกว่าผู้ดูแลระบบ/คณะกรรมการมาตรฐานจะตรวจสอบและกดยืนยันเกณฑ์
3. **การจัดเก็บข้อมูลในโหมด Demo (Standalone Client Storage):**
   - โหมด Demo ยังเก็บข้อมูลและภาพตัวอย่างเฉพาะในเบราว์เซอร์ (`localStorage`) ตามหลักการแยก Sandbox ออกจากระบบจริง
4. **งานที่เหลือใน Phase 4–7:**
   - Real QR Traceability (`GET /api/public/lots/:code` + SVG QR), Smart Farm Log + Production Cost Tracking, LINE Messaging API Notification, และ Staging/Production Readiness Audit (รวมรัน SQLite suite บน Node 20/22 LTS)

---

## 4. แผนพัฒนาถัดไป (Roadmap & Next Steps)

### ระยะสั้น (Immediate Next Steps):
1. **พัฒนา Central Demo Sync (Cloud Storage / D1):**
   - พัฒนา API กลางขนาดเล็กสำหรับให้โหมด Demo สามารถสร้าง "ห้องทดสอบ (Session/Room ID)" เพื่อให้โทรศัพท์ 2 เครื่อง (เครื่อง Farmer และเครื่อง ICS) ซิงก์ข้อมูลถึงกันได้
2. **เชื่อมต่อ Cloudflare R2 สำหรับอัปโหลดรูปภาพ:**
   - ทำฟังก์ชัน Direct Upload หรือ Signed URL ให้เกษตรกรสามารถถ่ายภาพแปลงผักจริงและอัปโหลดขึ้น R2 ได้
3. **ปรับปรุงการแสดงผลแผนที่แปลงปลูก (Plot Mapping):**
   - เพิ่มการปักหมุดพิกัด GPS ของแปลงปลูก เพื่อให้เจ้าหน้าที่ ICS สามารถนำทางไปตรวจแปลงได้สะดวก

### ระยะกลาง (Mid-Term Goals):
1. **เชื่อมต่อ LINE Messaging API:**
   - แจ้งเตือนข้อความอัตโนมัติเมื่อผลการตรวจแปลงออก หรือเมื่อคำขอปัจจัยการผลิตได้รับการพิจารณา
2. **ระบบรายงานสรุปผลผลิต (Export PDF / Excel):**
   - สร้างฟังก์ชันออกใบรับรองมาตรฐาน PGS และรายงานสรุปผลผลิตรายรอบฤดูกาล

---

## 5. ตารางรายชื่อบัญชีทดสอบ (Identity Matrix)

| รหัสผู้ใช้ | บทบาท | ชื่อจำลอง | สายงานการกำกับดูแล |
|---|---|---|---|
| `ICS-STG-001` | ICS | Demo ICS Officer 01 | ดูแล F-STG-001 ถึง F-STG-005 |
| `ICS-STG-002` | ICS | Demo ICS Officer 02 | ดูแล F-STG-006 ถึง F-STG-010 |
| `ICS-STG-003` | ICS | Demo ICS Officer 03 | ดูแล F-STG-011 ถึง F-STG-015 |
| `ICS-STG-004` | ICS | Demo ICS Officer 04 | ดูแล F-STG-016 ถึง F-STG-020 |
| `ICS-STG-005` | ICS | Demo ICS Officer 05 | ดูแล F-STG-021 ถึง F-STG-025 |
| `F-STG-001` - `005` | Farmer | Demo Farmer 01 - 05 | สังกัด ICS-STG-001 |
| `F-STG-006` - `010` | Farmer | Demo Farmer 06 - 10 | สังกัด ICS-STG-002 |
| `F-STG-011` - `015` | Farmer | Demo Farmer 11 - 15 | สังกัด ICS-STG-003 |
| `F-STG-016` - `020` | Farmer | Demo Farmer 16 - 20 | สังกัด ICS-STG-004 |
| `F-STG-021` - `025` | Farmer | Demo Farmer 21 - 25 | สังกัด ICS-STG-005 |
