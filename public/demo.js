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
  const STORE_VERSION = 1;
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

  function publicUser(account) {
    return { id: account.id, name: account.name, role: account.role, status: 'active', agency_code: account.agencyCode, demo: true };
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
    const crops = ['ผักกาดหอม', 'คะน้า', 'พริกขี้หนู', 'มะเขือเทศ', 'ข้าวหอมมะลิ'];
    const store = { version: STORE_VERSION, seq: { plots: 0, activities: 0, approvals: 0, lots: 0, reviews: 0 }, plots: [], activities: [], approvals: [], lots: [], reviews: [] };
    const stamp = now.toISOString();
    const daysAgo = days => isoDay(new Date(now.getTime() - days * 86_400_000));
    ACCOUNTS.filter(account => account.role === 'farmer').forEach((farmer, index) => {
      const n = index + 1;
      const plotId = ++store.seq.plots;
      store.plots.push({ id: plotId, owner_id: farmer.id, name: `แปลงอินทรีย์ ${pad(n, 2)}`, crop: crops[index % crops.length], area: `${1 + (n % 4)} ไร่`, created_at: stamp });
      if (n % 5 !== 0) {
        store.activities.push({ id: ++store.seq.activities, plot_id: plotId, user_id: farmer.id, kind: 'ให้น้ำ', details: 'ให้น้ำระบบน้ำหยดช่วงเช้า', activity_date: daysAgo(2 + (n % 6)), photo_url: null, created_at: stamp });
      }
      if (n % 5 === 1) {
        store.approvals.push({ id: ++store.seq.approvals, plot_id: plotId, user_id: farmer.id, input_name: 'ปุ๋ยหมักมูลไส้เดือน', details: 'ผลิตเองจากมูลไส้เดือน ใช้ 200 กรัมต่อต้น ทุก 15 วัน', status: 'pending', reviewer_id: null, reviewed_at: null, comment: null, created_at: stamp });
      }
      if (n % 5 === 2) {
        store.lots.push({ id: ++store.seq.lots, plot_id: plotId, code: `LOT-DEMO-${pad(n, 3)}`, crop: crops[index % crops.length], harvest_date: daysAgo(10), quantity: 120, created_at: stamp });
      }
      if (n % 5 === 1) {
        store.reviews.push({
          id: ++store.seq.reviews,
          plot_id: plotId,
          reviewer_id: 910101 + Math.floor(index / 5),
          result: 'ผ่าน',
          note: 'ตรวจแปลงประจำรอบการผลิต สภาพแปลงสมบูรณ์ แนวกันชนปลอดภัย มีการจดบันทึกสม่ำเสมอ',
          created_at: daysAgo(5),
        });
      }
    });
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
    let parsed;
    try { parsed = new URL(String(value)); } catch { throw new DemoError(400, 'ลิงก์รูปภาพไม่ถูกต้อง'); }
    if (parsed.protocol !== 'https:') throw new DemoError(400, 'ลิงก์รูปภาพต้องเป็น HTTPS');
    return parsed.toString();
  };

  function createDemoBackend(options = {}) {
    const storage = safeStorage(options.storage === undefined ? root.localStorage : options.storage);
    const now = options.now || (() => new Date());

    function load() {
      try {
        const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
        if (parsed && parsed.version === STORE_VERSION && Array.isArray(parsed.plots)) return parsed;
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

    function request(user, rawPath, rawMethod = 'GET', body = {}) {
      const account = sessionAccount(user);
      const path = String(rawPath).split('?')[0];
      const method = String(rawMethod).toUpperCase();
      if (path === '/admin' || path.startsWith('/admin/') || path.startsWith('/auth/')) throw new DemoError(403, 'โหมด Demo ไม่สามารถเข้าถึงเมนูผู้ดูแลระบบ', 'DEMO_ADMIN_FORBIDDEN');
      const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
      const store = load();
      const owners = visibleOwners(account);
      const ownsPlot = item => owners.has(ownerOf(store, item.plot_id));
      const plotMatch = path.match(/^\/plots\/([^/]+)$/);
      const approvalMatch = path.match(/^\/approvals\/([^/]+)$/);

      if (method === 'GET' && path === '/me') return publicUser(account);
      if (method === 'POST' && path === '/logout') return { ok: true };

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
        const since = isoDay(new Date(now().getTime() - 14 * 86_400_000));
        const pending = store.approvals.filter(item => item.status === 'pending' && ownsPlot(item))
          .map(item => ({ id: item.id, input_name: item.input_name, plot_name: plotName(store, item.plot_id), farmer_name: farmerName(item.user_id), type: 'pending' }));
        const inactive = store.plots.filter(plot => owners.has(plot.owner_id) && !store.activities.some(item => item.plot_id === plot.id && item.activity_date >= since))
          .map(plot => ({ id: plot.id, plot_name: plot.name, farmer_name: farmerName(plot.owner_id), type: 'inactive' }));
        return clone([...pending, ...inactive]);
      }
      if (method === 'GET' && path === '/reviews') {
        return clone(store.reviews.filter(ownsPlot).sort(byIdDesc).map(item => ({
          ...item,
          plot_name: plotName(store, item.plot_id),
          farmer_name: farmerName(ownerOf(store, item.plot_id)),
          reviewer_name: byId.get(item.reviewer_id)?.name || 'เจ้าหน้าที่ ICS',
        })));
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
      if (method === 'POST' && path === '/approvals') {
        requireRole(account, 'farmer', 'เฉพาะเกษตรกร');
        const plot = ownPlot(store, account, input.plot_id);
        const item = { id: ++store.seq.approvals, plot_id: plot.id, user_id: account.id, input_name: text(input.input_name, 'ชื่อปัจจัยการผลิต', 200), details: text(input.details, 'รายละเอียด', 2000), status: 'pending', reviewer_id: null, reviewed_at: null, comment: null, created_at: now().toISOString() };
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
        const item = { id: ++store.seq.reviews, plot_id: plot.id, reviewer_id: account.id, result: text(input.result, 'ผลตรวจ', 100), note: text(input.note, 'บันทึกผลตรวจ', 2000), created_at: now().toISOString() };
        store.reviews.push(item); save(store);
        return { id: item.id };
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
