# ปลูกของดี — PakMaii (Ready to Grow)
### ระบบบริหาร จัดการ และตรวจสอบมาตรฐานเกษตรอินทรีย์ วิสาหกิจชุมชนตำบลผักไหม จ.ศรีสะเกษ

> **การแข่งขัน:** Spark Hack Season #2 • **โจทย์:** ปลูกของดี  
> **กลุ่มเป้าหมาย:** วิสาหกิจชุมชนเกษตรอินทรีย์ตำบลผักไหม อ.ห้วยทับทัน จ.ศรีสะเกษ (มาตรฐาน PGS, EU Organic, และ Fairtrade)

[![Live Website](https://img.shields.io/badge/Production-pakmaii.readytogrow--app.workers.dev-059669?style=flat-square&logo=cloudflare&logoColor=white)](https://pakmaii.readytogrow-app.workers.dev)
[![LINE Integration](https://img.shields.io/badge/LINE_Messaging_API-OAuth_v2.1_Push-06C755?style=flat-square&logo=line&logoColor=white)](https://pakmaii.readytogrow-app.workers.dev)
[![Standards](https://img.shields.io/badge/Standards-PGS_%7C_EU_Organic_%7C_Fairtrade-d97706?style=flat-square&logo=leaf&logoColor=white)](https://pakmaii.readytogrow-app.workers.dev)
[![Test Suite](https://img.shields.io/badge/Tests-37%2F37_Passing-2563eb?style=flat-square&logo=node.js&logoColor=white)](test/)
[![Security](https://img.shields.io/badge/Security-Strict_CSP_Level_2_%26_RBAC-10b981?style=flat-square&logo=shield&logoColor=white)](docs/ARCHITECTURE.md)

---

## ทดลองใช้งานระบบจริง (Live Deployment)

* **ลิงก์เข้าสู่ระบบ:** [https://pakmaii.readytogrow-app.workers.dev](https://pakmaii.readytogrow-app.workers.dev)
* **รองรับการใช้งาน:** เปิดใช้งานได้ทั้งบนเว็บเบราว์เซอร์มือถือ คอมพิวเตอร์ และผ่าน LINE LIFF In-App Browser
* **โหมดสาธิต (Interactive Demo):** สลับบทบาทระหว่าง **เกษตรกร (Farmer)** และ **เจ้าหน้าที่ตรวจประเมินภายใน (ICS)** ได้ทันทีโดยข้อมูลคำขอและกิจกรรมเชื่อมโยงถึงกันแบบ Real-time
* **คำแนะนำการใช้งาน (Tutorial):** แนะนำภาพรวมโครงการและบริบทพื้นที่จริง ต.ผักไหม จ.ศรีสะเกษ

---

## บริบทพื้นที่และโจทย์ปัญหาจริง (Context & Core Challenge)

**วิสาหกิจชุมชนเกษตรอินทรีย์ตำบลผักไหม อ.ห้วยทับทัน จ.ศรีสะเกษ** มีสมาชิกเกษตรกร 65 ราย พื้นที่แปลงปลูกรวม 120 แปลง (380 ไร่) ดำเนินการผลิตตามมาตรฐานเกษตรอินทรีย์แบบมีส่วนร่วม (PGS), มาตรฐานยุโรป (EU Organic) และการค้าที่เป็นธรรม (Fairtrade)

* **พืชเศรษฐกิจและแนวทางปฏิบัติจริงในพื้นที่:**
  * ข้าวหอมมะลิ 105 อินทรีย์ (พืชหลัก)
  * ถั่วเหลืองอินทรีย์หลังนา (สร้างรายได้เสริมและบำรุงดินตามมาตรฐาน Fairtrade)
  * ปอเทืองไถกลบตอซัง ปลอดการเผาฟาง 100%
  * การเพาะเลี้ยงแหนแดง และระบบธนาคารน้ำใต้ดินแก้ปัญหาภัยแล้ง

### ปัญหาสำคัญ (Core Problem):
> กระบวนการตรวจประเมินและจดบันทึกแบบดั้งเดิมใช้เอกสารกระดาษซ้ำซ้อน เกษตรกรส่วนใหญ่เป็นผู้สูงอายุทำให้บันทึกข้อมูลไม่ต่อเนื่อง และหากสมาชิกแม้เพียงรายเดียวทำผิดข้อกำหนดหรือใช้ปัจจัยการผลิตที่ไม่ได้มาตรฐาน จะส่งผลกระทบให้กลุ่มวิสาหกิจชุมชนถูกเพิกถอนใบรับรองมาตรฐานทั้งกลุ่ม (Group Certification Fall-out)

**Ready to Grow ถูกออกแบบมาเพื่อแก้ปัญหานี้โดยตรง:** บันทึกง่ายสำหรับผู้สูงอายุ, คัดกรองความเสี่ยงเชิงรุก, และแจ้งเตือนผ่าน LINE ทันทีเมื่อมีงานค้างหรือขาดการบันทึกเกิน 14 วัน

---

## ระบบแจ้งเตือน Real-time ผ่าน LINE Messaging API

ระบบเชื่อมต่อกับ LINE Official Account ผ่านสถาปัตยกรรม Serverless Webhook และ OAuth v2.1 Dynamic Token Issuance ครอบคลุม 5 เหตุการณ์สำคัญ:

1. **แจ้งเตือนคำขอใช้ปัจจัยการผลิตใหม่ (Input Submitted):** เมื่อเกษตรกรยื่นขอใช้ปุ๋ย/สารชีวภาพ ระบบจะส่ง Push Notification แจ้งเตือนเจ้าหน้าที่ ICS ประจำกลุ่มทันที พร้อมปุ่มเปิดดูและอนุมัติผ่าน LINE
2. **แจ้งเตือนผลการอนุมัติ (Approval Decided):** ส่งข้อความแจ้งเตือนผลการอนุมัติหรือปฏิเสธคำขอ (พร้อมระบุเหตุผลและคำแนะนำในการปรับปรุงสูตร) ตรงถึงโทรศัพท์ของเกษตรกรผู้ยื่นคำขอ
3. **แจ้งเตือนเกษตรกรกรณีลืมบันทึกข้อมูลรอบ 14 วัน (Rhythm Overdue Reminder):** ตรวจจับแปลงที่ไม่มีการบันทึกกิจกรรมเกิน 14 วันตามเกณฑ์ PGS ผักไหม พร้อมส่งข้อความเตือนให้บันทึกเพื่อรักษาความต่อเนื่องของประวัติแปลง
4. **แจ้งเตือนกำหนดแก้ไขปรับปรุง (CAPA Deadline):** แจ้งเตือนข้อบกพร่องที่ต้องปรับปรุงก่อนถึงวันครบกำหนดนัดหมาย
5. **ผูกบัญชีอัตโนมัติผ่านช่องแชท (Self-Binding Webhook):**
   * พิมพ์ `id` เพื่อดู LINE User ID
   * พิมพ์ `ผูก ics` เพื่อผูกบัญชีกับเจ้าหน้าที่ ICS (คุณวิชัย ผักไหม)
   * พิมพ์ `ผูก เกษตรกร` เพื่อผูกบัญชีกับเกษตรกร (คุณสมปอง คำภา)
   * พิมพ์ `เตือนแปลง` เพื่อสั่งสแกนและส่งข้อความเตือนเกษตรกรที่ขาดบันทึกได้ทันทีผ่านแชท

---

## ผังบทบาทหน้าที่และสิทธิ์การใช้งาน (Role Matrix & Responsibilities)

ระบบแบ่งแยกสิทธิ์ตามบทบาท (Role-Based Access Control: RBAC) อย่างเข้มงวด ทั้งในระดับฐานข้อมูลและส่วนติดต่อผู้ใช้:

| บทบาท (Role) | สิทธิ์และการมองเห็นข้อมูล (Data Visibility) | หน้าที่ความรับผิดชอบหลัก (Core Responsibilities) | ฟังก์ชันเด่น |
| :--- | :--- | :--- | :--- |
| **เกษตรกร (Farmer)** | เข้าถึงเฉพาะแปลง กิจกรรม คำขอ และผลตรวจของตนเองเท่านั้น | 1. บันทึกกิจกรรมแปลง 3 ขั้นตอน<br>2. ยื่นขออนุมัติปัจจัยการผลิตล่วงหน้า<br>3. ตรวจสอบผลการตรวจแปลงและคำแนะนำจาก ICS<br>4. บันทึกเรื่องราวล็อตผลผลิต (Lot Story) | • ปุ่ม "ก+ ตัวอักษรใหญ่" สำหรับผู้สูงอายุ<br>• สั่งงานด้วยเสียงภาษาไทย (Voice-to-Text)<br>• ปุ่มลัดงานเกษตรอินทรีย์รอบปลูก |
| **เจ้าหน้าที่ตรวจประเมินภายใน (ICS Officer)** | มองเห็นเฉพาะข้อมูลเกษตรกรและแปลงที่ได้รับมอบหมายในความดูแล | 1. วิเคราะห์ความพร้อมกลุ่ม (PGS Analytics)<br>2. คัดกรองความเสี่ยงเชิงรุก 5 ด้าน<br>3. พิจารณาอนุมัติปัจจัยการผลิต (Approve/Reject with Reason)<br>4. ตรวจประเมินแปลงตาม Checklist (PGS, EU, Fairtrade) และออกใบงาน CAPA<br>5. ส่งแจ้งเตือน LINE เตือนเกษตรกรขาดบันทึก | • หน้าจอแบบกระชับ (Streamlined Mobile UI)<br>• แถบสลับ 3 โหมด (งานด่วน, มาตรฐาน PGS, กิจกรรม)<br>• แถบ 4 ตัวเลขด่วน (Quick KPI Strip)<br>• ฟิลเตอร์คัดกรองกิจกรรมรายแปลง |
| **ผู้ดูแลระบบ (System Admin)** | จัดการผู้ใช้งาน มอบหมายงาน และตั้งค่าระบบ | 1. บริหารจัดการคำเชิญผูก LINE (Invites อายุ 24 ชม.)<br>2. จัดการบัญชีผู้ใช้งาน (Users)<br>3. มอบหมายเกษตรกรให้อยู่ในความดูแลของเจ้าหน้าที่ ICS<br>4. ยืนยันความถูกต้องของชุดคำถามมาตรฐานเกษตรอินทรีย์ (Checklists Validation) | • ตารางสิทธิ์ RBAC Read-Only<br>• บันทึกประวัติการเปลี่ยนแปลง (Audit Logs)<br>• ระบบกู้คืนบัญชีผู้ดูแลผ่าน CLI ปลอดภัยสูง |

---

## บัญชีทดลองใช้งานในระบบ (Demo Personas)

ในโหมดสาธิต (Interactive Demo) สามารถแตะเลือก Persona เพื่อทดสอบตามสถานการณ์จำลองจริงได้ทันที:

| Persona | รหัสประจำตัว | บทบาท | สถานการณ์จำลองสำหรับการทดสอบ |
| :--- | :--- | :--- | :--- |
| **คุณสมปอง คำภา** | `F-STG-001` | เกษตรกร (Farmer) | เจ้าของแปลง A-03 (ข้าวหอมมะลิ 105 อินทรีย์ & ธนาคารน้ำใต้ดิน) มีสถานะขาดบันทึกเกิน 14 วัน ทดสอบการบันทึกกิจกรรม 3 ขั้นตอน สั่งงานด้วยเสียง และยื่นขอปัจจัย |
| **คุณบัวผัน ศรีห้วยทับทัน** | `F-STG-002` | เกษตรกร (Farmer) | เจ้าของแปลง B-01 (ถั่วเหลืองอินทรีย์หลังนา Fairtrade) ทดสอบสถานะคำขอไม่ผ่านการอนุมัติและกดส่งสูตรใหม่ |
| **คุณวิชัย ผักไหม** | `ICS-STG-001` | เจ้าหน้าที่ ICS | หัวหน้าชุดตรวจประเมินภายใน ดูแลสมาชิก 5 ราย ทดสอบพิจารณาคำขอ ตรวจแปลงตามเกณฑ์ และสั่งแจ้งเตือน LINE เตือนเกษตรกร |
| **ผู้ดูแลระบบ** | `ADMIN` | System Admin | เข้าสู่ระบบผู้ดูแลเพื่อออกคำเชิญ มอบหมายงาน และยืนยันเกณฑ์การตรวจ |

---

## คุณสมบัติเด่นของระบบ (Key Capabilities)

### 1. การออกแบบเพื่อเกษตรกรและผู้สูงอายุ (Elderly-Friendly UX)
* **ปุ่มสลับ "ก+ ตัวอักษรใหญ่":** ขยายขนาดตัวหนังสือ การ์ด และปุ่มกดให้อ่านง่ายสบายตาแม้อยู่กลางแดด
* **สมุดบันทึกแปลง 3 ขั้นตอน:** เลือกแปลง ➔ ระบุกิจกรรม/ปัจจัย ➔ แนบรูปถ่ายยืนยัน
* **สั่งงานด้วยเสียงภาษาไทย (Voice-to-Text):** แตะไมโครโฟนแล้วพูดภาษาไทย ระบบจะพิมพ์รายละเอียดกิจกรรมลงในช่องให้อัตโนมัติ
* **ปุ่มลัดรอบเกษตรอินทรีย์ผักไหม:** บันทึกงานประจำรอบปลูกได้ในคลิกเดียว (เช่น ไถกลบตอซัง, หว่านปอเทือง, ปล่อยแหนแดง, พ่นน้ำหมักชีวภาพ)

### 2. หน้าจอเจ้าหน้าที่ ICS ที่กระชับและคล่องตัว (Streamlined ICS Experience)
* **หัวแถบแบบ Native App:** ซ่อนกล่องโปรไฟล์ที่เทอะทะในหน้าย่อย คืนพื้นที่หน้าจอให้เห็นเนื้อหางานเต็มตา
* **แถบ 4 ตัวเลขด่วน (Interactive KPI Strip):** สรุปเกษตรกร พื้นที่แปลง คำขอรอตรวจ และจุดเสี่ยง แตะที่ตัวเลขเพื่อเปิดหน้างานนั้นได้ทันที
* **แถบสลับ 3 หมวดหมู่ในหน้าภาพรวม:**
  * `งานด่วน & จุดเสี่ยง`: คำขอรอตรวจและแปลงเฝ้าระวัง 5 จุดเสี่ยง จบในหน้าจอแรกโดยไม่ต้องเลื่อนยาว
  * `มาตรฐาน PGS & ชาร์ต`: สรุปดัชนีความพร้อมและกราฟสัดส่วนชนิดพืช
  * `กิจกรรมล่าสุด`: ฟีดความเคลื่อนไหวการบันทึกแปลงของสมาชิก
* **ฟิลเตอร์คัดกรองรายแปลง:** เลือกดูบันทึกกิจกรรมแยกตามแปลงได้สะดวกรวดเร็ว

### 3. ระบบจัดเก็บภาพถ่ายหลักฐานจริง (Photo Evidence Storage)
* รองรับการเปิดกล้องถ่ายภาพแปลงสด (`capture="environment"`) และเลือกภาพจากคลังรูปภาพ
* บีบอัดและย่อขนาดภาพฝั่งเบราว์เซอร์อัตโนมัติ เพื่อประหยัดแบนด์วิดท์กลางแปลงนา
* ตรวจสอบความถูกต้องของไฟล์ด้วย Magic Bytes (JPEG/PNG/WebP สูงสุด 5MB)
* เสิร์ฟภาพภายใต้การรักษาความปลอดภัยตามมาตรฐาน Sandbox Isolation

---

## โครงสร้างโฟลเดอร์โครงการ (Repository Structure)

```text
pakmaii-app/
├── d1/migrations/         # Cloudflare D1 SQL Migrations (0001 - 0009_line_notifications)
├── db/migrations/         # SQLite Migrations สำหรับ Express
├── docs/                  # เอกสารสถาปัตยกรรม กฎโครงการ และคู่มือส่งมอบงาน
│   ├── ARCHITECTURE.md    # รายละเอียดสถาปัตยกรรมระบบ Dual-Runtime และ Security
│   ├── DEVELOPMENT_STATUS.md # สรุปผลการพัฒนาและความพร้อมของระบบ
│   ├── HANDOVER.md        # ข้อมูลการตั้งค่าระบบและความปลอดภัย
│   └── RULE.md            # กฎถาวรของโปรเจกต์ (Dual-Runtime, RBAC, CSP)
├── lib/                   # โมดูลช่วยเหลือ (Notification Dispatcher, Storage, HMAC)
├── public/                # ส่วนติดต่อผู้ใช้ (Frontend UI - Vanilla ES Modules & CSS)
│   ├── js/core/           # โมดูลแกนหลัก (State, DOM, Icons, Photo, Rhythm, API, Auth, Deep Link)
│   ├── js/views/          # โมดูลมุมมอง (Farmer, ICS, Admin, Passport, Tutorial)
│   ├── fonts/             # ฟอนต์อัตลักษณ์ IBM Plex Sans Thai (Self-hosted 100%)
│   ├── app.js             # Entry Point ควบคุม State, Role Navigation และ Routing
│   ├── app.css            # สไตล์ชีตหลัก จัดกลุ่มตามระบบ Design System
│   ├── demo.js            # Standalone Client-Side Demo Backend & Store
│   └── _headers           # Security Headers & Strict CSP Level 2
├── shared/                # โค้ดที่ใช้ร่วมกันระหว่าง Express และ Cloudflare Workers
│   ├── audit-domain.js    # การคำนวณและจัดหมวดหมู่ความเสี่ยง 5 มิติ
│   ├── line-messaging.js  # LINE Message Builders, Push Dispatcher & OAuth v2.1
│   └── validation.js      # ตัวตรวจสอบความถูกต้องของข้อมูล (HttpError, Types, Bounds)
├── test/                  # ชุดทดสอบอัตโนมัติ (Automated Test Suites)
├── worker/                # Cloudflare Workers Edge API (Serverless Runtime)
│   ├── repository/d1.js   # ชั้นเชื่อมต่อฐานข้อมูล Cloudflare D1
│   ├── auth.js            # การยืนยันตัวตน LINE ID Token และ Session Management
│   ├── index.js           # Cloudflare Worker API Gateway & LINE Webhook
│   └── storage.js         # Cloudflare R2 Storage Abstraction
├── package.json           # ข้อมูลโปรเจกต์และ Scripts
├── README.md              # หน้าแรกของคลังโค้ด (เอกสารนี้)
├── server.js              # Express Local Development Server
└── wrangler.jsonc         # การตั้งค่า Cloudflare Workers & D1
```

---

## สถาปัตยกรรมทางเทคนิค (Technical Architecture)

```
                    ┌──────────────────────────────────────────────┐
                    │               LINE OA / LIFF                 │
                    │   (Mobile Client & Desktop Web Application)   │
                    └──────────────────────┬───────────────────────┘
                                           │
                        ┌──────────────────┴──────────────────┐
                        │      Cloudflare Edge CDN & CSP      │
                        │   (Self-hosted IBM Plex Sans Thai)  │
                        └──────────────────┬──────────────────┘
                                           │
                    ┌───────────────────────┴───────────────────────┐
                    │                                               │
       [ Edge Serverless Runtime ]                     [ Local Development Runtime ]
        Cloudflare Workers (workerd)                         Express Server (Node.js)
                    │                                               │
     ┌──────────────┴──────────────┐                 ┌──────────────┴──────────────┐
     │  Cloudflare D1 (SQLite DB)  │                 │    SQLite3 Local Database   │
     │   Cloudflare R2 (Storage)   │                 │     Local Private Disk      │
     └─────────────────────────────┘                 └─────────────────────────────┘
```

1. **Dual-Runtime Parity:** ระบบทำงานเข้ากันได้ทั้งบน Local Express (สำหรับการพัฒนาและทดสอบ) และ Cloudflare Workers + D1 (สำหรับการใช้งานจริงแบบ Serverless ไร้เซิร์ฟเวอร์ ประหยัดค่าใช้จ่าย)
2. **Security & Zero-Trust Invariants:**
   * มาตรฐาน **Content Security Policy (CSP) Level 2 Strict**: ห้ามใช้ `eval`, ห้ามใช้ `inline script` และห้ามใช้ `inline style`
   * ไม่เปิดเผย Secret หรือ Channel Access Token ในโค้ดส่วนหน้า (`public/`)
   * รหัสประจำตัวเข้ารหัสด้วย **HMAC-SHA256** พร้อม Key Versioning
   * รูปภาพหลักฐานถูกตรวจสอบความถูกต้องด้วย Magic Bytes และแสดงผลภายใต้ Sandbox Isolation
3. **No External CDN Dependencies:** ฟอนต์ `IBM Plex Sans Thai` และไอคอนทั้งหมดถูกโฮสต์ภายในระบบ ทำให้เปิดใช้งานได้อย่างรวดเร็วแม้ในพื้นที่สัญญาณต่ำ

---

## การติดตั้งและทดสอบระบบ (Getting Started & Testing)

### 1. ติดตั้ง Dependencies
```bash
npm install
```

### 2. รันชุดทดสอบอัตโนมัติ (Automated Tests)
```bash
# รันการทดสอบ Contract, Security, LINE Messaging และ Demo Logic (37/37 Passing)
node --test test/demo-mode.test.js test/frontend-security.test.js test/liff-deeplink-auth.test.js test/line-messaging.test.js test/shared-contract.test.js
```

### 3. รันระบบสำหรับการพัฒนาในเครื่อง (Local Express Server)
```bash
# รันการย้ายฐานข้อมูล SQLite
npm run migrate

# เริ่มต้นเซิร์ฟเวอร์ Express ที่พอร์ต 3000
npm run dev
```

### 4. รันระบบจำลอง Cloudflare Workers & D1 (Local Miniflare)
```bash
# รัน D1 migration บน local worker
npm run worker:db:migrate

# เริ่มต้น Workers development server
npm run worker:dev
```

---

## สารบัญเอกสารโครงการ (Documentation Index)

| เอกสาร | รายละเอียด | ลิงก์ |
| :--- | :--- | :--- |
| **สถาปัตยกรรมระบบ** | อธิบายโครงสร้าง Dual-Runtime, การเชื่อมต่อฐานข้อมูล D1, และแนวคิดความปลอดภัย | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| **กฎถาวรของโปรเจกต์** | กฎเกณฑ์ข้อกำหนดในการพัฒนา (Dual-Runtime, RBAC, Invariants, Non-fabrication) | [docs/RULE.md](docs/RULE.md) |
| **สถานะการพัฒนา** | สรุปผลการพัฒนา ความพร้อมของระบบ และงานที่สำเร็จ | [docs/DEVELOPMENT_STATUS.md](docs/DEVELOPMENT_STATUS.md) |
| **คู่มือการส่งมอบระบบ** | ข้อมูลการตั้งค่าระบบ ความปลอดภัย และข้อพิจารณาในการนำขึ้นใช้งานจริง | [docs/HANDOVER.md](docs/HANDOVER.md) |
| **Staging Checklist** | รายการตรวจสอบและขั้นตอนความปลอดภัยก่อน Deploy ขึ้น Staging จริง | [docs/STAGING_CHECKLIST.md](docs/STAGING_CHECKLIST.md) |
| **UI/UX Audit Report** | รายงานการออกแบบหน้าจอ การคำนวณ Contrast WCAG AAA และการรองรับผู้สูงอายุ | [docs/UI_REDESIGN_AUDIT.md](docs/UI_REDESIGN_AUDIT.md) |

---

<div align="center">
  <sub>มุ่งมั่นรักษามาตรฐานสินค้าเกษตรอินทรีย์ เพื่อวิสาหกิจชุมชนตำบลผักไหม จ.ศรีสะเกษ</sub><br>
  <sub>Spark Hack Season #2 • โจทย์: ปลูกของดี</sub>
</div>
