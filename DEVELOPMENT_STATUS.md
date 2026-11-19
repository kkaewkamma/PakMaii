# Ready to Grow — สรุปสถานะการพัฒนาและแผนงาน (Development Status)

เอกสารสรุปความคืบหน้าของโครงการ Ready to Grow สำหรับทีมพัฒนา

---

## 1. ภาพรวมสถานะโครงการปัจจุบัน (Current Status: PHASE 1-2 SPRINT UPDATED)

- **ความพร้อมของระบบ:** อัปเดต Phase 1 (End-to-End Workflow Reliability) และ Phase 2 (Real Photo Evidence Storage Abstraction & R2-Ready Layer) แล้ว; ต้องสร้าง/ผูก Cloudflare R2 Bucket (`EVIDENCE_BUCKET`) เพิ่มเมื่อขึ้น Staging/Production
- **Automated Tests:**
  - ชุดทดสอบ Worker / Miniflare D1 / Frontend Security / Demo / Staging: ผ่าน **56/56 รายการ (100% Pass)**
  - `npm test` เต็มชุดบนเครื่องที่ใช้ Node.js v26.13.0: ติด `better-sqlite3` ขาด native binary (`better_sqlite3.node`) ในไฟล์เทสต์ฝั่ง SQLite (`api.test.js`, `migration.test.js`, `invitation.test.js`, `d1-local-migration.test.js`, `production-dev-login.test.js`, `worker-contract.test.js`) — ต้องรันด้วย Node.js 20/22 LTS เพื่อตรวจ SQLite suite ครบทั้งหมด
- **Public Demo Environment:** Deploy แยกต่างหากบน Cloudflare Workers:
  `https://ready-to-grow-demo.readytogrow-app.workers.dev` (แยกจากระบบจริงทั้งหมด)

---

## 2. สิ่งที่พัฒนาเสร็จสมบูรณ์แล้ว (Completed Features)

### ก. ระบบแกนกลางและฐานข้อมูล (Core & Database)
- [x] โครงสร้างฐานข้อมูลเชิงสัมพันธ์สมบูรณ์ รองรับ Foreign Keys, Triggers, และ Audit Logs (`approval.reviewed`, `review.created`, `evidence.uploaded`)
- [x] ระบบ Dual-Runtime รองรับทั้ง Express + SQLite (Local) และ Cloudflare Workers + D1 (Edge)
- [x] D1 Migrations: `0001` – `0007` (เพิ่ม `0007_photo_evidence.sql` สำหรับ metadata ภาพหลักฐาน) และ SQLite Migrations `001` – `003`
- [x] Backend E2E Integration Test (`test/worker-e2e-workflow.test.js`) และ Photo Evidence Test (`test/worker-photo-evidence.test.js`) บน Miniflare D1

### ข. ระบบความปลอดภัยและสิทธิ์ผู้ใช้ (Security & RBAC)
- [x] แยกบทบาทชัดเจนระหว่าง Farmer, ICS, และ Admin
- [x] ป้องกันการเข้าถึงข้อมูลข้ามเกษตรกร (Farmer 1 ไม่เห็นข้อมูลและภาพหลักฐานของ Farmer 2)
- [x] ป้องกัน ICS เข้าถึงข้อมูลเกษตรกรนอกสายงาน (ICS 1 ไม่สามารถอนุมัติคำขอหรือเปิดภาพหลักฐานของ Farmer สายงาน ICS 2)
- [x] Public Demo ทำงานเป็น Client-Side Sandbox ตัดสิทธิ์การเข้าถึง Admin API เด็ดขาด
- [x] มี Security Headers และ CSP ที่เข้มงวด ป้องกัน XSS และ Injection (ตรวจสอบ magic bytes ภาพ JPEG/PNG/WebP ก่อนจัดเก็บ และเปิดดูผ่าน Authenticated Endpoint)

### ค. ประสบการณ์ผู้ใช้และภาพหลักฐาน (UX, Mobile/LIFF & Evidence)
- [x] แถบจังหวะบันทึก 14 วัน (`create14DayRhythmTrack`), Sidebar/Bottom 4+เพิ่มเติม, 3-Step Activity Wizard, Split-View Approval, Admin Overview & RBAC Matrix
- [x] ระบบอัปโหลดภาพหลักฐานแบบ R2-ready (`worker/storage.js`) และ Local private storage (`lib/evidence-storage.js`) รองรับกล้อง + คลังภาพ ย่อขนาดฝั่ง client แสดงความคืบหน้า และแยกป้ายตัวอย่างในโหมด Demo ชัดเจน

---

## 3. ปัญหาที่ยังพบและข้อจำกัดปัจจุบัน (Known Limitations)

1. **Cloudflare R2 Bucket สำหรับ Staging/Production:**
   - ชั้นแอปพลิเคชัน (`POST /api/evidence`, `GET /api/evidence/:id`, `GET /api/evidence/:id/content`) และ Migration `0007` พร้อมแล้ว แต่ยังไม่ได้สร้าง R2 Bucket จริงและเพิ่ม `r2_buckets` binding (`EVIDENCE_BUCKET`) ลงใน `wrangler.jsonc` / `wrangler.staging.jsonc` (หากยังไม่ผูก binding API จะ fail-closed คืน `503 EVIDENCE_STORAGE_UNAVAILABLE`)
2. **การจัดเก็บข้อมูลในโหมด Demo (Standalone Client Storage):**
   - โหมด Demo ยังเก็บข้อมูลและภาพตัวอย่างเฉพาะในเบราว์เซอร์ (`localStorage`) ตามหลักการแยก Sandbox ออกจากระบบจริง
3. **การแจ้งเตือน LINE Messaging API, Real Public QR Traceability และ ICS Audit Assistant:**
   - ยังอยู่ใน Phase 3–7 ถัดไป
4. **CSP `font-src` สำหรับฟอนต์ Self-hosted:**
   - `public/_headers` และ `server.js` ยังไม่มี `font-src 'self' data:` จึงต้องขออนุมัติก่อนแก้ Header ความปลอดภัยเพื่อให้ `IBM Plex Sans Thai` โหลดจาก `/fonts/` ได้จริง

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
