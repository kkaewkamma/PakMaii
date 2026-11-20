## สรุปการเปลี่ยนแปลง (Summary)
<!-- อธิบายสั้น ๆ ว่า PR นี้ทำอะไร แก้ปัญหาอะไร หรือเพิ่มความสามารถใดตาม Phase ของ PakMaii -->

## รายละเอียดการแก้ไขแยกตามชั้น (Changes by Layer)
- **Database / Migrations:** <!-- ระบุไฟล์ d1/migrations/*.sql และ db/migrations/*.js ที่เพิ่มใหม่ -->
- **Cloudflare Workers & Repository (`worker/`):**
- **Express Local Server (`server.js`, `lib/`):**
- **Frontend UI & Demo (`public/`):**
- **Automated Tests & Docs:**

## ตรวจสอบมาตรฐานตาม `docs/RULE.md`
- [ ] **Dual-Runtime Parity:** Express + SQLite และ Cloudflare Workers + D1 ทำงาน/validate ตรงกัน
- [ ] **Auth, RBAC & Data Isolation:** คง verified LINE ID Token, session hashing, และการแยกสิทธิ์ Farmer / ICS (เฉพาะ active assignment) / Admin
- [ ] **Strict CSP & Security:** ไม่มี `innerHTML`, inline script/style, `localStorage` สำหรับ session/secret และคง Security Headers ครบถ้วน
- [ ] **Versioned Migrations Only:** เพิ่มไฟล์ migration ใหม่ตามลำดับเท่านั้น ไม่แก้ไข migration ที่ถูกนำไปใช้งานแล้ว
- [ ] **Factual Data & Non-Certification Integrity:** ไม่แสดงข้อมูลจำลอง Demo เป็นผลรับรองจริง และไม่ผสมการตรวจภายใน ICS กับการรับรองมาตรฐานอย่างเป็นทางการ
- [ ] **Tests Added / Verified:** เพิ่มหรืออัปเดต automated tests พร้อมรายงานผลรันจริงและข้อจำกัดด้านล่าง

## ผลการทดสอบที่รันจริง (Observed Test Results)
<!-- ระบุคำสั่งที่รันจริง จำนวน pass / fail / skip และ environment เช่น Node version -->

## ข้อจำกัดหรือขั้นตอนที่รอการอนุมัติ (Known Limitations / Follow-ups)
<!-- เช่น รอรัน remote D1 migration, ผูก R2 bucket, หรือยังไม่ได้ทดสอบบน LINE LIFF อุปกรณ์จริง -->
