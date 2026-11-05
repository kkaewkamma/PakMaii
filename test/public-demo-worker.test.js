import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handleDemoApi } from '../worker/demo-worker.js';

await import('../public/demo.js');
const Demo = globalThis.ReadyToGrowDemo;

const demoWorkerSource = fs.readFileSync(new URL('../worker/demo-worker.js', import.meta.url), 'utf8');
const demoConfigRaw = fs.readFileSync(new URL('../wrangler.demo.jsonc', import.meta.url), 'utf8');
const headersSource = fs.readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
const demoConfig = JSON.parse(demoConfigRaw.replace(/\/\/.*$/gm, ''));

test('wrangler.demo.jsonc isolates Public Demo with no D1, no secrets, and entrypoint set to demo-worker.js', () => {
  assert.equal(demoConfig.name, 'ready-to-grow-demo');
  assert.equal(demoConfig.main, 'worker/demo-worker.js');
  assert.equal(demoConfig.assets?.directory, './public');
  assert.equal(demoConfig.assets?.binding, 'ASSETS');
  assert.deepEqual(demoConfig.assets?.run_worker_first, ['/api/*']);

  // Critical security invariants:
  assert.equal(demoConfig.d1_databases, undefined, 'Public Demo must not bind any D1 database');
  assert.equal(demoConfig.kv_namespaces, undefined, 'Public Demo must not bind KV');
  assert.equal(demoConfig.r2_buckets, undefined, 'Public Demo must not bind R2');
  assert.equal(demoConfig.secrets, undefined, 'Public Demo must not declare secrets in config');
  assert.equal(demoConfig.vars?.ENVIRONMENT, 'demo');
});

test('demo-worker source does not import database, repository, or sensitive auth modules', () => {
  const codeOnly = demoWorkerSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
  assert.doesNotMatch(codeOnly, /repository|d1|database|scrypt|agencyCodeDigests|verifyAdminPassword/i);
  assert.doesNotMatch(codeOnly, /LINE_VERIFY|api\.line\.me|crypto\.subtle\.sign/);
  assert.doesNotMatch(codeOnly, /sessions|farmer_assignments|registration_invites/);
});

test('demo worker handles /api/health and /api/config with demoOnly=true and security headers', async () => {
  const env = { LIFF_ID: 'test-demo-liff' };

  const healthRes = await handleDemoApi(new Request('https://demo.example/api/health'), env);
  assert.equal(healthRes.status, 200);
  assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(healthRes.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(healthRes.headers.get('referrer-policy'), 'no-referrer');
  const healthData = await healthRes.json();
  assert.deepEqual(healthData, { ok: true, service: 'ready-to-grow-demo' });

  const configRes = await handleDemoApi(new Request('https://demo.example/api/config'), env);
  assert.equal(configRes.status, 200);
  const configData = await configRes.json();
  assert.deepEqual(configData, { liffId: 'test-demo-liff', development: false, demoOnly: true });
});

test('demo worker rejects all admin and backend API paths (403 for admin, 404 for others)', async () => {
  const env = {};
  const forbiddenPaths = [
    '/api/admin/users',
    '/api/admin/invites',
    '/api/admin/assignments',
    '/api/auth/admin/password-login',
    '/api/auth/register/invite',
  ];

  for (const path of forbiddenPaths) {
    const res = await handleDemoApi(new Request(`https://demo.example${path}`, { method: 'POST' }), env);
    assert.equal(res.status, 403, `Expected 403 on ${path}`);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const data = await res.json();
    assert.equal(data.error, 'API ไม่พร้อมใช้งานในโหมด Public Demo');
  }

  const notFoundPaths = [
    '/api/login',
    '/api/logout',
    '/api/me',
    '/api/plots',
    '/api/activities',
    '/api/approvals',
    '/api/lots',
    '/api/risks',
    '/api/reviews',
  ];

  for (const path of notFoundPaths) {
    const res = await handleDemoApi(new Request(`https://demo.example${path}`), env);
    assert.equal(res.status, 404, `Expected 404 on ${path}`);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  }
});

test('public demo security headers and CSP allow demo assets and block inline sinks', () => {
  assert.match(headersSource, /default-src 'none'/);
  assert.match(headersSource, /script-src 'self' https:\/\/static\.line-scdn\.net/);
  assert.match(headersSource, /style-src 'self'/);
  assert.doesNotMatch(headersSource, /unsafe-inline|unsafe-eval/i);
});

test('End-to-End Scenarios A through H work completely in Demo Mode', () => {
  const storage = Demo.memoryStorage();
  const sessionStore = Demo.memoryStorage();
  const backend = Demo.createDemoBackend({ storage });
  const session = Demo.createDemoSession(backend, sessionStore);

  // Scenario A: Farmer Login → เพิ่มแปลง → บันทึกกิจกรรม → Logout → Login ใหม่ → ข้อมูลยังอยู่
  const farmerA = session.login('farmer', 'F-STG-001');
  const { id: plotAId } = backend.request(farmerA, '/plots', 'POST', { name: 'แปลง Scenario A', crop: 'ผักกาดขาว', area: '2 ไร่' });
  const { id: actAId } = backend.request(farmerA, '/activities', 'POST', {
    plot_id: plotAId,
    kind: 'ปลูก',
    details: 'หยอดเมล็ดพันธุ์อินทรีย์',
    activity_date: '2026-10-15',
  });
  session.logout();
  assert.equal(session.restore(), null);

  const farmerALoginAgain = session.login('farmer', 'F-STG-001');
  const plotsA = backend.request(farmerALoginAgain, '/plots');
  assert.ok(plotsA.some(p => p.id === plotAId && p.name === 'แปลง Scenario A'));
  const actsA = backend.request(farmerALoginAgain, '/activities');
  assert.ok(actsA.some(a => a.id === actAId && a.details === 'หยอดเมล็ดพันธุ์อินทรีย์'));
  session.logout();

  // Scenario B: Farmer ส่งคำขอ → Logout → ICS Login → อนุมัติ → Logout → Farmer Login → เห็นผลอนุมัติและความเห็น
  const farmerB = session.login('farmer', 'F-STG-002');
  const farmerBPlot = backend.request(farmerB, '/plots')[0];
  const { id: appBId } = backend.request(farmerB, '/approvals', 'POST', {
    plot_id: farmerBPlot.id,
    input_name: 'ปุ๋ยอินทรีย์น้ำหมักปลา',
    details: 'ใช้บำรุงใบพืช',
  });
  session.logout();

  const ics1 = session.login('ics', 'ICS-STG-001'); // ICS-STG-001 oversees F-STG-001 to F-STG-005
  backend.request(ics1, `/approvals/${appBId}`, 'PATCH', {
    status: 'approved',
    comment: 'อนุมัติให้ใช้ได้ตามมาตรฐานเกษตรอินทรีย์',
  });
  session.logout();

  const farmerBCheck = session.login('farmer', 'F-STG-002');
  const farmerBApprovals = backend.request(farmerBCheck, '/approvals');
  const appBResult = farmerBApprovals.find(a => a.id === appBId);
  assert.equal(appBResult.status, 'approved');
  assert.equal(appBResult.comment, 'อนุมัติให้ใช้ได้ตามมาตรฐานเกษตรอินทรีย์');
  session.logout();

  // Scenario C: Farmer ส่งคำขอ → ICS ไม่อนุมัติพร้อมเหตุผล → Farmer เห็นเหตุผล
  const farmerC = session.login('farmer', 'F-STG-003');
  const farmerCPlot = backend.request(farmerC, '/plots')[0];
  const { id: appCId } = backend.request(farmerC, '/approvals', 'POST', {
    plot_id: farmerCPlot.id,
    input_name: 'สารเคมีกำจัดแมลงสังเคราะห์',
    details: 'แมลงระบาดหนัก',
  });
  session.logout();

  const icsC = session.login('ics', 'ICS-STG-001');
  backend.request(icsC, `/approvals/${appCId}`, 'PATCH', {
    status: 'rejected',
    comment: 'ไม่อนุมัติ: ห้ามใช้สารเคมีสังเคราะห์ในแปลงอินทรีย์โดยเด็ดขาด แนะนำให้ใช้สารสกัดสะเดาแทน',
  });
  session.logout();

  const farmerCCheck = session.login('farmer', 'F-STG-003');
  const farmerCApprovals = backend.request(farmerCCheck, '/approvals');
  const appCResult = farmerCApprovals.find(a => a.id === appCId);
  assert.equal(appCResult.status, 'rejected');
  assert.match(appCResult.comment, /ห้ามใช้สารเคมีสังเคราะห์/);
  session.logout();

  // Scenario D: ICS บันทึกผลตรวจแปลง → Farmer เห็นผลตรวจของแปลงตนเอง
  const icsD = session.login('ics', 'ICS-STG-001');
  const { id: revDId } = backend.request(icsD, '/reviews', 'POST', {
    plot_id: farmerCPlot.id,
    result: 'ผ่าน',
    note: 'ตรวจแนวกันชนรอบแปลงสมบูรณ์ ไม่พบการปนเปื้อน',
  });
  session.logout();

  const farmerDCheck = session.login('farmer', 'F-STG-003');
  const farmerDReviews = backend.request(farmerDCheck, '/reviews');
  const revDResult = farmerDReviews.find(r => r.id === revDId);
  assert.ok(revDResult, 'Farmer must see the review of their own plot');
  assert.equal(revDResult.result, 'ผ่าน');
  assert.equal(revDResult.plot_id, farmerCPlot.id);
  assert.equal(revDResult.note, 'ตรวจแนวกันชนรอบแปลงสมบูรณ์ ไม่พบการปนเปื้อน');
  assert.ok(revDResult.reviewer_name, 'Inspection includes reviewer name');
  session.logout();

  // Scenario E: ICS-001 ไม่เห็นหรือจัดการข้อมูล Farmer ที่อยู่ภายใต้ ICS-002
  // F-STG-006 is assigned to ICS-STG-002
  const ics1Check = session.login('ics', 'ICS-STG-001');
  const ics1Plots = backend.request(ics1Check, '/plots');
  const ics1Farmers = backend.request(ics1Check, '/ics/farmers');
  assert.equal(ics1Farmers.length, 5);
  assert.ok(ics1Farmers.every(f => ['F-STG-001', 'F-STG-002', 'F-STG-003', 'F-STG-004', 'F-STG-005'].includes(f.agency_code)));
  assert.ok(!ics1Farmers.some(f => f.agency_code === 'F-STG-006'));
  assert.ok(!ics1Plots.some(p => p.owner === 'Demo Farmer 06'));

  // ICS-001 cannot approve requests from F-STG-006
  const farmer6 = session.login('farmer', 'F-STG-006');
  const plot6 = backend.request(farmer6, '/plots')[0];
  const { id: app6Id } = backend.request(farmer6, '/approvals', 'POST', {
    plot_id: plot6.id,
    input_name: 'มูลไส้เดือน',
    details: 'ปรับปรุงบำรุงดิน',
  });
  session.logout();

  session.login('ics', 'ICS-STG-001');
  assert.throws(
    () => backend.request(ics1Check, `/approvals/${app6Id}`, 'PATCH', { status: 'approved' }),
    error => error.status === 403,
    'ICS-001 must not be able to approve request of farmer assigned to ICS-002'
  );
  session.logout();

  // Scenario F: Farmer-001 ไม่เห็นข้อมูลส่วนตัวของ Farmer-002
  const farmer1 = session.login('farmer', 'F-STG-001');
  const farmer1Plots = backend.request(farmer1, '/plots');
  const farmer1Approvals = backend.request(farmer1, '/approvals');
  const farmer1Reviews = backend.request(farmer1, '/reviews');
  assert.ok(farmer1Plots.every(p => p.owner_id === 911001)); // Farmer 1's id
  assert.ok(!farmer1Plots.some(p => p.owner_id === 911002));
  assert.ok(farmer1Approvals.every(a => a.user_id === 911001));
  const farmer1PlotIds = new Set(farmer1Plots.map(p => p.id));
  assert.ok(farmer1Reviews.every(r => farmer1PlotIds.has(r.plot_id)));
  // Farmer 1 cannot edit Farmer 2's plot
  assert.throws(
    () => backend.request(farmer1, `/plots/${plot6.id}`, 'PATCH', { name: 'Hack' }),
    error => error.status === 403
  );
  session.logout();

  // Scenario G: Reset Demo Data → ข้อมูลกลับสู่ Seed ที่ถูกต้อง โดยต้องมีการยืนยันก่อน Reset
  const farmerPreReset = session.login('farmer', 'F-STG-001');
  const { id: tempPlotId } = backend.request(farmerPreReset, '/plots', 'POST', { name: 'แปลงก่อนรีเซ็ต', crop: 'มะเขือเทศ' });
  assert.ok(backend.request(farmerPreReset, '/plots').some(p => p.id === tempPlotId));
  backend.reset();
  const farmerPostReset = session.login('farmer', 'F-STG-001');
  assert.ok(!backend.request(farmerPostReset, '/plots').some(p => p.id === tempPlotId));
  // Seed data is intact
  assert.ok(backend.request(farmerPostReset, '/plots').length >= 1);
  session.logout();

  // Scenario H: Refresh หน้าเว็บ / ปิดเปิด LIFF / Logout และ Login ใหม่ → ระบบไม่พัง
  // Simulated: Multiple re-instantiations of DemoBackend reading from the same storage
  const restoredBackend1 = Demo.createDemoBackend({ storage });
  const restoredSession1 = Demo.createDemoSession(restoredBackend1, sessionStore);
  const loggedUser = restoredSession1.login('farmer', 'F-STG-001');
  assert.equal(restoredSession1.restore()?.id, loggedUser.id);

  // Simulated browser reload:
  const restoredBackend2 = Demo.createDemoBackend({ storage });
  const restoredSession2 = Demo.createDemoSession(restoredBackend2, sessionStore);
  const restoredUser = restoredSession2.restore();
  assert.equal(restoredUser.agency_code, 'F-STG-001');
  assert.doesNotThrow(() => restoredBackend2.request(restoredUser, '/plots'));
  assert.doesNotThrow(() => restoredBackend2.request(restoredUser, '/activities'));
  assert.doesNotThrow(() => restoredBackend2.request(restoredUser, '/approvals'));
  assert.doesNotThrow(() => restoredBackend2.request(restoredUser, '/reviews'));

  // Corrupted session token recovery:
  sessionStore.setItem(Demo.SESSION_KEY, 'invalid-json{{{');
  assert.equal(restoredSession2.restore(), null); // gracefully falls back to null, no crash
});
