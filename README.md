# Ready to Grow — ระบบบริหารจัดการแปลงเกษตรอินทรีย์และการตรวจรับรองมาตรฐาน (PGS / ICS)

ยินดีต้อนรับสู่ชุด Source Code และเอกสารส่งมอบโครงการ **Ready to Grow** สำหรับนักพัฒนาที่จะนำไปพัฒนาต่อ

---

## 1. Ready to Grow คืออะไร?

**Ready to Grow** คือเว็บแอปพลิเคชันที่ออกแบบมาเพื่อช่วยเหลือกลุ่มเกษตรกรและผู้ตรวจรับรองมาตรฐานเกษตรอินทรีย์ (PGS / Participatory Guarantee Systems) ในการบันทึก ติดตาม และควบคุมคุณภาพแปลงปลูกแบบดิจิทัล ทำงานได้อย่างคล่องตัวบนโทรศัพท์มือถือผ่าน **LINE LIFF (LINE Front-end Framework)** และเว็บบราวเซอร์ทั่วไป

จุดเด่นของระบบคือ:
- ใช้งานง่ายบนมือถือผ่าน LINE OA โดยไม่ต้องลงแอปพลิเคชันเพิ่มเติม
- มีระบบควบคุมภายใน (**ICS - Internal Control System**) ตรวจสอบความถูกต้องของการใช้สารปรับปรุงดินและปัจจัยการผลิต
- มีโหมด **Public Demo Sandbox** ให้นักพัฒนาและผู้ใช้ทดลองใช้งานได้ทันทีโดยไม่ต้องเชื่อมต่อฐานข้อมูลจริงหรือล็อกอิน LINE

---

## 2. บทบาทผู้ใช้งานในระบบ (Roles & Permissions)

ระบบแบ่งผู้ใช้งานออกเป็น 3 บทบาทหลัก:

| บทบาท | หน้าที่และความรับผิดชอบหลัก | สิทธิ์การเข้าถึงข้อมูล |
|---|---|---|
| **Farmer (เกษตรกร)** | - เพิ่มและแก้ไขข้อมูลแปลงปลูกของตนเอง<br>- บันทึกกิจกรรมประจำวัน (ปลูก, บำรุง, เก็บเกี่ยว) พร้อมภาพถ่าย<br>- ส่งคำขออนุมัติปัจจัยการผลิต (ปุ๋ย, สารชีวภัณฑ์)<br>- ติดตามสถานะคำขอ (รอพิจารณา, อนุมัติ, ไม่อนุมัติ พร้อมความเห็น ICS)<br>- ดูประวัติการเข้าตรวจแปลงจากเจ้าหน้าที่ ICS<br>- บันทึกล็อตผลผลิตที่เก็บเกี่ยว | เห็นเฉพาะแปลง, กิจกรรม, คำขอ และผลตรวจของ**ตนเองเท่านั้น** (ห้ามเข้าถึงข้อมูลเกษตรกรรายอื่น) |
| **ICS (เจ้าหน้าที่ตรวจรับรอง)** | - กำกับดูแลกลุ่มเกษตรกรที่ได้รับมอบหมาย (สัดส่วน 5 เกษตรกร : 1 ICS)<br>- ตรวจสอบและอนุมัติ/ไม่อนุมัติ คำขอปัจจัยการผลิต พร้อมให้คำแนะนำ<br>- บันทึกผลการตรวจแปลงประจำงวด (ผ่าน/ไม่ผ่าน พร้อมข้อสังเกต)<br>- ตรวจจับความเสี่ยง (แปลงที่ขาดการบันทึกเกิน 14 วัน หรือมีคำขอค้าง) | เข้าถึงข้อมูลเกษตรกรได้เฉพาะ**กลุ่มที่ตนเองได้รับมอบหมายเท่านั้น** (ห้ามก้าวก่ายกลุ่มของ ICS ท่านอื่น) |
| **Admin (ผู้ดูแลระบบ)** | - จัดการเพิ่ม/ระงับ บัญชีผู้ใช้งาน<br>- มอบหมายคู่เกษตรกรกับเจ้าหน้าที่ ICS<br>- สร้างและเพิกถอนรหัสเทียบเชิญ (Registration Invites)<br>- เชื่อมโยงบัญชี LINE Admin ผ่าน CLI ปลอดภัย | จัดการระบบภาพรวมและบัญชีผู้ใช้ (แยกการยืนยันตัวตนอย่างเข้มงวด) |

---

## 3. ฟังก์ชันที่พัฒนาเสร็จสมบูรณ์แล้ว

1. **ระบบ Public Demo Sandbox (Client-Side Isolation):**
   - จำลอง Backend API เต็มรูปแบบในเบราว์เซอร์ (`public/demo.js`)
   - จำลองบัญชีเกษตรกร 25 บัญชี (`F-STG-001` ถึง `F-STG-025`) และเจ้าหน้าที่ ICS 5 บัญชี (`ICS-STG-001` ถึง `ICS-STG-005`)
   - สลับ Role และ Logout/Login ได้ทันที ข้อมูลไม่ตีกัน
   - มีระบบจำลองการอนุมัติ/ตรวจแปลงที่สะท้อนผลข้าม Role ทันที
2. **หน้า Farmer Workflow:**
   - Dashboard สรุปจำนวนแปลง, กิจกรรม, และคำขอ
   - เพิ่มแปลง / แก้ไขแปลงแบบ Inline (`✏️ แก้ไขแปลง`)
   - บันทึกกิจกรรมประจำวัน พร้อมเลือกแปลงที่ปลูก
   - ส่งคำขออนุมัติปัจจัยการผลิต และติดตามสถานะแบบ Real-time พร้อมกล่องความเห็นจาก ICS
   - หน้าติดตามผลตรวจแปลง (`ผลตรวจแปลง`)
   - บันทึกล็อตผลผลิต
3. **หน้า ICS Workflow:**
   - Dashboard ภาพรวมเกษตรกรในความดูแล (5 คน)
   - แท็บรายชื่อเกษตรกร สรุปสถานะกิจกรรมล่าสุด
   - พิจารณาคำขออนุมัติแบบ Inline Decision Box (`✅ อนุมัติ` / `❌ ไม่อนุมัติ` พร้อมกล่องเหตุผล)
   - บันทึกผลการตรวจรับรองแปลง
   - ตรวจสอบรายการความเสี่ยง (Risk Monitoring)
4. **ความปลอดภัยและการป้องกันข้อผิดพลาด:**
   - ป้องกัน Double-Submit (ปุ่มขึ้นสถานะ "กำลังบันทึก..." และล็อคปุ่ม)
   - ป้องกัน XSS (ไม่มี `innerHTML` จาก Input ผู้ใช้)
   - ป้องกัน Injection และบล็อกการเข้าถึง Admin API ในโหมด Demo
   - มีหน้าต่างยืนยัน (Confirmation) ก่อนกดรีเซ็ตข้อมูล Demo

---

## 4. โครงสร้างไฟล์และไดเรกทอรี (Directory Structure)

```
Ready-to-Grow/
├── public/                       # ไฟล์ Static Frontend สำหรับทั้ง Local และ Edge
│   ├── index.html                # หน้าเว็บหลัก (HTML5 Semantic, Mobile-first)
│   ├── app.js                    # UI Application Logic & DOM Rendering
│   ├── app.css                   # Custom Vanilla CSS Design System (LINE LIFF Safe)
│   ├── demo.js                   # Client-Side Demo Backend & localStorage Engine
│   └── _headers                  # Content Security Policy (CSP) & Security Headers
├── server.js                     # Express.js Server สำหรับการรัน Localhost
├── worker/                       # Cloudflare Workers Code สำหรับ Edge Deployment
│   ├── index.js                  # Worker API หลัก (Production / Staging)
│   ├── demo-worker.js            # Isolated Demo Worker (ตัด D1 และ Secrets ออก)
│   ├── auth.js                   # Authentication & Session verification
│   └── repository/d1.js          # Cloudflare D1 Database Data Access Layer
├── d1/migrations/                # SQL Migrations สำหรับ Cloudflare D1
├── db/                           # SQLite Database Layer สำหรับ Localhost
│   ├── migrate.js                # SQLite Migration Runner
│   └── migrations/               # SQLite SQL Schema Migrations (0001 - 0005)
├── lib/                          # Shared Cryptographic Utilities (HMAC, Scrypt, Tokens)
├── scripts/                      # Developer Tooling & Automation Scripts
├── test/                         # Automated Test Suite (Node.js Test Runner)
├── staging-identities.example.json # ข้อมูลจำลองเกษตรกร 25 ท่าน และ ICS 5 ท่าน
├── package.json                  # Dependencies & npm scripts
├── wrangler.jsonc                # Cloudflare Worker Local Config
├── wrangler.demo.jsonc           # Cloudflare Worker Public Demo Config
└── .env.example                  # Environment Variables Template
```

---

## 5. วิธีติดตั้ง Node.js และ Dependencies

### ความต้องการของระบบ:
- **Node.js**: เวอร์ชัน 20.0.0 หรือใหม่กว่า (แนะนำ Node.js LTS 20.x หรือ 22.x)
- **npm**: เวอร์ชัน 10.x ขึ้นไป

### ขั้นตอนการติดตั้ง:
```bash
# 1. แตกไฟล์ ZIP และเปิด Terminal / PowerShell ในโฟลเดอร์โปรเจกต์
cd Ready-to-Grow-Source

# 2. ติดตั้ง Dependencies ทั้งหมด
npm install
```

---

## 6. วิธีเปิดระบบบน Local (Local Development)

### ทางเลือกที่ 1: รันด้วย Express.js (แนะนำสำหรับการพัฒนา UI และ Local API)
```bash
# คัดลอกไฟล์ config ตัวอย่าง
cp .env.example .env

# เริ่มต้นฐานข้อมูล SQLite Local
npm run migrate

# รัน Development Server
npm run dev
```
เปิดเบราว์เซอร์ไปที่: **http://localhost:3000**

---

### ทางเลือกที่ 2: รันด้วย Cloudflare Worker Local (Miniflare / D1 Local)
```bash
# รัน migration ใน D1 Local
npm run worker:db:migrate

# รัน Worker Dev Server
npm run worker:dev
```
เปิดเบราว์เซอร์ไปที่: **http://localhost:8787**

---

## 7. วิธีทดสอบด้วยบัญชี Demo (Demo Login)

เมื่อเปิดหน้าเว็บ ให้เลือกแท็บ **เกษตรกร (Farmer)** หรือ **เจ้าหน้าที่ (ICS)** แล้วใส่รหัสด้านล่าง:

### บัญชีเกษตรกร (Farmer Demo):
- **`F-STG-001`** ถึง **`F-STG-005`** (อยู่ในความดูแลของ **ICS-STG-001**)
- **`F-STG-006`** ถึง **`F-STG-010`** (อยู่ในความดูแลของ **ICS-STG-002**)
- **`F-STG-011`** ถึง **`F-STG-015`** (อยู่ในความดูแลของ **ICS-STG-003**)
- **`F-STG-016`** ถึง **`F-STG-020`** (อยู่ในความดูแลของ **ICS-STG-004**)
- **`F-STG-021`** ถึง **`F-STG-025`** (อยู่ในความดูแลของ **ICS-STG-005**)

### บัญชีเจ้าหน้าที่ตรวจรับรอง (ICS Demo):
- **`ICS-STG-001`**: กำกับดูแลเกษตรกร F-STG-001 ถึง F-STG-005
- **`ICS-STG-002`**: กำกับดูแลเกษตรกร F-STG-006 ถึง F-STG-010
- **`ICS-STG-003`**: กำกับดูแลเกษตรกร F-STG-011 ถึง F-STG-015
- **`ICS-STG-004`**: กำกับดูแลเกษตรกร F-STG-016 ถึง F-STG-020
- **`ICS-STG-005`**: กำกับดูแลเกษตรกร F-STG-021 ถึง F-STG-025

### ขั้นตอนทดสอบการทำงานข้าม Role (Cross-Role Testing):
1. ล็อกอินด้วย `F-STG-001` ➜ เพิ่มแปลง ➜ ส่งคำขออนุมัติปุ๋ย ➜ กด **ออกจากระบบ**
2. ล็อกอินด้วย `ICS-STG-001` ➜ ตรวจสอบคำขอที่แท็บ **คำขอ** ➜ กรอกเหตุผลแล้วกด **อนุมัติ** ➜ กด **ออกจากระบบ**
3. ล็อกอินกลับมาด้วย `F-STG-001` ➜ ตรวจสอบสถานะคำขอ จะพบว่าเป็นสีเขียว "อนุมัติ" พร้อมความเห็นของ ICS ทันที

---

## 8. วิธีรัน Automated Tests

โปรเจกต์มีชุดทดสอบครอบคลุมทั้ง Unit Tests, Integration Tests, Security Tests และ Demo Workflow Tests:

```bash
npm test
```

**เกณฑ์การตรวจสอบ:** ต้องผ่านทั้งหมด 80/80 tests (0 fail) ก่อนทำ commit หรือส่งมอบงาน

---

## 9. แนวทางการพัฒนาต่อโดยไม่กระทบระบบจริง

1. **ห้ามรันคำสั่ง Deploy สู่ Staging หรือ Production:**
   - ห้ามรัน `wrangler deploy --config wrangler.staging.jsonc` เด็ดขาด
   - หากต้องการทดสอบ Deploy ให้ใช้เฉพาะ `wrangler.demo.jsonc` ไปยัง Demo Worker ของตนเอง
2. **ห้ามแตะต้อง Cloudflare Access Policy หรือ Remote D1:**
   - ฐานข้อมูล Staging และกุญแจความปลอดภัยถูกล็อกไว้บน Cloudflare ป้องกันไม่ให้บุคคลภายนอกแก้ไข
3. **การแก้ไข Frontend:**
   - แก้ไขได้ที่ `public/app.js`, `public/demo.js` และ `public/app.css`
   - ทดสอบในเครื่องตนเองผ่าน `npm run dev` เสมอ

---

## 10. ข้อจำกัดของ localStorage และการซิงก์ข้อมูลข้ามเครื่อง

> ⚠️ **ข้อควรทราบสำคัญเกี่ยวกับ Public Demo:**
> 
> 1. ข้อมูลทั้งหมดในโหมด Demo ถูกจัดเก็บไว้ใน **`localStorage` ของเบราว์เซอร์เครื่องนั้นๆ** (Key: `rtg-demo-store-v1`)
> 2. **ไม่มีการส่งข้อมูลไปยังเซิร์ฟเวอร์ส่วนกลาง** ดังนั้น หากเปิดใช้งานบนโทรศัพท์เครื่องที่ 1 แล้วเปิดบนโทรศัพท์เครื่องที่ 2 ข้อมูลจะไม่เชื่อมโยงกัน
> 3. หากผู้ใช้กด "ล้างประวัติการท่องเว็บ" หรือเปิด "โหมดไม่ระบุตัวตน (Incognito)" ข้อมูลที่ทดลองกรอกไว้จะกลับคืนสู่ค่าเริ่มต้น (Seed Data)
> 4. หากต้องการรีเซ็ตข้อมูลกลับสู่ค่าตั้งต้น ให้กดปุ่ม **"🔄 รีเซ็ตข้อมูล Demo"** ที่มุมขวาบนของหน้าเว็บ
