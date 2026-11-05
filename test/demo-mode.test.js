import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

await import('../public/demo.js');
const Demo = globalThis.ReadyToGrowDemo;
const { handleApi } = await import('../worker/index.js');

const identities = JSON.parse(fs.readFileSync(new URL('../staging-identities.example.json', import.meta.url), 'utf8'));
const demoSource = fs.readFileSync(new URL('../public/demo.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

const fixedNow = () => new Date('2026-10-15T00:00:00Z');
function setup() {
  const storage = Demo.memoryStorage();
  const sessionStore = Demo.memoryStorage();
  const backend = Demo.createDemoBackend({ storage, now: fixedNow });
  const session = Demo.createDemoSession(backend, sessionStore);
  return { storage, sessionStore, backend, session };
}
const expectDemoError = (fn, status, code) => assert.throws(fn, error => error.status === status && (!code || error.code === code));

test('demo accounts mirror staging-identities.example.json (codes, roles, assignments)', () => {
  const expected = identities.users.filter(user => user.role !== 'admin')
    .map(({ id, agencyCode, name, role, assignedTo }) => ({ id, agencyCode, name, role, ...(assignedTo ? { assignedTo } : {}) }));
  assert.deepEqual(Demo.ACCOUNTS.map(account => ({ ...account })), expected);
  for (const admin of identities.users.filter(user => user.role === 'admin')) assert.ok(Demo.ADMIN_CODES.has(admin.agencyCode));
});

test('demo login validates role/code match and rejects Admin and unknown codes', () => {
  const { backend } = setup();
  assert.equal(backend.login('farmer', 'F-STG-001').role, 'farmer');
  assert.equal(backend.login('ics', ' ics-stg-002 ').agency_code, 'ICS-STG-002');
  expectDemoError(() => backend.login('ics', 'F-STG-001'), 403, 'DEMO_ROLE_MISMATCH');
  expectDemoError(() => backend.login('farmer', 'ICS-STG-001'), 403, 'DEMO_ROLE_MISMATCH');
  expectDemoError(() => backend.login('farmer', 'ADMIN-STG-001'), 403, 'ADMIN_DEMO_FORBIDDEN');
  expectDemoError(() => backend.login('admin', 'ADMIN-STG-001'), 400);
  expectDemoError(() => backend.login('farmer', 'F-STG-999'), 401, 'DEMO_CODE_UNKNOWN');
  expectDemoError(() => backend.login('farmer', ''), 400);
});

test('demo session supports logout and switching Farmer → ICS → another Farmer without reload', () => {
  const { session, sessionStore } = setup();
  assert.equal(session.restore(), null);
  assert.equal(session.login('farmer', 'F-STG-001').agency_code, 'F-STG-001');
  assert.equal(session.restore().agency_code, 'F-STG-001');
  session.logout();
  assert.equal(session.restore(), null);
  assert.equal(sessionStore.getItem(Demo.SESSION_KEY), null);
  assert.equal(session.login('ics', 'ICS-STG-001').role, 'ics');
  session.logout();
  assert.equal(session.login('farmer', 'F-STG-002').agency_code, 'F-STG-002');
  const stored = sessionStore.getItem(Demo.SESSION_KEY);
  assert.doesNotMatch(stored, /token|password/i);
  expectDemoError(() => session.login('ics', 'F-STG-003'), 403);
  assert.equal(session.restore().agency_code, 'F-STG-002', 'failed login keeps previous valid session');
});

test('demo users can never reach Admin or auth endpoints', () => {
  const { backend } = setup();
  for (const code of [['farmer', 'F-STG-001'], ['ics', 'ICS-STG-001']]) {
    const user = backend.login(...code);
    for (const path of ['/admin/users', '/admin/invites', '/admin/assignments', '/auth/admin/password-login']) {
      expectDemoError(() => backend.request(user, path, 'GET'), 403, 'DEMO_ADMIN_FORBIDDEN');
    }
  }
  expectDemoError(() => backend.request({ id: 910001, role: 'admin' }, '/me'), 401);
  expectDemoError(() => backend.request({ id: 911001, role: 'ics' }, '/me'), 401);
});

test('Farmer changes are visible to the assigned ICS and ICS decisions are visible to the Farmer', () => {
  const { backend } = setup();
  const farmer = backend.login('farmer', 'F-STG-001');
  const ics = backend.login('ics', 'ICS-STG-001');
  const otherIcs = backend.login('ics', 'ICS-STG-002');

  const { id: plotId } = backend.request(farmer, '/plots', 'POST', { name: 'แปลงทดสอบ', crop: 'คะน้า', area: '2 ไร่' });
  backend.request(farmer, `/plots/${plotId}`, 'PATCH', { name: 'แปลงทดสอบ (แก้ไข)' });
  backend.request(farmer, '/activities', 'POST', { plot_id: plotId, kind: 'ใส่ปุ๋ย', activity_date: '2026-10-14', details: 'ปุ๋ยหมัก' });
  const { id: approvalId } = backend.request(farmer, '/approvals', 'POST', { plot_id: plotId, input_name: 'น้ำหมักชีวภาพ', details: 'หมักเอง' });

  const icsPlot = backend.request(ics, '/plots').find(plot => plot.id === plotId);
  assert.equal(icsPlot.name, 'แปลงทดสอบ (แก้ไข)');
  assert.equal(icsPlot.owner, 'Demo Farmer 01');
  assert.ok(backend.request(ics, '/activities').some(item => item.plot_id === plotId && item.kind === 'ใส่ปุ๋ย'));
  assert.ok(backend.request(ics, '/risks').some(item => item.type === 'pending' && item.id === approvalId));
  assert.equal(backend.request(ics, '/ics/farmers').length, 5);

  assert.ok(!backend.request(otherIcs, '/plots').some(plot => plot.id === plotId), 'unassigned ICS cannot see plot');
  expectDemoError(() => backend.request(otherIcs, `/approvals/${approvalId}`, 'PATCH', { status: 'approved' }), 403);

  backend.request(ics, `/approvals/${approvalId}`, 'PATCH', { status: 'approved', comment: 'ใช้ได้' });
  backend.request(ics, '/reviews', 'POST', { plot_id: plotId, result: 'ผ่าน', note: 'ตรวจแปลงเรียบร้อย' });
  expectDemoError(() => backend.request(ics, `/approvals/${approvalId}`, 'PATCH', { status: 'rejected' }), 404);

  const approval = backend.request(farmer, '/approvals').find(item => item.id === approvalId);
  assert.equal(approval.status, 'approved');
  assert.equal(approval.comment, 'ใช้ได้');
  assert.ok(backend.request(ics, '/reviews').some(item => item.plot_id === plotId));
  assert.ok(backend.request(farmer, '/reviews').some(item => item.plot_id === plotId), 'farmer sees reviews of their plots');
});

test('demo enforces role permissions and plot ownership like the real API', () => {
  const { backend } = setup();
  const farmer1 = backend.login('farmer', 'F-STG-001');
  const farmer2 = backend.login('farmer', 'F-STG-002');
  const ics = backend.login('ics', 'ICS-STG-001');
  const plotOf2 = backend.request(farmer2, '/plots')[0];
  expectDemoError(() => backend.request(farmer1, `/plots/${plotOf2.id}`, 'PATCH', { name: 'x' }), 403);
  expectDemoError(() => backend.request(ics, '/plots', 'POST', { name: 'x', crop: 'y' }), 403);
  expectDemoError(() => backend.request(farmer1, '/reviews', 'POST', { plot_id: plotOf2.id, result: 'ผ่าน', note: 'x' }), 403);
  assert.ok(!backend.request(farmer1, '/reviews').some(item => item.plot_id === plotOf2.id), 'farmer cannot see another farmer reviews');
  expectDemoError(() => backend.request(farmer1, '/activities', 'POST', { plot_id: backend.request(farmer1, '/plots')[0].id, kind: 'x', details: 'y', activity_date: 'bad' }), 400);
  expectDemoError(() => backend.request(farmer1, '/activities', 'POST', { plot_id: backend.request(farmer1, '/plots')[0].id, kind: 'x', details: 'y', activity_date: '2026-10-01', photo_url: 'http://insecure.example' }), 400);
});

test('demo data persists across backend instances (role switch / reload) and can be reset', () => {
  const { storage, backend } = setup();
  const farmer = backend.login('farmer', 'F-STG-006');
  const { id } = backend.request(farmer, '/plots', 'POST', { name: 'แปลงคงอยู่', crop: 'พริก' });

  const reloaded = Demo.createDemoBackend({ storage, now: fixedNow });
  const ics = reloaded.login('ics', 'ICS-STG-002');
  assert.ok(reloaded.request(ics, '/plots').some(plot => plot.id === id && plot.name === 'แปลงคงอยู่'));

  reloaded.reset();
  assert.ok(!backend.request(farmer, '/plots').some(plot => plot.id === id), 'reset restores seed data');
  storage.setItem(Demo.STORAGE_KEY, '{corrupted');
  assert.ok(backend.request(farmer, '/plots').length >= 1, 'corrupted demo data is re-seeded');
});

test('demo store is isolated: no network, no tokens, separate storage key', () => {
  assert.doesNotMatch(demoSource, /\bfetch\s*\(|XMLHttpRequest|Authorization|sendBeacon|WebSocket/);
  assert.doesNotMatch(demoSource, /\.innerHTML\b|insertAdjacentHTML|document\.write|\beval\s*\(|new Function/);
  assert.match(Demo.STORAGE_KEY, /^rtg-demo-/);
  assert.match(html, /<script defer src="\/demo\.js"><\/script>\s*<script defer src="\/app\.js"><\/script>/);
});

test('login UI is demo-first with Farmer/ICS choice, Demo button and small Admin Login', () => {
  for (const text of ['เข้าสู่ระบบทดลองใช้งาน', 'รหัสประจำตัว Demo', 'เข้าสู่ระบบ Demo', 'Admin Login', "roleButton('farmer'", "roleButton('ics'"]) {
    assert.ok(appSource.includes(text), text);
  }
  assert.match(appSource, /id: 'adminLoginButton', className: 'link-btn'/);
  assert.match(appSource, /development \? showAdminLogin\(true\) : adminLineLogin\(\)/);
  // demo requests short-circuit before any fetch/Authorization header is built
  const apiBody = appSource.slice(appSource.indexOf('async function api('));
  assert.ok(apiBody.indexOf('if (demoUser) return demoBackend.request') < apiBody.indexOf('fetch('));
  // logout clears demo session and token, then returns to the main login page
  assert.match(appSource, /function clearSession\(\) \{[^}]*demoUser = null[^}]*demoSession\?\.logout\(\)/s);
  assert.match(appSource, /async function acceptLogin\(data\) \{\s*demoUser = null;/);
  // LINE flow resumes only after explicit Admin Login
  assert.match(appSource, /sessionStorage\.setItem\('admin_login', '1'\)/);
  assert.match(appSource, /sessionStorage\.getItem\('admin_login'\) !== '1'\) return showLogin/);
});

test('backend has no demo login and rejects demo codes as bearer credentials', async () => {
  const env = { DB: {}, LIFF_ID: '', LINE_CHANNEL_ID: 'x', AGENCY_CODE_HMAC_KEYS: '' };
  const demoLogin = await handleApi(new Request('https://staging.example/api/demo/login', { method: 'POST', body: JSON.stringify({ agencyCode: 'F-STG-001', role: 'farmer' }), headers: { 'content-type': 'application/json' } }), env);
  assert.equal(demoLogin.status, 404);
  for (const code of ['F-STG-001', 'ICS-STG-001', 'ADMIN-STG-001']) {
    for (const path of ['/api/me', '/api/admin/users', '/api/admin/invites']) {
      const response = await handleApi(new Request(`https://staging.example${path}`, { headers: { authorization: `Bearer ${code}` } }), env);
      assert.equal(response.status, 401, `${code} ${path}`);
    }
  }
});
