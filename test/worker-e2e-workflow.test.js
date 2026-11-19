import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Miniflare } from 'miniflare';
import worker from '../worker/index.js';
import { agencyCodeDigests } from '../worker/auth.js';

const primaryKey = Buffer.alloc(32, 31).toString('base64url');
const keyRing = `v1:${primaryKey}`;
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

let mf;
let db;
let adminToken;

const lineDirectory = {
  'tok-admin': 'line-admin-e2e',
  'tok-ics-1': 'line-ics-1-e2e',
  'tok-ics-2': 'line-ics-2-e2e',
  'tok-farmer-1': 'line-farmer-1-e2e',
  'tok-farmer-2': 'line-farmer-2-e2e',
};

const env = () => ({
  DB: db,
  ENVIRONMENT: 'staging',
  LINE_CHANNEL_ID: 'e2e-channel',
  AGENCY_CODE_HMAC_KEYS: keyRing,
  LINE_VERIFY: {
    async fetch(request) {
      const form = new URLSearchParams(await request.text());
      const sub = lineDirectory[form.get('id_token')];
      if (!sub || form.get('client_id') !== 'e2e-channel') return new Response('{}', { status: 401 });
      return Response.json({ sub });
    },
  },
  ASSETS: {
    async fetch() { return new Response('ok'); },
  },
});

async function api(pathname, { method = 'GET', token, body, ip = '198.51.100.55' } = {}) {
  const headers = { 'cf-connecting-ip': ip };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await worker.fetch(new Request(`https://e2e.ready-to-grow.test${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env());
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
}

before(async () => {
  mf = new Miniflare({
    workers: [{
      config: {
        name: 'worker-e2e-workflow-test',
        compatibilityDate: '2025-10-11',
        compatibilityFlags: ['nodejs_compat'],
        manifest: {
          mainModule: 'index.js',
          modulesRoot: path.resolve('.'),
          modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } },
        },
        env: { DB: { type: 'd1', name: 'worker-e2e-workflow-test' } },
      },
    }],
  });
  db = await mf.getD1Database('DB');
  for (const file of [
    '0001_initial_schema.sql',
    '0002_phase3_mutation_guards_and_indexes.sql',
    '0003_auth_rate_limits.sql',
    '0004_admin_line_identity_operations.sql',
    '0005_admin_identity_audit_actor.sql',
  ]) {
    const sql = fs.readFileSync(new URL(`../d1/migrations/${file}`, import.meta.url), 'utf8')
      .replace(/--[^\r\n]*/g, '')
      .replace(/\s+/g, ' ');
    await db.exec(sql);
  }

  // Seed linked Admin
  await db.prepare("INSERT INTO users(id,line_id,name,role,status,linked_at) VALUES(1,'line-admin-e2e','System Admin','admin','active',CURRENT_TIMESTAMP)").run();
  const [adminDigest] = await agencyCodeDigests('ADMIN-001', keyRing);
  await db.prepare('INSERT INTO agency_credentials(user_id,key_version,code_digest,code_hint) VALUES(1,?,?,?)').bind(adminDigest.version, adminDigest.digest, 'ADMIN-001').run();
  const loginRes = await api('/api/login', { method: 'POST', body: { idToken: 'tok-admin' } });
  assert.equal(loginRes.status, 200);
  adminToken = loginRes.body.token;
});

after(async () => mf?.dispose());

test('End-to-End Farmer -> ICS -> Admin -> Lot Traceability & RBAC on Worker + D1', async () => {
  // 1. Admin creates ICS1, ICS2, Farmer1, Farmer2 and invites them
  const createAndRedeem = async (name, role, code, idToken) => {
    const uRes = await api('/api/admin/users', { method: 'POST', token: adminToken, body: { name, role, agencyCode: code } });
    assert.equal(uRes.status, 201);
    const invRes = await api('/api/admin/invites', { method: 'POST', token: adminToken, body: { targetUserId: uRes.body.id } });
    assert.equal(invRes.status, 201);
    const redRes = await api('/api/auth/register/invite', {
      method: 'POST',
      body: { agencyCode: code, invitationToken: invRes.body.invitationToken, idToken },
    });
    assert.equal(redRes.status, 200);
    return { id: uRes.body.id, token: redRes.body.token };
  };

  const ics1 = await createAndRedeem('ICS Officer 1', 'ics', 'ICS-E2E-01', 'tok-ics-1');
  const ics2 = await createAndRedeem('ICS Officer 2', 'ics', 'ICS-E2E-02', 'tok-ics-2');
  const farmer1 = await createAndRedeem('Farmer 1', 'farmer', 'F-E2E-01', 'tok-farmer-1');
  const farmer2 = await createAndRedeem('Farmer 2', 'farmer', 'F-E2E-02', 'tok-farmer-2');

  // 2. Admin assigns Farmer1 -> ICS1 and Farmer2 -> ICS2
  assert.equal((await api('/api/admin/assignments', { method: 'POST', token: adminToken, body: { icsUserId: ics1.id, farmerUserId: farmer1.id } })).status, 201);
  assert.equal((await api('/api/admin/assignments', { method: 'POST', token: adminToken, body: { icsUserId: ics2.id, farmerUserId: farmer2.id } })).status, 201);

  // 3. Farmer 1 creates plot, updates it, records activity, and submits 2 approval requests
  const plotRes = await api('/api/plots', { method: 'POST', token: farmer1.token, body: { name: 'แปลงนา A-01', crop: 'ข้าวหอมมะลิ 105', area: '3 ไร่' } });
  assert.equal(plotRes.status, 201);
  const plotId = plotRes.body.id;

  const patchPlot = await api(`/api/plots/${plotId}`, { method: 'PATCH', token: farmer1.token, body: { area: '3.5 ไร่' } });
  assert.equal(patchPlot.status, 200);
  assert.equal(patchPlot.body.area, '3.5 ไร่');

  const today = new Date().toISOString().slice(0, 10);
  const actRes = await api('/api/activities', {
    method: 'POST',
    token: farmer1.token,
    body: { plot_id: plotId, kind: 'ใส่ปุ๋ย', details: 'ปล่อยแหนแดงบำรุงดิน', activity_date: today, photo_url: '' },
  });
  assert.equal(actRes.status, 201);

  const app1 = await api('/api/approvals', { method: 'POST', token: farmer1.token, body: { plot_id: plotId, input_name: 'ปุ๋ยเคมีต้องห้าม', details: 'ทดสอบคำขอที่ต้องไม่อนุมัติ' } });
  assert.equal(app1.status, 201);
  const app2 = await api('/api/approvals', { method: 'POST', token: farmer1.token, body: { plot_id: plotId, input_name: 'น้ำหมักหน่อกล้วย', details: 'หมักชีวภาพตามสูตรกลุ่ม' } });
  assert.equal(app2.status, 201);

  // 4. Cross-farmer & cross-ICS isolation + RBAC enforcement
  assert.equal((await api('/api/plots', { token: farmer2.token })).body.length, 0);
  assert.equal((await api(`/api/plots/${plotId}`, { method: 'PATCH', token: farmer2.token, body: { area: 'hack' } })).status, 403);
  assert.equal((await api('/api/risks', { token: farmer1.token })).status, 403);
  assert.equal((await api('/api/reviews', { token: farmer1.token })).status, 403);
  assert.equal((await api('/api/admin/users', { token: farmer1.token })).status, 403);
  assert.equal((await api('/api/admin/users', { token: ics1.token })).status, 403);
  assert.equal((await api('/api/plots', { method: 'POST', token: ics1.token, body: { name: 'x', crop: 'y' } })).status, 403);
  assert.equal((await api('/api/plots', { method: 'POST', token: adminToken, body: { name: 'x', crop: 'y' } })).status, 403);

  // ICS 2 cannot access or review Farmer 1's plots/approvals
  assert.equal((await api('/api/plots', { token: ics2.token })).body.length, 0);
  assert.equal((await api(`/api/approvals/${app1.body.id}`, { method: 'PATCH', token: ics2.token, body: { status: 'approved' } })).status, 403);
  assert.equal((await api('/api/reviews', { method: 'POST', token: ics2.token, body: { plot_id: plotId, result: 'ผ่าน', note: 'ข้ามสายงาน' } })).status, 403);

  // 5. ICS 1 inspects /risks, rejects app1 (requires comment!), approves app2, and creates inspection review
  const risks = await api('/api/risks', { token: ics1.token });
  assert.equal(risks.status, 200);
  assert.equal(risks.body.filter(r => r.type === 'pending').length, 2);

  // Reject without comment must return 400
  const rejectNoComment = await api(`/api/approvals/${app1.body.id}`, { method: 'PATCH', token: ics1.token, body: { status: 'rejected', comment: '' } });
  assert.equal(rejectNoComment.status, 400);

  // Reject with comment succeeds and blocks repeat decision
  const rejectOk = await api(`/api/approvals/${app1.body.id}`, { method: 'PATCH', token: ics1.token, body: { status: 'rejected', comment: 'ไม่อนุญาตให้ใช้สารเคมีในแปลงอินทรีย์' } });
  assert.equal(rejectOk.status, 200);
  const repeatDecision = await api(`/api/approvals/${app1.body.id}`, { method: 'PATCH', token: ics1.token, body: { status: 'approved' } });
  assert.equal(repeatDecision.status, 404);

  const approveOk = await api(`/api/approvals/${app2.body.id}`, { method: 'PATCH', token: ics1.token, body: { status: 'approved', comment: 'อนุมัติตามเกณฑ์ PGS' } });
  assert.equal(approveOk.status, 200);

  const revRes = await api('/api/reviews', { method: 'POST', token: ics1.token, body: { plot_id: plotId, result: 'ผ่าน', note: 'แนวกันชนเรียบร้อย บันทึกต่อเนื่อง' } });
  assert.equal(revRes.status, 201);
  const revList = await api('/api/reviews', { token: ics1.token });
  assert.equal(revList.status, 200);
  assert.equal(revList.body.length, 1);

  // 6. Farmer 1 creates lot & duplicate lot code returns 409
  const lot1 = await api('/api/lots', { method: 'POST', token: farmer1.token, body: { plot_id: plotId, code: 'LOT-E2E-001', crop: 'ข้าวหอมมะลิ 105', harvest_date: today, quantity: 250 } });
  assert.equal(lot1.status, 201);
  const lotDup = await api('/api/lots', { method: 'POST', token: farmer1.token, body: { plot_id: plotId, code: 'LOT-E2E-001', crop: 'ข้าวหอมมะลิ 105', harvest_date: today, quantity: 100 } });
  assert.equal(lotDup.status, 409);

  // 7. Admin inspects real users & assignments + verify immutable audit logs
  const usersRes = await api('/api/admin/users', { token: adminToken });
  assert.equal(usersRes.status, 200);
  assert.equal(usersRes.body.length, 5);
  const assignRes = await api('/api/admin/assignments', { token: adminToken });
  assert.equal(assignRes.status, 200);
  assert.equal(assignRes.body.length, 2);

  const auditRows = await db.prepare("SELECT event_type, actor_user_id FROM audit_logs WHERE event_type IN ('approval.reviewed','review.created') ORDER BY id").all();
  assert.equal(auditRows.results.length, 3);
  assert.deepEqual(auditRows.results.map(r => r.event_type), ['approval.reviewed', 'approval.reviewed', 'review.created']);
});
