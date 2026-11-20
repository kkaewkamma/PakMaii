'use strict';
/*
 * Ready to Grow — Demo-first data store (client-side only).
 *
 * Security invariants:
 * - Never performs network requests and never creates or reads server sessions.
 * - Demo codes cannot reach Admin APIs: every /admin path is rejected here and the
 *   backend has no knowledge of demo codes (Bearer auth requires a server-issued token).
 * - Holds synthetic data only, isolated from D1/SQLite under its own storage key.
 *
 * Accounts and Farmer→ICS assignments mirror staging-identities.example.json
 * (verified by test/demo-mode.test.js).
 */
(function (root) {
  const STORAGE_KEY = 'rtg-demo-store-v1';
  const SESSION_KEY = 'rtg-demo-account';
  const STORE_VERSION = 3;
  const ADMIN_CODES = new Set(['ADMIN-STG-001']);
  const ROLE_LABELS = { farmer: 'Farmer', ics: 'ICS' };

  const pad = (value, size) => String(value).padStart(size, '0');
  const ACCOUNTS = Object.freeze([
    ...Array.from({ length: 5 }, (_, i) => Object.freeze({ id: 910101 + i, agencyCode: `ICS-STG-${pad(i + 1, 3)}`, name: `Demo ICS Officer ${pad(i + 1, 2)}`, role: 'ics' })),
    ...Array.from({ length: 25 }, (_, i) => Object.freeze({ id: 911001 + i, agencyCode: `F-STG-${pad(i + 1, 3)}`, name: `Demo Farmer ${pad(i + 1, 2)}`, role: 'farmer', assignedTo: `ICS-STG-${pad(Math.floor(i / 5) + 1, 3)}` })),
  ]);
  const byCode = new Map(ACCOUNTS.map(account => [account.agencyCode, account]));
  const byId = new Map(ACCOUNTS.map(account => [account.id, account]));

  class DemoError extends Error {
    constructor(status, message, code) {
      super(message);
      this.name = 'DemoError';
      this.status = status;
      if (code) this.code = code;
    }
  }

  const normalizeCode = value => String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
  const clone = value => JSON.parse(JSON.stringify(value));

  function memoryStorage() {
    const map = new Map();
    return {
      getItem: key => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => { map.set(key, String(value)); },
      removeItem: key => { map.delete(key); },
    };
  }

  function safeStorage(candidate) {
    try {
      if (!candidate) return memoryStorage();
      const probe = '__rtg_demo_probe__';
      candidate.setItem(probe, '1');
      candidate.removeItem(probe);
      return candidate;
    } catch {
      return memoryStorage();
    }
  }

  const PAKMAII_PROFILES = Object.freeze({
    'ICS-STG-001': { thaiName: 'คุณวิชัย ผักไหม', village: 'หัวหน้าชุดผู้ตรวจประเมินภายใน (ICS) • ต.ผักไหม อ.ห้วยทับทัน จ.ศรีสะเกษ' },
    'ICS-STG-002': { thaiName: 'คุณสายฝน ศรีห้วยทับทัน', village: 'ผู้ตรวจประเมิน ICS โซนเหนือ • ต.ผักไหม อ.ห้วยทับทัน จ.ศรีสะเกษ' },
    'ICS-STG-003': { thaiName: 'คุณประเสริฐ ทุ่งกุลา', village: 'ผู้ตรวจประเมิน ICS โซนใต้ • ต.ผักไหม อ.ห้วยทับทัน จ.ศรีสะเกษ' },
    'F-STG-001': { thaiName: 'คุณสมปอง คำภา', village: 'หมู่ 3 บ้านผักไหม ต.ผักไหม อ.ห้วยทับทัน จ.ศรีสะเกษ (พื้นที่ 12 ไร่)' },
    'F-STG-002': { thaiName: 'คุณบัวผัน ศรีห้วยทับทัน', village: 'หมู่ 5 บ้านหนองสิม ต.ผักไหม อ.ห้วยทับทัน จ.ศรีสะเกษ (พื้นที่ 8 ไร่)' },
    'F-STG-003': { thaiName: 'คุณทองมี แก้วกัลยา', village: 'หมู่ 2 บ้านคลองตากแบก ต.ผักไหม อ.ห้วยทับทัน จ.ศรีสะเกษ (พื้นที่ 10 ไร่)' },
    'F-STG-004': { thaiName: 'คุณคำพูน พรมมา', village: 'หมู่ 7 บ้านกระสัง ต.ผักไหม อ.ห้วยทับทัน จ.ศรีสะเกษ (พื้นที่ 15 ไร่)' },
    'F-STG-005': { thaiName: 'คุณจันทร์เพ็ญ ทองดี', village: 'หมู่ 1 บ้านผักไหม ต.ผักไหม อ.ห้วยทับทัน จ.ศรีสะเกษ (พื้นที่ 9 ไร่)' }
  });

  function publicUser(account) {
    const profile = PAKMAII_PROFILES[account.agencyCode];
    return {
      id: account.id,
      name: account.name,
      thai_name: profile ? profile.thaiName : null,
      village: profile ? profile.village : 'วิสาหกิจชุมชนเกษตรอินทรีย์ตำบลผักไหม อ.ห้วยทับทัน จ.ศรีสะเกษ',
      role: account.role,
      status: 'active',
      agency_code: account.agencyCode,
      demo: true
    };
  }

  function assignedFarmerIds(icsCode) {
    return ACCOUNTS.filter(account => account.role === 'farmer' && account.assignedTo === icsCode).map(account => account.id);
  }

  function findAccount(role, rawCode) {
    if (!['farmer', 'ics'].includes(role)) throw new DemoError(400, 'กรุณาเลือกบทบาท Farmer หรือ ICS');
    const code = normalizeCode(rawCode);
    if (!code) throw new DemoError(400, 'กรุณากรอกรหัสประจำตัว Demo');
    if (ADMIN_CODES.has(code) || code.startsWith('ADMIN')) throw new DemoError(403, 'บัญชี Admin ต้องเข้าสู่ระบบผ่านปุ่ม Admin Login', 'ADMIN_DEMO_FORBIDDEN');
    const account = byCode.get(code);
    if (!account) throw new DemoError(401, 'ไม่พบรหัส Demo นี้ กรุณาตรวจสอบอีกครั้ง', 'DEMO_CODE_UNKNOWN');
    if (account.role !== role) throw new DemoError(403, `รหัสนี้ไม่ตรงกับบทบาทที่เลือก (เป็นบัญชี ${ROLE_LABELS[account.role]})`, 'DEMO_ROLE_MISMATCH');
    return account;
  }

  function isoDay(date) { return date.toISOString().slice(0, 10); }

  function seed(now) {
    const crops = ['ข้าวหอมมะลิ 105', 'ถั่วเหลืองอินทรีย์แฟร์เทรด', 'ปอเทือง (Sunn Hemp)', 'ข้าวหอมมะลิอินทรีย์', 'ถั่วเหลืองสลับข้าว'];
    const cropTypes = ['Jasmine Rice', 'Fairtrade Organic Soybean', 'Sunn Hemp', 'Jasmine Rice', 'Fairtrade Organic Soybean'];
    const plotCodes = ['A-03', 'B-01', 'C-12', 'D-05', 'A-04'];
    const conversionYears = ['ระยะปรับเปลี่ยนปีที่ 1', 'ระยะปรับเปลี่ยนปีที่ 2', 'ระยะปรับเปลี่ยนปีที่ 1', 'ผ่านการรับรอง PGS', 'ระยะปรับเปลี่ยนปีที่ 3'];
    const waterStatuses = ['Low - Groundwater Bank / Solar Pump needed', 'Normal', 'Low - Groundwater Bank / Solar Pump needed', 'Normal', 'Normal'];
    const stamp = now.toISOString();
    const daysAgo = days => isoDay(new Date(now.getTime() - days * 86_400_000));

    const DEFAULT_CHECKLISTS = [
      {
        id: 1,
        standard_code: 'PGS',
        title: 'รายการตรวจภายใน PGS (ร่างโครงสร้าง — รอการยืนยันเกณฑ์)',
        description: 'โครงสร้างรายการตรวจภายในกลุ่ม PGS สำหรับติดตามการปฏิบัติงานในแปลง ไม่ใช่การรับรองมาตรฐานอย่างเป็นทางการ',
        items: [
          { key: 'pgs_buffer_zone', label: 'ตรวจแนวกันชนรอบแปลงและป้องกันการปนเปื้อนจากแปลงข้างเคียง', required: true },
          { key: 'pgs_no_synthetic', label: 'ไม่พบการใช้สารเคมีสังเคราะห์หรือสารต้องห้ามในแปลง', required: true },
          { key: 'pgs_input_approved', label: 'ปัจจัยการผลิตที่ใช้ผ่านการอนุมัติล่วงหน้าจาก ICS แล้ว', required: true },
          { key: 'pgs_activity_log', label: 'เกษตรกรบันทึกกิจกรรมสม่ำเสมอและสอดคล้องกับสภาพแปลงจริง', required: false },
        ],
        validation_status: 'draft_unvalidated',
        is_active: true,
        created_by: null,
        created_at: stamp,
        updated_at: stamp,
      },
      {
        id: 2,
        standard_code: 'EU_ORGANIC',
        title: 'รายการตรวจภายใน EU Organic (ร่างโครงสร้าง — รอการยืนยันเกณฑ์)',
        description: 'โครงสร้างรายการตรวจภายในแยกตามหมวดหมู่ EU Organic อยู่ระหว่างรอการยืนยันเกณฑ์จากผู้ตรวจรับรองภายนอก',
        items: [
          { key: 'eu_conversion_period', label: 'ตรวจบันทึกประวัติระยะปรับเปลี่ยนและการแยกพื้นที่ปลูกตามรอบการผลิต', required: true },
          { key: 'eu_segregation', label: 'การแยกจัดเก็บผลผลิตและเครื่องมือไม่ปะปนกับผลผลิตเคมี', required: true },
          { key: 'eu_traceable_inputs', label: 'เอกสารที่มาและสัดส่วนปัจจัยการผลิตสามารถตรวจสอบย้อนกลับได้', required: true },
          { key: 'eu_evidence_records', label: 'มีภาพหลักฐานและบันทึกกิจกรรมรองรับรอบการตรวจ', required: false },
        ],
        validation_status: 'draft_unvalidated',
        is_active: true,
        created_by: null,
        created_at: stamp,
        updated_at: stamp,
      },
      {
        id: 3,
        standard_code: 'FAIRTRADE',
        title: 'รายการตรวจภายใน Fairtrade (ร่างโครงสร้าง — รอการยืนยันเกณฑ์)',
        description: 'โครงสร้างรายการตรวจภายในแยกตามหมวดหมู่ Fairtrade อยู่ระหว่างรอการยืนยันเกณฑ์จากผู้ตรวจรับรองภายนอก',
        items: [
          { key: 'ft_member_consent', label: 'บันทึกความโปร่งใสและการมีส่วนร่วมของสมาชิกในกลุ่ม', required: true },
          { key: 'ft_labor_safety', label: 'สภาพการทำงานและความปลอดภัยของแรงงานในแปลงเป็นไปตามข้อตกลงกลุ่ม', required: true },
          { key: 'ft_premium_record', label: 'บันทึกปริมาณผลผลิตและการส่งมอบเพื่อตรวจย้อนกลับระดับกลุ่ม', required: false },
        ],
        validation_status: 'draft_unvalidated',
        is_active: true,
        created_by: null,
        created_at: stamp,
        updated_at: stamp,
      },
    ];

    const store = {
      version: STORE_VERSION,
      seq: { plots: 0, activities: 0, approvals: 0, lots: 0, reviews: 0, checklists: 3, corrective_actions: 0, audit_logs: 0 },
      metrics: {
        totalMembers: 65,
        totalPlots: 120,
        pendingInputRequests: 8,
        riskAlerts: 12,
        groupReadiness: 86,
      },
      plots: [],
      activities: [],
      approvals: [],
      lots: [],
      reviews: [],
      checklists: clone(DEFAULT_CHECKLISTS),
      corrective_actions: [],
      audit_logs: []
    };

    ACCOUNTS.filter(account => account.role === 'farmer').forEach((farmer, index) => {
      const n = index + 1;
      const plotId = ++store.seq.plots;
      const plotCode = index < 5 ? plotCodes[index] : `P-${pad(n, 2)}`;
      const crop = crops[index % crops.length];
      const cropType = cropTypes[index % cropTypes.length];
      const conversionYear = conversionYears[index % conversionYears.length];
      const waterStatus = waterStatuses[index % waterStatuses.length];
      const plotNameStr = index < 5 ? `แปลง ${plotCode} (${crop})` : `แปลงอินทรีย์ ${pad(n, 2)}`;

      store.plots.push({
        id: plotId,
        owner_id: farmer.id,
        name: plotNameStr,
        plot_code: plotCode,
        crop: crop,
        crop_type: cropType,
        conversion_year: conversionYear,
        water_source_status: waterStatus,
        area: `${1 + (n % 4)} ไร่`,
        created_at: stamp
      });

      // Plot A-03 (index 0): Inactive 14 days (risk alert)
      if (index === 0) {
        store.activities.push({
          id: ++store.seq.activities,
          plot_id: plotId,
          user_id: farmer.id,
          kind: 'ให้น้ำ',
          details: 'สูบน้ำโซลาร์เซลล์ / ธนาคารน้ำใต้ดิน บำรุงต้นกล้าข้าวหอมมะลิ',
          activity_date: daysAgo(16),
          photo_url: null,
          created_at: stamp
        });
      } else if (index === 1) {
        // Plot B-01: Activity 3 days ago + Pending Input Request
        store.activities.push({
          id: ++store.seq.activities,
          plot_id: plotId,
          user_id: farmer.id,
          kind: 'ปลูกถั่วเหลืองหลังนา',
          details: 'หยอดเมล็ดถั่วเหลืองอินทรีย์แฟร์เทรด ความชื้นดินเหมาะสม',
          activity_date: daysAgo(3),
          photo_url: null,
          created_at: stamp
        });
        store.approvals.push({
          id: ++store.seq.approvals,
          plot_id: plotId,
          user_id: farmer.id,
          input_name: 'ปุ๋ยหมักอินทรีย์ (ทำเอง)',
          details: 'ใบสะเดา + พริก + กากน้ำตาล หมัก 7 วัน ป้องกันหนอนเจาะฝัก',
          formula_details: 'ใบสะเดา + พริก + กากน้ำตาล หมัก 7 วัน',
          expected_use_date: daysAgo(-3),
          status: 'pending',
          reviewer_id: null,
          reviewed_at: null,
          comment: null,
          created_at: stamp
        });
      } else if (index === 2) {
        // Plot C-12: Inconsistent log history
        store.activities.push({
          id: ++store.seq.activities,
          plot_id: plotId,
          user_id: farmer.id,
          kind: 'ไถกลบปอเทอง (90 วัน)',
          details: 'ไถกลบหลังเก็บเกี่ยว 2 วัน (ไม่สอดคล้องกับรอบพักดินและมาตรฐานอินทรีย์)',
          activity_date: daysAgo(2),
          photo_url: null,
          created_at: stamp
        });
      } else {
        // Other plots: Normal periodic activities
        if (n % 5 !== 0) {
          store.activities.push({
            id: ++store.seq.activities,
            plot_id: plotId,
            user_id: farmer.id,
            kind: index % 2 === 0 ? 'ปล่อยแหนแดง' : 'พ่นปุ๋ยหมักอินทรีย์',
            details: 'ดูแลแปลงเกษตรประณีตตำบลผักไหม ตามมาตรฐาน PGS',
            activity_date: daysAgo(2 + (n % 6)),
            photo_url: null,
            created_at: stamp
          });
        }
      }

      if (n % 5 === 1 && index !== 1) {
        store.approvals.push({
          id: ++store.seq.approvals,
          plot_id: plotId,
          user_id: farmer.id,
          input_name: 'ปุ๋ยหมักมูลไส้เดือน',
          details: 'ผลิตเองจากมูลไส้เดือน ใช้ 200 กรัมต่อต้น ทุก 15 วัน',
          formula_details: 'มูลไส้เดือน 100% หมักอินทรีย์',
          expected_use_date: daysAgo(-5),
          status: 'pending',
          reviewer_id: null,
          reviewed_at: null,
          comment: null,
          created_at: stamp
        });
      }
      if (index === 0) {
        store.approvals.push({
          id: ++store.seq.approvals,
          plot_id: plotId,
          user_id: farmer.id,
          input_name: 'แผนการใส่ปุ๋ยบำรุงต้น',
          details: 'สูตรปุ๋ยหมักผสมกากน้ำตาลเข้มข้น อัตรา 80 กก./ไร่',
          formula_details: 'ปุ๋ยหมักผสมกากน้ำตาลเข้มข้น',
          expected_use_date: daysAgo(1),
          status: 'rejected',
          reviewer_id: 910101,
          reviewed_at: daysAgo(1),
          comment: 'สูตรปุ๋ยไม่เหมาะสมกับระยะการเจริญเติบโตของข้าว\nอัตราการใช้สูงกว่าคำแนะนำมาตรฐาน',
          created_at: daysAgo(2)
        });
      }

      if (index === 0 || index === 1) {
        // Traceability lot L-12 linked to A-03 and A-04
        if (index === 0) {
          store.lots.push({
            id: ++store.seq.lots,
            plot_id: plotId,
            code: 'L-12',
            lot_code: 'L-12',
            crop: 'ข้าวหอมมะลิ 105 & ถั่วเหลืองอินทรีย์แฟร์เทรด',
            crop_type: 'Jasmine Rice & Fairtrade Soybean',
            harvest_date: daysAgo(10),
            quantity: 50,
            linked_plots: 'A-03, A-04',
            total_bags_or_kg: '5 ราย / 50 กก.',
            ics_review_status: 'approved',
            story_highlights: 'ใช้แหนแดงบำรุงดิน ปลอดสารเคมี 100% มาตรฐาน EU Fairtrade จากกลุ่มเกษตรกรตำบลผักไหม จ.ศรีสะเกษ ธนาคารน้ำใต้ดินแก้แล้ง',
            created_at: stamp
          });
        }
      } else if (n % 5 === 2) {
        store.lots.push({
          id: ++store.seq.lots,
          plot_id: plotId,
          code: `LOT-DEMO-${pad(n, 3)}`,
          lot_code: `LOT-DEMO-${pad(n, 3)}`,
          crop: crops[index % crops.length],
          crop_type: cropTypes[index % cropTypes.length],
          harvest_date: daysAgo(10),
          quantity: 120,
          linked_plots: plotCode,
          total_bags_or_kg: '120 กก.',
          ics_review_status: 'approved',
          story_highlights: 'แปลงอินทรีย์ตำบลผักไหม มาตรฐาน PGS',
          created_at: stamp
        });
      }

      if (n % 5 === 1) {
        store.reviews.push({
          id: ++store.seq.reviews,
          plot_id: plotId,
          reviewer_id: 910101 + Math.floor(index / 5),
          result: 'ผ่าน',
          note: 'ตรวจแปลงประจำรอบการผลิต สภาพแปลงสมบูรณ์ แนวกันชนปลอดภัย มีการจดบันทึกสม่ำเสมอ แหล่งน้ำปลอดภัย',
          standard_code: 'PGS',
          checklist_id: 1,
          checklist_results: [],
          created_at: daysAgo(5),
        });
      }
    });
    if (store.plots[2]) {
      store.corrective_actions.push({
        id: ++store.seq.corrective_actions,
        plot_id: store.plots[2].id,
        review_id: null,
        standard_code: 'PGS',
        severity: 'high',
        finding: 'บันทึกการไถกลบไม่สอดคล้องกับรอบพักดินตามข้อตกลงกลุ่ม',
        action_required: 'ลงตรวจแปลงซ้ำและวางแผนรอบพักดินใหม่ร่วมกับเกษตรกร',
        responsible_user_id: 910101,
        due_date: daysAgo(2),
        status: 'open',
        resolution_note: '',
        resolved_at: null,
        created_by: 910101,
        created_at: daysAgo(9),
        updated_at: daysAgo(9),
      });
      store.audit_logs.push({
        id: ++store.seq.audit_logs,
        actor_user_id: 910101,
        actor_name: byId.get(910101)?.name || 'ICS',
        event_type: 'corrective_action.created',
        target_type: 'corrective_action',
        target_id: '1',
        metadata: { plotId: store.plots[2].id, standardCode: 'PGS', severity: 'high' },
        created_at: daysAgo(9),
      });
    }
    return store;
  }

  const text = (value, field, max = 500) => {
    if (value === undefined || value === null || String(value).trim() === '') throw new DemoError(400, `กรุณากรอก ${field}`);
    const clean = String(value).trim();
    if (clean.length > max) throw new DemoError(400, `${field} ยาวเกินกำหนด`);
    return clean;
  };
  const optionalText = (value, field, max = 500) => (value === undefined || value === null || String(value).trim() === '' ? '' : text(value, field, max));
  const positiveId = (value, field = 'รหัส') => {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) throw new DemoError(400, `${field} ไม่ถูกต้อง`);
    return id;
  };
  const isoDate = (value, field) => {
    const date = text(value, field, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new DemoError(400, `${field} ไม่ถูกต้อง`);
    return date;
  };
  const photoUrl = value => {
    if (!value) return null;
    const raw = String(value).trim();
    if (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(raw)) return raw;
    let parsed;
    try { parsed = new URL(raw); } catch { throw new DemoError(400, 'ลิงก์รูปภาพไม่ถูกต้อง'); }
    if (parsed.protocol !== 'https:') throw new DemoError(400, 'ลิงก์รูปภาพต้องเป็น HTTPS');
    return parsed.toString();
  };

  function createDemoBackend(options = {}) {
    const storage = safeStorage(options.storage === undefined ? root.localStorage : options.storage);
    const now = options.now || (() => new Date());

    function load() {
      try {
        const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
        if (parsed && parsed.version === STORE_VERSION && Array.isArray(parsed.plots)) {
          if (!Array.isArray(parsed.checklists) || !Array.isArray(parsed.corrective_actions) || !Array.isArray(parsed.audit_logs)) {
            const baseline = seed(now());
            parsed.checklists ||= baseline.checklists;
            parsed.corrective_actions ||= baseline.corrective_actions;
            parsed.audit_logs ||= baseline.audit_logs;
            parsed.seq = {
              checklists: parsed.checklists.length,
              corrective_actions: parsed.corrective_actions.length,
              audit_logs: parsed.audit_logs.length,
              ...(parsed.seq || {}),
            };
          }
          return parsed;
        }
      } catch { /* corrupted demo data is re-seeded below */ }
      const fresh = seed(now());
      storage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    function save(store) { storage.setItem(STORAGE_KEY, JSON.stringify(store)); }

    function sessionAccount(user) {
      const account = user && byId.get(user.id);
      if (!account || account.role !== user.role) throw new DemoError(401, 'กรุณาเข้าสู่ระบบ Demo');
      return account;
    }
    function visibleOwners(account) {
      return new Set(account.role === 'farmer' ? [account.id] : assignedFarmerIds(account.agencyCode));
    }
    function ownPlot(store, account, rawId) {
      const id = positiveId(rawId, 'รหัสแปลง');
      const plot = store.plots.find(item => item.id === id);
      if (!plot) throw new DemoError(404, 'ไม่พบแปลง');
      if (!visibleOwners(account).has(plot.owner_id)) throw new DemoError(403, 'ไม่มีสิทธิ์เข้าถึงแปลง');
      return plot;
    }
    const requireRole = (account, role, message) => { if (account.role !== role) throw new DemoError(403, message); };
    const plotName = (store, plotId) => store.plots.find(plot => plot.id === plotId)?.name || '-';
    const ownerOf = (store, plotId) => store.plots.find(plot => plot.id === plotId)?.owner_id;
    const farmerName = id => byId.get(id)?.name || '-';
    const byIdDesc = (a, b) => b.id - a.id;

    function recordDemoAudit(store, actorId, eventType, targetType, targetId, metadata = {}) {
      store.audit_logs.unshift({
        id: ++store.seq.audit_logs,
        actor_user_id: actorId,
        actor_name: byId.get(actorId)?.name || 'เจ้าหน้าที่ ICS',
        event_type: eventType,
        target_type: targetType,
        target_id: String(targetId),
        metadata,
        created_at: now().toISOString(),
      });
    }

    function request(user, rawPath, rawMethod = 'GET', body = {}) {
      const account = sessionAccount(user);
      const [path, queryString = ''] = String(rawPath).split('?');
      const params = new URLSearchParams(queryString);
      const method = String(rawMethod).toUpperCase();
      if (path === '/admin' || path.startsWith('/admin/') || path.startsWith('/auth/')) throw new DemoError(403, 'โหมด Demo ไม่สามารถเข้าถึงเมนูผู้ดูแลระบบ', 'DEMO_ADMIN_FORBIDDEN');
      const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
      const store = load();
      const owners = visibleOwners(account);
      const ownsPlot = item => owners.has(ownerOf(store, item.plot_id));
      const plotMatch = path.match(/^\/plots\/([^/]+)$/);
      const approvalMatch = path.match(/^\/approvals\/([^/]+)$/);
      const checklistMatch = path.match(/^\/checklists\/([^/]+)$/);
      const capaMatch = path.match(/^\/corrective-actions\/([^/]+)$/);
      const todayIso = isoDay(now());

      if (method === 'GET' && path === '/me') return publicUser(account);
      if (method === 'POST' && path === '/logout') return { ok: true };

      if (method === 'GET' && path === '/metrics') {
        const since = isoDay(new Date(now().getTime() - 14 * 86_400_000));
        const pending1to4 = store.approvals.filter(a => a.status === 'pending' && a.plot_id >= 1 && a.plot_id <= 4).length;
        const plot1HasRecent = store.activities.some(a => a.plot_id === 1 && a.activity_date >= since);
        const plot3HasPass = store.reviews.some(r => r.plot_id === 3 && r.result === 'ผ่าน');
        const resolvedRisks = (plot1HasRecent ? 1 : 0) + (plot3HasPass ? 1 : 0) + (1 - Math.min(1, pending1to4));
        const pendingInputRequests = Math.max(0, 7 + pending1to4);
        const riskAlerts = Math.max(0, 12 - resolvedRisks);
        const groupReadiness = Math.min(99, 86 + resolvedRisks * 4);
        return {
          totalMembers: 65,
          totalPlots: 120,
          pendingInputRequests,
          riskAlerts,
          groupReadiness
        };
      }
      if (method === 'GET' && path === '/watchlist') {
        const since = isoDay(new Date(now().getTime() - 14 * 86_400_000));
        return [1, 2, 3, 4].map(pid => {
          const p = store.plots.find(x => x.id === pid);
          if (!p) return null;
          const f = byId.get(p.owner_id);
          const pActs = store.activities.filter(a => a.plot_id === pid);
          const pApps = store.approvals.filter(a => a.plot_id === pid);
          const pRevs = store.reviews.filter(r => r.plot_id === pid);
          const pendingApp = pApps.find(a => a.status === 'pending');
          const hasRecentAct = pActs.some(a => a.activity_date >= since);
          const hasPassRev = pRevs.some(r => r.result === 'ผ่าน');
          const hasInconsistent = pActs.some(a => String(a.details).includes('ไม่สอดคล้อง')) && !hasPassRev;

          let status = 'ปกติ (ผ่านเกณฑ์อินทรีย์)';
          let severity = 'normal';
          let action = 'ดูใบรับรอง';
          let targetTab = 'lots';

          if (!hasRecentAct) {
            status = 'ขาดการบันทึกกิจกรรม 14 วัน';
            severity = 'risk';
            action = 'ติดตามด่วน';
            targetTab = 'record';
          } else if (pendingApp) {
            status = 'มีคำขอปัจจัยการผลิตรออนุมัติ';
            severity = 'warning';
            action = 'พิจารณาคำขอ';
            targetTab = 'approval';
          } else if (hasInconsistent) {
            status = 'ประวัติไม่สอดคล้อง';
            severity = 'risk';
            action = 'นัดตรวจแปลง';
            targetTab = 'reviews';
          }

          return {
            plot_id: p.id,
            code: p.plot_code || `P-0${pid}`,
            farmer: f ? f.name : '-',
            farmer_code: f ? f.agencyCode : '-',
            crop: p.crop,
            conversion: p.conversion_year || 'Year 1',
            status,
            severity,
            action,
            targetTab,
            pendingApprovalId: pendingApp ? pendingApp.id : null,
            pendingInputName: pendingApp ? pendingApp.input_name : null
          };
        }).filter(Boolean);
      }
      if (method === 'GET' && path === '/plots') {
        return clone(store.plots.filter(plot => owners.has(plot.owner_id)).sort(byIdDesc)
          .map(plot => (account.role === 'ics' ? { ...plot, owner: farmerName(plot.owner_id) } : plot)));
      }
      if (method === 'GET' && path === '/activities') {
        return clone(store.activities.filter(ownsPlot)
          .sort((a, b) => (b.activity_date.localeCompare(a.activity_date) || b.id - a.id))
          .map(item => ({ ...item, plot_name: plotName(store, item.plot_id), farmer: farmerName(item.user_id) })));
      }
      if (method === 'GET' && path === '/approvals') {
        return clone(store.approvals.filter(ownsPlot).sort(byIdDesc)
          .map(item => ({ ...item, plot_name: plotName(store, item.plot_id), farmer: farmerName(item.user_id) })));
      }
      if (method === 'GET' && path === '/lots') {
        return clone(store.lots.filter(ownsPlot).sort(byIdDesc)
          .map(item => ({ ...item, plot_name: plotName(store, item.plot_id), farmer: farmerName(ownerOf(store, item.plot_id)) })));
      }
      if (method === 'GET' && path === '/risks') {
        requireRole(account, 'ics', 'เฉพาะเจ้าหน้าที่ ICS');
        const since14 = isoDay(new Date(now().getTime() - 14 * 86_400_000));
        const since30 = isoDay(new Date(now().getTime() - 30 * 86_400_000));
        const pending = store.approvals.filter(item => item.status === 'pending' && ownsPlot(item))
          .map(item => ({
            id: item.id,
            plot_id: item.plot_id,
            input_name: item.input_name,
            plot_name: plotName(store, item.plot_id),
            farmer_name: farmerName(item.user_id),
            type: 'pending',
            severity: 'medium',
            title: 'คำขอใช้ปัจจัยการผลิตรอพิจารณา',
            explanation: `คำขอ "${item.input_name}" รอเจ้าหน้าที่ ICS พิจารณาก่อนนำไปใช้ในแปลง`,
            recommended_tab: 'approval',
          }));
        const inactive = store.plots.filter(plot => owners.has(plot.owner_id) && !store.activities.some(item => item.plot_id === plot.id && item.activity_date >= since14))
          .map(plot => ({
            id: plot.id,
            plot_id: plot.id,
            plot_name: plot.name,
            farmer_name: farmerName(plot.owner_id),
            type: 'inactive',
            severity: 'high',
            title: 'ขาดบันทึกกิจกรรมเกิน 14 วัน',
            explanation: 'ไม่พบบันทึกกิจกรรมการดูแลแปลงติดต่อกันเกิน 14 วัน ควรติดตามหรือลงตรวจแปลง',
            recommended_tab: 'record',
          }));
        const missingEvidence = store.plots
          .filter(plot => owners.has(plot.owner_id))
          .map(plot => {
            const count = store.activities.filter(a => a.plot_id === plot.id && a.activity_date >= since30 && !a.photo_url).length;
            if (!count) return null;
            return {
              id: plot.id,
              plot_id: plot.id,
              plot_name: plot.name,
              farmer_name: farmerName(plot.owner_id),
              missing_count: count,
              type: 'missing_evidence',
              severity: count >= 3 ? 'medium' : 'low',
              title: 'กิจกรรมขาดภาพถ่ายหลักฐาน',
              explanation: `พบ ${count} กิจกรรมในรอบ 30 วันล่าสุดที่ยังไม่มีภาพหลักฐานแนบประกอบ`,
              recommended_tab: 'record',
            };
          })
          .filter(Boolean);
        const actionRisks = store.corrective_actions
          .filter(ca => ca.status !== 'resolved' && ownsPlot(ca))
          .map(ca => {
            const overdue = ca.due_date < todayIso;
            return {
              id: ca.id,
              plot_id: ca.plot_id,
              plot_name: plotName(store, ca.plot_id),
              farmer_name: farmerName(ownerOf(store, ca.plot_id)),
              standard_code: ca.standard_code,
              due_date: ca.due_date,
              responsible_name: byId.get(ca.responsible_user_id)?.name || 'เจ้าหน้าที่ ICS',
              type: overdue ? 'overdue_action' : 'open_action',
              severity: overdue ? 'high' : (ca.severity === 'high' ? 'high' : 'medium'),
              title: overdue ? 'เกินกำหนดแก้ไขปรับปรุง (CAPA)' : 'รายการแก้ไขปรับปรุงรอดำเนินการ',
              explanation: overdue
                ? `ข้อบกพร่อง "${ca.finding}" เกินกำหนดวันที่ ${ca.due_date} (มาตรฐาน ${ca.standard_code})`
                : `ข้อบกพร่อง "${ca.finding}" กำหนดแก้ไขภายในวันที่ ${ca.due_date} (มาตรฐาน ${ca.standard_code})`,
              recommended_tab: 'reviews',
            };
          });
        const severityRank = { high: 0, medium: 1, low: 2 };
        return clone([...actionRisks, ...inactive, ...pending, ...missingEvidence].sort((a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3)));
      }
      if (method === 'GET' && path === '/reviews') {
        return clone(store.reviews.filter(ownsPlot).sort(byIdDesc).map(item => {
          const actions = store.corrective_actions.filter(ca => ca.review_id === item.id);
          return {
            ...item,
            plot_name: plotName(store, item.plot_id),
            farmer_name: farmerName(ownerOf(store, item.plot_id)),
            reviewer_name: byId.get(item.reviewer_id)?.name || 'เจ้าหน้าที่ ICS',
            checklist_results: Array.isArray(item.checklist_results) ? item.checklist_results : [],
            open_actions_count: actions.filter(ca => ca.status !== 'resolved').length,
            total_actions_count: actions.length,
          };
        }));
      }
      if (method === 'GET' && path === '/checklists') {
        requireRole(account, 'ics', 'เฉพาะเจ้าหน้าที่ ICS');
        const std = params.get('standard_code');
        const includeInactive = ['1', 'true'].includes(params.get('include_inactive'));
        return clone(store.checklists.filter(c => (!std || c.standard_code === std.toUpperCase()) && (includeInactive || c.is_active)));
      }
      if (method === 'GET' && path === '/corrective-actions') {
        requireRole(account, 'ics', 'เฉพาะเจ้าหน้าที่ ICS');
        const st = params.get('status');
        const pId = params.get('plot_id') ? Number(params.get('plot_id')) : null;
        const std = params.get('standard_code');
        return clone(store.corrective_actions
          .filter(ca => ownsPlot(ca) && (!st || ca.status === st) && (!pId || ca.plot_id === pId) && (!std || ca.standard_code === std.toUpperCase()))
          .map(ca => ({
            ...ca,
            plot_name: plotName(store, ca.plot_id),
            farmer_name: farmerName(ownerOf(store, ca.plot_id)),
            responsible_name: byId.get(ca.responsible_user_id)?.name || 'เจ้าหน้าที่ ICS',
            review_result: store.reviews.find(r => r.id === ca.review_id)?.result || null,
            is_overdue: ca.status !== 'resolved' && ca.due_date < todayIso,
          })));
      }
      if (method === 'GET' && path === '/audit-logs') {
        requireRole(account, 'ics', 'เฉพาะเจ้าหน้าที่ ICS');
        return clone(store.audit_logs.slice(0, 100));
      }
      if (method === 'GET' && path === '/ics/farmers') {
        requireRole(account, 'ics', 'เฉพาะเจ้าหน้าที่ ICS');
        return ACCOUNTS.filter(item => item.role === 'farmer' && item.assignedTo === account.agencyCode).map(farmer => {
          const plotIds = new Set(store.plots.filter(plot => plot.owner_id === farmer.id).map(plot => plot.id));
          const activities = store.activities.filter(item => plotIds.has(item.plot_id));
          return {
            id: farmer.id, name: farmer.name, agency_code: farmer.agencyCode,
            plot_count: plotIds.size,
            activity_count: activities.length,
            pending_approvals: store.approvals.filter(item => plotIds.has(item.plot_id) && item.status === 'pending').length,
            last_activity_date: activities.map(item => item.activity_date).sort().pop() || null,
          };
        });
      }

      if (method === 'POST' && path === '/plots') {
        requireRole(account, 'farmer', 'เฉพาะเกษตรกร');
        const plot = { id: ++store.seq.plots, owner_id: account.id, name: text(input.name, 'ชื่อแปลง', 100), crop: text(input.crop, 'พืชที่ปลูก', 100), area: optionalText(input.area, 'พื้นที่', 200), created_at: now().toISOString() };
        store.plots.push(plot); save(store);
        return { id: plot.id };
      }
      if (method === 'PATCH' && plotMatch) {
        requireRole(account, 'farmer', 'เฉพาะเกษตรกร');
        const plot = ownPlot(store, account, plotMatch[1]);
        const allowed = new Set(['name', 'crop', 'area']);
        if (Object.keys(input).some(key => !allowed.has(key))) throw new DemoError(400, 'มีข้อมูลที่ไม่อนุญาตให้แก้ไข');
        if (Object.hasOwn(input, 'name')) plot.name = text(input.name, 'ชื่อแปลง', 100);
        if (Object.hasOwn(input, 'crop')) plot.crop = text(input.crop, 'พืชที่ปลูก', 100);
        if (Object.hasOwn(input, 'area')) plot.area = optionalText(input.area, 'พื้นที่', 200);
        save(store);
        return clone(plot);
      }
      if (method === 'POST' && path === '/activities') {
        requireRole(account, 'farmer', 'เฉพาะเกษตรกร');
        const plot = ownPlot(store, account, input.plot_id);
        const item = { id: ++store.seq.activities, plot_id: plot.id, user_id: account.id, kind: text(input.kind, 'กิจกรรม', 100), details: text(input.details, 'รายละเอียด', 2000), activity_date: isoDate(input.activity_date, 'วันที่ทำกิจกรรม'), photo_url: photoUrl(input.photo_url), created_at: now().toISOString() };
        store.activities.push(item); save(store);
        return { id: item.id };
      }
      if (method === 'POST' && path === '/webhook/line') {
        const textMessage = input.message || 'บันทึกกิจกรรมผ่าน LINE OA สำเร็จ (สูบน้ำโซลาร์เซลล์ / แหนแดง)';
        let replyText = '🌱 ระบบบริหารมาตรฐานเกษตรอินทรีย์ผักไหม ยินดีให้บริการครับ แตะเมนูลัดเพื่อถามสถานะได้ทันที';
        if (/คำขอ|approval|ปัจจัย/.test(textMessage)) {
          replyText = '🌱 ตรวจสอบสถานะคำขอ: มีคำขอใช้ปัจจัยรอพิจารณา เจ้าหน้าที่กำลังตรวจสอบความสอดคล้องตามเกณฑ์อินทรีย์';
        } else if (/แปลง|สถานะ|plot/.test(textMessage)) {
          replyText = '🌾 สรุปสถานะแปลง: แปลง A-03 ข้าวหอมมะลิ 105 (ระยะปรับเปลี่ยน) บันทึกสม่ำเสมอในรอบ 14 วัน';
        } else if (/ตรวจ|ผลตรวจ|pgs/.test(textMessage)) {
          replyText = '🛡️ ผลตรวจแปลงล่าสุด: ผ่านเกณฑ์มาตรฐานเกษตรอินทรีย์แบบมีส่วนร่วม (PGS)';
        } else if (/ics|เจ้าหน้าที่|ติดต่อ/.test(textMessage)) {
          replyText = '🧑‍🌾 เจ้าหน้าที่ ICS ผู้รับผิดชอบ: คุณวิชัย ผักไหม โทร. 081-234-5678';
        }
        const firstFarmerPlot = store.plots.find(p => owners.has(p.owner_id)) || store.plots[0];
        const item = {
          id: ++store.seq.activities,
          plot_id: firstFarmerPlot ? firstFarmerPlot.id : 1,
          user_id: account.id,
          kind: input.kind || 'บันทึกผ่าน LINE OA',
          details: textMessage,
          activity_date: isoDay(now()),
          photo_url: input.photo_url || null,
          created_at: now().toISOString()
        };
        store.activities.push(item);
        save(store);
        return { ok: true, message: 'LINE Webhook mapped to activity log', reply: replyText, activity: item };
      }
      if (method === 'POST' && path === '/approvals') {
        requireRole(account, 'farmer', 'เฉพาะเกษตรกร');
        const plot = ownPlot(store, account, input.plot_id);
        const item = {
          id: ++store.seq.approvals,
          plot_id: plot.id,
          user_id: account.id,
          input_name: text(input.input_name, 'ชื่อปัจจัยการผลิต', 200),
          details: text(input.details, 'รายละเอียด', 2000),
          formula_details: optionalText(input.formula_details, 'สูตรการผลิต', 2000),
          expected_use_date: optionalText(input.expected_use_date, 'วันที่คาดว่าจะใช้', 20),
          status: 'pending',
          reviewer_id: null,
          reviewed_at: null,
          comment: null,
          created_at: now().toISOString()
        };
        store.approvals.push(item); save(store);
        return { id: item.id };
      }
      if (method === 'PATCH' && approvalMatch) {
        requireRole(account, 'ics', 'เฉพาะเจ้าหน้าที่ ICS');
        const id = positiveId(approvalMatch[1]);
        const approval = store.approvals.find(item => item.id === id);
        if (!approval) throw new DemoError(404, 'ไม่พบคำขอ');
        ownPlot(store, account, approval.plot_id);
        if (!['approved', 'rejected'].includes(input.status)) throw new DemoError(400, 'สถานะไม่ถูกต้อง');
        if (approval.status !== 'pending') throw new DemoError(404, 'รายการนี้ถูกพิจารณาแล้วหรือไม่พบ');
        Object.assign(approval, { status: input.status, comment: optionalText(input.comment, 'ความเห็น', 1000), reviewer_id: account.id, reviewed_at: now().toISOString() });
        save(store);
        return { ok: true };
      }
      if (method === 'POST' && path === '/lots') {
        requireRole(account, 'farmer', 'เฉพาะเกษตรกร');
        const plot = ownPlot(store, account, input.plot_id);
        const quantity = Number(input.quantity);
        if (!Number.isFinite(quantity) || quantity < 0) throw new DemoError(400, 'ปริมาณไม่ถูกต้อง');
        const code = text(input.code, 'รหัสล็อต', 100);
        if (store.lots.some(item => item.code === code)) throw new DemoError(409, 'ข้อมูลนี้มีอยู่แล้ว');
        const item = { id: ++store.seq.lots, plot_id: plot.id, code, crop: text(input.crop, 'ชนิดผลผลิต', 100), harvest_date: isoDate(input.harvest_date, 'วันที่เก็บเกี่ยว'), quantity, created_at: now().toISOString() };
        store.lots.push(item); save(store);
        return { id: item.id };
      }
      if (method === 'POST' && path === '/reviews') {
        requireRole(account, 'ics', 'เฉพาะเจ้าหน้าที่ ICS');
        const plot = ownPlot(store, account, input.plot_id);
        const allowedStd = new Set(['PGS', 'EU_ORGANIC', 'FAIRTRADE']);
        const standardCode = input.standard_code ? String(input.standard_code).trim().toUpperCase() : null;
        if (standardCode && !allowedStd.has(standardCode)) throw new DemoError(400, 'รหัสมาตรฐานไม่ถูกต้อง');
        let checklistId = null;
        let resolvedStandard = standardCode;
        if (input.checklist_id) {
          checklistId = positiveId(input.checklist_id, 'รหัสชุดรายการตรวจ');
          const cl = store.checklists.find(c => c.id === checklistId && c.is_active);
          if (!cl) throw new DemoError(404, 'ไม่พบชุดรายการตรวจที่ใช้งานได้');
          if (standardCode && cl.standard_code !== standardCode) throw new DemoError(400, 'ชุดรายการตรวจไม่ตรงกับมาตรฐานที่เลือก');
          resolvedStandard = cl.standard_code;
        }
        const checklistResults = Array.isArray(input.checklist_results) ? input.checklist_results : [];
        const item = {
          id: ++store.seq.reviews,
          plot_id: plot.id,
          reviewer_id: account.id,
          result: text(input.result, 'ผลตรวจ', 100),
          note: text(input.note, 'บันทึกผลตรวจ', 2000),
          ...(resolvedStandard ? { standard_code: resolvedStandard } : {}),
          ...(checklistId ? { checklist_id: checklistId } : {}),
          photo_url: photoUrl(input.photo_url),
          checklist_results: checklistResults,
          created_at: now().toISOString(),
        };
        store.reviews.push(item);
        const createdActions = [];
        if (Array.isArray(input.findings)) {
          for (const f of input.findings) {
            const ca = {
              id: ++store.seq.corrective_actions,
              plot_id: plot.id,
              review_id: item.id,
              standard_code: (f.standard_code && allowedStd.has(String(f.standard_code).toUpperCase())) ? String(f.standard_code).toUpperCase() : (resolvedStandard || 'PGS'),
              severity: ['low', 'medium', 'high'].includes(String(f.severity || '').toLowerCase()) ? String(f.severity).toLowerCase() : 'medium',
              finding: text(f.finding, 'ข้อบกพร่องที่พบ', 1000),
              action_required: text(f.action_required, 'แนวทางแก้ไข', 1000),
              responsible_user_id: account.id,
              due_date: isoDate(f.due_date, 'กำหนดแก้ไข'),
              status: 'open',
              resolution_note: '',
              resolved_at: null,
              created_by: account.id,
              created_at: now().toISOString(),
              updated_at: now().toISOString(),
            };
            store.corrective_actions.push(ca);
            createdActions.push(ca.id);
            recordDemoAudit(store, account.id, 'corrective_action.created', 'corrective_action', ca.id, { plotId: plot.id, reviewId: item.id, standardCode: ca.standard_code });
          }
        }
        recordDemoAudit(store, account.id, 'review.created', 'review', item.id, { plotId: plot.id, result: item.result, ...(resolvedStandard ? { standardCode: resolvedStandard } : {}) });
        save(store);
        return {
          id: item.id,
          ...(resolvedStandard ? { standard_code: resolvedStandard } : {}),
          ...(createdActions.length ? { corrective_action_ids: createdActions } : {}),
        };
      }
      if (method === 'POST' && path === '/checklists') {
        requireRole(account, 'ics', 'เฉพาะเจ้าหน้าที่ ICS');
        const std = String(input.standard_code || '').trim().toUpperCase();
        if (!['PGS', 'EU_ORGANIC', 'FAIRTRADE'].includes(std)) throw new DemoError(400, 'รหัสมาตรฐานไม่ถูกต้อง');
        if (input.validation_status === 'validated') throw new DemoError(403, 'เฉพาะผู้ดูแลระบบสามารถยืนยันสถานะเกณฑ์มาตรฐานได้');
        if (!Array.isArray(input.items) || !input.items.length) throw new DemoError(400, 'รายการตรวจต้องมีอย่างน้อย 1 รายการ');
        const created = {
          id: ++store.seq.checklists,
          standard_code: std,
          title: text(input.title, 'ชื่อชุดรายการตรวจ', 200),
          description: optionalText(input.description, 'คำอธิบายชุดรายการตรวจ', 1000),
          items: input.items.map((it, idx) => ({ key: `item_${idx + 1}`, label: text(it.label, 'หัวข้อตรวจ', 300), required: Boolean(it.required) })),
          validation_status: 'draft_unvalidated',
          is_active: true,
          created_by: account.id,
          created_at: now().toISOString(),
          updated_at: now().toISOString(),
        };
        store.checklists.push(created);
        recordDemoAudit(store, account.id, 'checklist.created', 'inspection_checklist', created.id, { standardCode: std });
        save(store);
        return clone(created);
      }
      if (method === 'PATCH' && checklistMatch) {
        requireRole(account, 'ics', 'เฉพาะเจ้าหน้าที่ ICS');
        const id = positiveId(checklistMatch[1], 'รหัสชุดรายการตรวจ');
        const cl = store.checklists.find(c => c.id === id);
        if (!cl) throw new DemoError(404, 'ไม่พบชุดรายการตรวจ');
        if (input.validation_status === 'validated') throw new DemoError(403, 'เฉพาะผู้ดูแลระบบสามารถยืนยันสถานะเกณฑ์มาตรฐานได้');
        if (Object.hasOwn(input, 'title')) cl.title = text(input.title, 'ชื่อชุดรายการตรวจ', 200);
        if (Object.hasOwn(input, 'description')) cl.description = optionalText(input.description, 'คำอธิบายชุดรายการตรวจ', 1000);
        if (Object.hasOwn(input, 'is_active')) cl.is_active = Boolean(input.is_active);
        if (Object.hasOwn(input, 'items')) cl.items = input.items.map((it, idx) => ({ key: it.key || `item_${idx + 1}`, label: text(it.label, 'หัวข้อตรวจ', 300), required: Boolean(it.required) }));
        cl.updated_at = now().toISOString();
        recordDemoAudit(store, account.id, 'checklist.updated', 'inspection_checklist', cl.id, {});
        save(store);
        return clone(cl);
      }
      if (method === 'POST' && path === '/corrective-actions') {
        requireRole(account, 'ics', 'เฉพาะเจ้าหน้าที่ ICS');
        const plot = ownPlot(store, account, input.plot_id);
        const std = input.standard_code ? String(input.standard_code).trim().toUpperCase() : 'PGS';
        if (!['PGS', 'EU_ORGANIC', 'FAIRTRADE'].includes(std)) throw new DemoError(400, 'รหัสมาตรฐานไม่ถูกต้อง');
        const severity = input.severity ? String(input.severity).trim().toLowerCase() : 'medium';
        if (!['low', 'medium', 'high'].includes(severity)) throw new DemoError(400, 'ระดับความรุนแรงไม่ถูกต้อง');
        const ca = {
          id: ++store.seq.corrective_actions,
          plot_id: plot.id,
          review_id: input.review_id ? positiveId(input.review_id) : null,
          standard_code: std,
          severity,
          finding: text(input.finding, 'ข้อบกพร่องที่พบ', 1000),
          action_required: text(input.action_required, 'แนวทางแก้ไข', 1000),
          responsible_user_id: account.id,
          due_date: isoDate(input.due_date, 'กำหนดแก้ไข'),
          status: 'open',
          resolution_note: '',
          resolved_at: null,
          created_by: account.id,
          created_at: now().toISOString(),
          updated_at: now().toISOString(),
        };
        store.corrective_actions.push(ca);
        recordDemoAudit(store, account.id, 'corrective_action.created', 'corrective_action', ca.id, { plotId: plot.id, standardCode: std, severity });
        save(store);
        return clone({ ...ca, plot_name: plot.name, farmer_name: farmerName(plot.owner_id), responsible_name: account.name, is_overdue: ca.due_date < todayIso });
      }
      if (method === 'PATCH' && capaMatch) {
        requireRole(account, 'ics', 'เฉพาะเจ้าหน้าที่ ICS');
        const id = positiveId(capaMatch[1], 'รหัสรายการแก้ไข');
        const ca = store.corrective_actions.find(c => c.id === id);
        if (!ca) throw new DemoError(404, 'ไม่พบรายการแก้ไขปรับปรุง');
        ownPlot(store, account, ca.plot_id);
        const fromStatus = ca.status;
        if (Object.hasOwn(input, 'status')) {
          if (!['open', 'in_progress', 'resolved'].includes(input.status)) throw new DemoError(400, 'สถานะการแก้ไขไม่ถูกต้อง');
          ca.status = input.status;
          ca.resolved_at = input.status === 'resolved' ? now().toISOString() : null;
        }
        if (Object.hasOwn(input, 'resolution_note')) ca.resolution_note = optionalText(input.resolution_note, 'สรุปผลการแก้ไข', 1000);
        if (ca.status === 'resolved' && !String(ca.resolution_note || '').trim()) {
          throw new DemoError(400, 'กรุณาระบุสรุปผลการแก้ไขก่อนปิดรายการ');
        }
        if (Object.hasOwn(input, 'due_date')) ca.due_date = isoDate(input.due_date, 'กำหนดแก้ไข');
        if (Object.hasOwn(input, 'severity')) ca.severity = String(input.severity).toLowerCase();
        ca.updated_at = now().toISOString();
        recordDemoAudit(store, account.id, 'corrective_action.updated', 'corrective_action', ca.id, { plotId: ca.plot_id, fromStatus, toStatus: ca.status });
        save(store);
        return clone({ ...ca, plot_name: plotName(store, ca.plot_id), farmer_name: farmerName(ownerOf(store, ca.plot_id)), responsible_name: byId.get(ca.responsible_user_id)?.name || account.name, is_overdue: ca.status !== 'resolved' && ca.due_date < todayIso });
      }
      throw new DemoError(404, 'ไม่พบ API ในโหมด Demo');
    }

    return {
      login(role, code) { return publicUser(findAccount(role, code)); },
      request(user, path, method, body) { return request(user, path, method, body); },
      reset() { storage.removeItem(STORAGE_KEY); load(); },
      snapshot() { return clone(load()); },
    };
  }

  /* Demo session holds only role + synthetic code (no secrets) in sessionStorage. */
  function createDemoSession(backend, sessionStore) {
    const store = safeStorage(sessionStore);
    return {
      login(role, code) {
        const user = backend.login(role, code);
        store.setItem(SESSION_KEY, JSON.stringify({ role: user.role, code: user.agency_code }));
        return user;
      },
      restore() {
        try {
          const saved = JSON.parse(store.getItem(SESSION_KEY) || 'null');
          return saved ? backend.login(saved.role, saved.code) : null;
        } catch {
          store.removeItem(SESSION_KEY);
          return null;
        }
      },
      logout() { store.removeItem(SESSION_KEY); },
    };
  }

  const sampleCodes = role => ACCOUNTS.filter(account => account.role === role).slice(0, 3).map(account => account.agencyCode);

  root.ReadyToGrowDemo = Object.freeze({ ACCOUNTS, ADMIN_CODES, STORAGE_KEY, SESSION_KEY, DemoError, normalizeCode, findAccount, createDemoBackend, createDemoSession, sampleCodes, memoryStorage });
})(globalThis);
