# 🌾 ปลูกของดี — PakMaii (Ready to Grow)
### ระบบบริหาร จัดการ และตรวจสอบมาตรฐานเกษตรอินทรีย์ วิสาหกิจชุมชนตำบลผักไหม จ.ศรีสะเกษ
> **การแข่งขัน:** Spark Hack Season #2 • **โจทย์:** ปลูกของดี  
> **กลุ่มเป้าหมาย:** วิสาหกิจชุมชนเกษตรอินทรีย์ตำบลผักไหม อ.ห้วยทับทัน จ.ศรีสะเกษ (มาตรฐาน PGS, EU Organic, และ Fairtrade)

[![Live Demo](https://img.shields.io/badge/Demo_Website-Online-059669?style=for-the-badge&logo=cloudflare&logoColor=white)](https://ready-to-grow-demo.readytogrow-app.workers.dev)
[![Platform](https://img.shields.io/badge/LINE_OA-LIFF_Ready-06C755?style=for-the-badge&logo=line&logoColor=white)](https://ready-to-grow-demo.readytogrow-app.workers.dev)
[![Standards](https://img.shields.io/badge/Standard-PGS_%7C_EU_%7C_Fairtrade-fbbf24?style=for-the-badge&logo=leaf&logoColor=white)](https://ready-to-grow-demo.readytogrow-app.workers.dev)
[![Test Suite](https://img.shields.io/badge/Tests-42%2F42_Passing-3b82f6?style=for-the-badge&logo=node.js&logoColor=white)](https://ready-to-grow-demo.readytogrow-app.workers.dev)
[![Security](https://img.shields.io/badge/Security-Strict_CSP_%26_RBAC-10b981?style=for-the-badge&logo=shield&logoColor=white)](docs/ARCHITECTURE.md)

---

## 🚀 ทดลองใช้งานระบบจริง (Interactive Live Demo)

👉 **เปิดใช้งานผ่านเว็บเบราว์เซอร์หรือมือถือ (LINE LIFF Ready):**  
### 🌐 [https://ready-to-grow-demo.readytogrow-app.workers.dev](https://ready-to-grow-demo.readytogrow-app.workers.dev)

* **Tutorial แนะนำการใช้งานครั้งแรก:** ตรวจจับ IP อัตโนมัติ แสดงหน้าต่างแนะนำโครงการ 4 ขั้นตอน พร้อมเลือกสลับบทบาทจำลองได้ทันที
* **สลับบทบาทอิสระ (Zero Friction):** สลับระหว่างมุมมอง **เกษตรกร (Farmer)** และ **เจ้าหน้าที่ตรวจประเมินภายใน (ICS Officer)** ได้ทันทีโดยข้อมูลเชื่อมโยงถึงกันแบบ Real-time
* **รองรับอุปกรณ์ทุกขนาด:** ใช้งานได้สมบูรณ์ทั้งบนมือถือผ่าน LINE OA และคอมพิวเตอร์ตั้งโต๊ะ

---

## 🎯 บริบทพื้นที่และโจทย์ปัญหาจริง (Local Context & Core Challenge)

**วิสาหกิจชุมชนเกษตรอินทรีย์ตำบลผักไหม อ.ห้วยทับทัน จ.ศรีสะเกษ** มีสมาชิกเกษตรกร 65 ราย พื้นที่แปลงปลูกรวม 120 แปลง (380 ไร่) ดำเนินการผลิตตามมาตรฐานเกษตรอินทรีย์แบบมีส่วนร่วม (PGS) มาตรฐานยุโรป (EU Organic) และการค้าที่เป็นธรรม (Fairtrade)

* **พืชเศรษฐกิจและแนวทางปฏิบัติจริงในพื้นที่:**
  - ข้าวหอมมะลิ 105 อินทรีย์ (พืชหลัก)
  - ถั่วเหลืองอินทรีย์หลังนา (สร้างรายได้เสริมและบำรุงดิน)
  - ปอเทืองไถกลบตอซัง ปลอดการเผาฟาง 100%
  - การเพาะเลี้ยงแหนแดง และระบบธนาคารน้ำใต้ดินแก้ปัญหาภัยแล้ง

### ปัญหาสำคัญ (Core Problem):
> "กระบวนการตรวจประเมินและบันทึกข้อมูลแบบดั้งเดิมใช้เอกสารกระดาษซ้ำซ้อน เกษตรกรส่วนใหญ่เป็นผู้สูงอายุทำให้บันทึกข้อมูลไม่ต่อเนื่อง และหากสมาชิกแม้เพียงรายเดียวทำผิดข้อกำหนดหรือใช้ปัจจัยการผลิตที่ไม่ได้มาตรฐาน จะส่งผลกระทบให้กลุ่มวิสาหกิจชุมชนถูกเพิกถอนใบรับรองมาตรฐานทั้งกลุ่ม (Group Certification Fall-out)"

**ระบบ Ready to Grow จึงถูกออกแบบมาเพื่อเป็นเครื่องมือดิจิทัลที่ "บันทึกง่าย คัดกรองไว รักษามาตรฐานกลุ่มได้ 100%"**

---

## 👑 ผังบทบาทหน้าที่และสิทธิ์การใช้งาน (Role Matrix & Responsibilities)

ระบบแบ่งแยกสิทธิ์ตามบทบาท (Role-Based Access Control: RBAC) อย่างเข้มงวด ทั้งในระดับฐานข้อมูลและส่วนติดต่อผู้ใช้:

| บทบาท (Role) | สิทธิ์และการมองเห็นข้อมูล (Data Visibility) | หน้าที่ความรับผิดชอบหลัก (Core Responsibilities) | แท็บการทำงาน (Navigation) | ฟังก์ชันช่วยเหลือพิเศษ |
| :--- | :--- | :--- | :--- | :--- |
| **เกษตรกร<br>(Farmer)** | • เข้าถึงได้เฉพาะแปลง กิจกรรม คำขอ และผลตรวจของ**ตนเองเท่านั้น**<br>• ไม่มีสิทธิ์ดูข้อมูลแปลงของเกษตรกรท่านอื่น หรือเข้าถึงแดชบอร์ดตรวจสอบของ ICS | 1. **จัดการแปลงตนเอง:** ดูสถานะแปลง ข้อมูลพืช และแถบจังหวะบันทึก 14 วัน<br>2. **บันทึกกิจกรรมแปลง 3 ขั้นตอน:** บันทึกงานประจำวัน เลือกปุ่มลัดรอบปลูก สั่งงานด้วยเสียง และแนบรูปถ่ายแปลงจริง<br>3. **ขออนุมัติปัจจัยการผลิตล่วงหน้า:** ยื่นสูตรปุ๋ย/สารชีวภาพ ตรวจสอบเหตุผลกรณีไม่ผ่าน และกดส่งสูตรใหม่เข้าพิจารณาซ้ำ<br>4. **ดูผลตรวจแปลง (Reviews):** ติดตามผลการตรวจประเมินแปลงและคำแนะนำปรับปรุงจากเจ้าหน้าที่ ICS<br>5. **ล็อตผลผลิต (Lot Story):** บันทึกเรื่องราวผลผลิตเพื่อการตรวจสอบย้อนกลับ (Traceability) | • หน้าแรก (ภาพรวม)<br>• แปลงของฉัน<br>• บันทึกแปลง (3 ขั้นตอน)<br>• ขออนุมัติปัจจัย<br>• ผลตรวจแปลง<br>• ล็อตผลผลิต | • **ปุ่ม "ก+ ตัวอักษรใหญ่":** ขยายฟอนต์และปุ่มกดเพื่อผู้สูงอายุ<br>• **Voice-to-Text:** สั่งงานด้วยเสียงภาษาไทย<br>• **ปุ่มลัดรอบเกษตรอินทรีย์:** กดบันทึกได้ใน 1 วินาที |
| **เจ้าหน้าที่ตรวจประเมินภายใน<br>(ICS Officer)** | • มองเห็นข้อมูลเกษตรกรและแปลงที่**ได้รับมอบหมายในความดูแล** (หรือทุกแปลงในโหมดกลุ่ม)<br>• ไม่สามารถแก้ไขข้อมูลส่วนบุคคลหรือบริหารจัดการระบบหลังบ้านได้ | 1. **วิเคราะห์ภาพรวมกลุ่ม (ICS Analytics):** แผนภาพวงกลม (Donut Charts) แสดงสัดส่วนแปลงปกติ/รออนุมัติ/จุดเสี่ยง และชนิดพืชอินทรีย์ ต.ผักไหม<br>2. **ติดตามเกษตรกรในความดูแล:** ตรวจสอบสมาชิก จำนวนแปลง จำนวนบันทึก และคำขอที่ค้างพิจารณา<br>3. **ระบบผู้ช่วยคัดกรองความเสี่ยง (Risk Assistant):** ตรวจจับ 5 สัญญาณเตือนอัตโนมัติ (ขาดบันทึก >14 วัน, ขาดรูปหลักฐาน, คำขอค้างตรวจ, CAPA เกินกำหนด)<br>4. **พิจารณาอนุมัติปัจจัยการผลิต:** อนุมัติ หรือ ไม่อนุมัติพร้อมระบุเหตุผลและคำแนะนำในการปรับสูตรปุ๋ย<br>5. **ตรวจประเมินแปลงตามมาตรฐาน:** ตรวจตาม Checklist (PGS, EU, Fairtrade) บันทึกข้อบกพร่อง ออกใบสั่งงานแก้ไข (CAPA) และดู Audit Log | • ภาพรวม (Analytics)<br>• เกษตรกรในดูแล<br>• แปลงเกษตรกร<br>• กิจกรรมสมาชิก<br>• พิจารณาคำขอ<br>• ความเสี่ยง (Risks)<br>• ผลตรวจแปลง (Audit)<br>• ล็อตผลผลิต | • **Donut Charts & Progress Bars:** กราฟสรุปความพร้อมกลุ่ม<br>• **Automated Risk Engine:** แจ้งเตือนความเสี่ยงเชิงรุก<br>• **Export CSV:** ส่งออกข้อมูลแปลงของกลุ่ม |
| **ผู้ดูแลระบบ<br>(System Admin)** | • สิทธิ์ระดับสูงสุดในการจัดการระบบ ผู้ใช้งาน และการมอบหมายงาน<br>• ไม่สามารถปลอมแปลงผลการตรวจประเมินแปลงของเจ้าหน้าที่ได้ | 1. **ภาพรวมระบบ (Overview):** ตรวจสอบสถานะการทำงาน สถิติรวม และความพร้อมของระบบ<br>2. **บริหารจัดการคำเชิญ (Invites):** ออกรหัสคำเชิญ 24 ชม. สำหรับผูกบัญชี LINE และเพิกถอนคำเชิญเพื่อความปลอดภัย<br>3. **จัดการบัญชีผู้ใช้งาน (Users):** เพิ่ม แก้ไข ระงับ หรือเปิดใช้งานบัญชีเกษตรกรและเจ้าหน้าที่<br>4. **มอบหมายงาน (Assignments):** จับคู่เกษตรกรให้อยู่ในความดูแลของเจ้าหน้าที่ ICS แต่ละคน<br>5. **ยืนยันเกณฑ์การตรวจ (Checklists Validation):** ควบคุมและยืนยันความถูกต้องของชุดคำถามมาตรฐานเกษตรอินทรีย์ | • ภาพรวมระบบ<br>• คำเชิญลงทะเบียน<br>• จัดการผู้ใช้งาน<br>• มอบหมายเกษตรกร<br>• เกณฑ์การตรวจ | • **Strict Admin Recovery CLI:** เครื่องมือผูก LINE ผู้ดูแลระบบคนแรกผ่าน CLI ปลอดภัยสูง<br>• **Audit Log Table:** ตรวจสอบประวัติการเปลี่ยนแปลงระบบ |

---

## 👥 บัญชีทดลองใช้งานในระบบ (Demo Personas)

ในโหมดสาธิต (Interactive Demo) สามารถแตะเลือก Persona เพื่อทดสอบการทำงานตามสถานการณ์จริงได้ทันที:

| Persona | รหัสประจำตัว | บทบาท | สถานะและสถานการณ์จำลองที่น่าสนใจ |
| :--- | :--- | :--- | :--- |
| **คุณสมปอง คำภา** | `F-STG-001` | **เกษตรกร (Farmer)** | • เจ้าของแปลง **A-03** (ข้าวหอมมะลิ 105 อินทรีย์ & ธนาคารน้ำใต้ดิน)<br>• **จุดทดสอบ:** มีสถานะแจ้งเตือน *"ขาดการบันทึกกิจกรรมเกิน 14 วัน"* สามารถทดลองกดบันทึกกิจกรรม 3 ขั้นตอน สั่งงานด้วยเสียง และอัปโหลดภาพถ่ายแปลงจริง |
| **คุณบัวผัน ศรีห้วยทับทัน** | `F-STG-002` | **เกษตรกร (Farmer)** | • เจ้าของแปลง **B-01** (ถั่วเหลืองอินทรีย์หลังนา Fairtrade & ปุ๋ยหมักชีวภาพ)<br>• **จุดทดสอบ:** มีสถานะ *"คำขอใช้ปุ๋ยหมักไม่ผ่านการอนุมัติ"* สามารถทดลองกดกล่อง *"ส่งปุ๋ยสูตรใหม่"* หรือกดปุ่ม *"ติดต่อเจ้าหน้าที่"* |
| **คุณวิชัย ผักไหม** | `ICS-STG-001` | **เจ้าหน้าที่ ICS (Officer)** | • หัวหน้าชุดตรวจประเมินภายในตำบลผักไหม ดูแลเกษตรกร 5 ราย<br>• **จุดทดสอบ:** ดูแผนภาพวงกลม (Donut Charts) ความพร้อมกลุ่ม, ตรวจสอบตารางความเสี่ยง, พิจารณาอนุมัติคำขอปุ๋ย, และบันทึกผลตรวจแปลงตาม Checklist PGS/EU/Fairtrade |
| **ผู้ดูแลระบบ** | `ADMIN` | **System Admin** | • เข้าสู่ระบบผ่านหน้าล็อกอินผู้ดูแลระบบ (Admin Form)<br>• **จุดทดสอบ:** สร้างคำเชิญ 24 ชม. สำหรับผูก LINE, มอบหมายแปลง และยืนยันเกณฑ์ชุดตรวจ |

---

## 🌟 ฟังก์ชันเด่นที่ออกแบบตรงตามบริบทจริง (Key Features)

### 1. การออกแบบเพื่อเกษตรกรและผู้สูงอายุ (Elderly-Friendly UX)
* **ปุ่มสลับ "ก+ ตัวอักษรใหญ่":** ขยายขนาดตัวหนังสือ การ์ด และปุ่มกดให้ใหญ่พิเศษ อ่านง่ายสบายตาแม้อยู่กลางแดด
* **สมุดบันทึกแปลง 3 ขั้นตอน (3-Step Activity Wizard):** ขั้นที่ 1 เลือกแปลงและงาน ➔ ขั้นที่ 2 กรอกรายละเอียดและปัจจัยการผลิต ➔ ขั้นที่ 3 แนบรูปถ่ายยืนยัน
* **สั่งงานด้วยเสียงภาษาไทย (Voice-to-Text):** แตะไมโครโฟนแล้วพูดภาษาไทย ระบบจะพิมพ์รายละเอียดกิจกรรมลงในช่องให้อัตโนมัติ
* **ปุ่มลัดรอบเกษตรอินทรีย์ผักไหม:** บันทึกงานประจำรอบปลูกได้ในคลิกเดียว (เช่น *ไถกลบตอซัง, หว่านปอเทือง, ปล่อยแหนแดง, พ่นน้ำหมักชีวภาพ*)

### 2. ระบบผู้ช่วยตรวจประเมินภายใน ICS (ICS Audit Assistant)
* **แผนภาพวงกลม (Donut Charts) & Analytics:** สรุปสัดส่วนแปลงปกติ (เขียว), รออนุมัติปัจจัย (ส้ม), และจุดเฝ้าระวังเร่งด่วน (แดง) พร้อมกราฟแสดงสัดส่วนพืชอินทรีย์
* **ระบบตรวจจับความเสี่ยง 5 มิติ (Multi-Signal Risk Detection):**
  1. `inactive`: ขาดการบันทึกกิจกรรมเกิน 14 วัน
  2. `missing_evidence`: มีกิจกรรมบันทึกแต่ขาดภาพถ่ายหลักฐาน
  3. `pending`: มีคำขอใช้ปัจจัยการผลิตค้างการพิจารณา
  4. `overdue_action`: มีใบสั่งงานแก้ไข (CAPA) ที่เลยกำหนดนัดหมาย
  5. `open_action`: มีข้อบกพร่องที่อยู่ระหว่างการปรับปรุง
* **แยกชุดตรวจมาตรฐาน 3 รูปแบบชัดเจน:** สลับชุดตรวจระหว่าง `PGS (เกษตรอินทรีย์มีส่วนร่วม)`, `EU Organic (มาตรฐานยุโรป)`, และ `Fairtrade (การค้าที่เป็นธรรม)` พร้อมตาราง Audit Log ทุกการตัดสินใจ

### 3. ระบบจัดเก็บภาพถ่ายหลักฐานจริง (Photo Evidence Storage)
* รองรับทั้งการเปิดกล้องถ่ายภาพแปลงสด (`capture="environment"`) และเลือกภาพจากคลังรูปภาพ
* บีบอัดและย่อขนาดภาพฝั่งเบราว์เซอร์อัตโนมัติ เพื่อประหยัดแบนด์วิดท์กลางแปลงนา
* ตรวจสอบความถูกต้องของไฟล์ด้วย Magic Bytes (JPEG/PNG/WebP สูงสุด 5MB)
* เสิร์ฟภาพด้วยความปลอดภัยขั้นสูง (`Content-Security-Policy: default-src 'none'; sandbox` ป้องกัน XSS)

---

## 📁 โครงสร้างโฟลเดอร์โครงการ (Repository Structure)

```text
pakmaii-app/
├── .agent/skills/         # Antigravity AI Skills (Frontend Design, UI/UX, Banner, Slides)
├── .github/               # GitHub Templates (Pull Request Template, Standards)
├── d1/migrations/         # Cloudflare D1 SQL Migrations (0001 - 0008)
├── db/migrations/         # SQLite Migrations สำหรับ Express (001 - 004)
├── docs/                  # เอกสารทางเทคนิค สถาปัตยกรรม และคู่มือระบบ
│   ├── ARCHITECTURE.md    # รายละเอียดสถาปัตยกรรมระบบ Dual-Runtime และ Security
│   ├── DEVELOPMENT_STATUS.md # สรุปสถานะการพัฒนาและการส่งมอบงาน
│   ├── HANDOVER.md        # คู่มือการส่งมอบโค้ดและความปลอดภัย
│   ├── RULE.md            # กฎถาวรของโปรเจกต์ (Dual-Runtime, RBAC, CSP)
│   ├── STAGING_CHECKLIST.md # รายการตรวจสอบก่อนขึ้น Private Staging
│   └── UI_REDESIGN_AUDIT.md # รายงานการออกแบบ UI/UX ตามหลักสากล
├── lib/                   # โมดูลช่วยเหลือของ Express (Evidence storage, Password, HMAC)
├── public/                # ส่วนติดต่อผู้ใช้ (Frontend UI - Vanilla ES Modules & CSS)
│   ├── js/core/           # โมดูลแกนหลัก (State, DOM, Icons, Photo, Rhythm, API, Auth)
│   ├── js/views/          # โมดูลมุมมอง (Farmer, ICS, Admin, Passport, Tutorial)
│   ├── fonts/             # ฟอนต์อัตลักษณ์ IBM Plex Sans Thai (Self-hosted 100%)
│   ├── app.js             # Entry Point ควบคุม State และ Routing
│   ├── app.css            # สไตล์ชีตหลัก จัดกลุ่ม 18 หมวดหมู่
│   ├── demo.js            # Standalone Client-Side Demo Backend & Store
│   └── _headers           # Cloudflare Pages / Worker Security Headers & Strict CSP
├── scripts/               # เครื่องมืออำนวยความสะดวก (Staging, Migrations, Test Server)
├── shared/                # โค้ดที่ใช้ร่วมกันระหว่าง Express และ Cloudflare Workers
│   ├── audit-domain.js    # การคำนวณและจัดหมวดหมู่ความเสี่ยง 5 มิติ
│   └── validation.js      # ตัวตรวจสอบความถูกต้องของข้อมูล (HttpError, Types, Bounds)
├── test/                  # ชุดทดสอบอัตโนมัติ (Automated Test Suites)
│   ├── e2e/               # Playwright End-to-End Tests (Desktop & Mobile-LIFF)
│   └── *.test.js          # Node.js Built-in Contract, Security, & Worker Tests
├── worker/                # Cloudflare Workers Edge API (Serverless Runtime)
│   ├── repository/d1.js   # ชั้นเชื่อมต่อฐานข้อมูล Cloudflare D1
│   ├── auth.js            # การยืนยันตัวตน LINE ID Token และ Session Management
│   ├── demo-worker.js     # Public Demo Worker สำหรับโฮสต์แอปพลิเคชันตัวอย่าง
│   ├── index.js           # Cloudflare Worker API Gateway
│   └── storage.js         # Cloudflare R2 Storage Abstraction
├── package.json           # ข้อมูลโปรเจกต์และ Scripts
├── playwright.config.js   # การตั้งค่า Playwright Test Runner
├── README.md              # หน้าแรกของคลังโค้ด (เอกสารนี้)
├── server.js              # Express Local Development Server
├── staging-identities.example.json # ตัวอย่างบัญชีทดสอบ Staging
├── wrangler.demo.jsonc    # การตั้งค่า Public Demo Cloudflare Worker
└── wrangler.jsonc         # การตั้งค่า Cloudflare Workers & D1
```

---

## 🛠️ สถาปัตยกรรมทางเทคนิค (Technical Architecture)

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

1. **Dual-Runtime Parity:** ออกแบบให้ระบบทำงานเข้ากันได้ 100% ทั้งบน Local Express (สำหรับการพัฒนาและทดสอบ) และ Cloudflare Workers + D1 (สำหรับการใช้งานจริงแบบ Serverless ไร้เซิร์ฟเวอร์ ประหยัดค่าใช้จ่าย)
2. **Security & Zero-Trust:**
   - มาตรฐาน **Content Security Policy (CSP) Level 2 Strict**: ห้ามใช้ `eval`, ห้ามใช้ `inline script` และห้ามใช้ `inline style`
   - รหัสประจำตัว (Agency Codes) เข้ารหัสด้วย **HMAC-SHA256** พร้อม Key Versioning
   - รหัสผ่านและโทเค็นเซสชันเก็บเฉพาะค่า **SHA-256 Digest**
   - รูปภาพหลักฐานถูกตรวจสอบความถูกต้องด้วย Magic Bytes และแสดงผลภายใต้ Sandbox Isolation
3. **No External CDN Dependencies:** ฟอนต์ `IBM Plex Sans Thai` และไอคอนทั้งหมดถูกโฮสต์ภายในโปรเจกต์ 100% ทำให้ระบบทำงานได้อย่างรวดเร็วและปลอดภัยแม้อยู่ในพื้นที่สัญญาณต่ำ

---

## 💻 การติดตั้งและทดสอบระบบ (Getting Started & Testing)

### 1. ติดตั้ง Dependencies
```bash
# ติดตั้งแพ็กเกจที่จำเป็น
npm install
```

### 2. รันชุดทดสอบอัตโนมัติ (Automated Tests)
โปรเจกต์นี้มีชุดทดสอบครอบคลุมทั้ง Unit Tests, Security Tests, Miniflare D1 Tests และ Playwright E2E Tests:

```bash
# รันการทดสอบ Contract, Security, และ Domain Logic (34/34 Passing)
node --test test/shared-contract.test.js test/frontend-security.test.js test/demo-mode.test.js test/public-demo-worker.test.js

# รันการทดสอบ Playwright E2E บน Desktop และ Mobile-LIFF (8/8 Passing)
npx playwright test
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

## 📚 สารบัญเอกสารโครงการ (Documentation Index)

| เอกสาร | รายละเอียด | ลิงก์ |
| :--- | :--- | :--- |
| **สถาปัตยกรรมระบบ** | อธิบายโครงสร้าง Dual-Runtime, การเชื่อมต่อฐานข้อมูล D1, และแนวคิดความปลอดภัย | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| **กฎถาวรของโปรเจกต์** | กฎเกณฑ์ 11 ข้อที่ต้องปฏิบัติตามในการพัฒนา (Dual-Runtime, RBAC, Non-fabrication) | [docs/RULE.md](docs/RULE.md) |
| **สถานะการพัฒนา** | สรุปผลการพัฒนา Phase 1–3, ความพร้อมของระบบ, และงานที่สำเร็จ | [docs/DEVELOPMENT_STATUS.md](docs/DEVELOPMENT_STATUS.md) |
| **คู่มือการส่งมอบระบบ** | ข้อมูลการตั้งค่าระบบ, ความปลอดภัย, และข้อพิจารณาในการนำขึ้นใช้งานจริง | [docs/HANDOVER.md](docs/HANDOVER.md) |
| **Staging Checklist** | รายการตรวจสอบและขั้นตอนความปลอดภัยก่อน Deploy ขึ้น Staging จริง | [docs/STAGING_CHECKLIST.md](docs/STAGING_CHECKLIST.md) |
| **UI/UX Audit Report** | รายงานการออกแบบหน้าจอ การคำนวณ Contrast WCAG AAA และการรองรับผู้สูงอายุ | [docs/UI_REDESIGN_AUDIT.md](docs/UI_REDESIGN_AUDIT.md) |
| **ประวัติการปรับปรุง** | บันทึกประวัติการพัฒนาและ Pull Request ทั้งหมดของโครงการ | [docs/CHANGELOG.md](docs/CHANGELOG.md) |

---

<div align="center">
  <sub>มุ่งมั่นรักษามาตรฐานสินค้าเกษตรอินทรีย์ เพื่อวิสาหกิจชุมชนตำบลผักไหม จ.ศรีสะเกษ 🌾</sub><br>
  <sub>Spark Hack Season #2 • โจทย์: ปลูกของดี</sub>
</div>
