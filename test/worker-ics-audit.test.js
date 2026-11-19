import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Miniflare } from 'miniflare';
import worker from '../worker/index.js';
import { agencyCodeDigests } from '../worker/auth.js';

const primaryKey = Buffer.alloc(32, 47).toString('base64url');
const keyRing = `v1:${primaryKey}`;
const pngBytes = Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);

let mf;
let db;
let r2Store;
let adminToken;
let ics1Token;
let ics2Token;
let farmer1Token;
let farmer1Id;
let farmer1PlotId;
let farmer2PlotId;

function makeMemoryR2(store) {
  return {
    async put(key, value, opts = {}) {
      const bytes = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(await new Response(value).arrayBuffer());
      store.set(key, { bytes, httpMetadata: opts.httpMetadata || {}, customMetadata: opts.customMetadata || {} });
    },
    async get(key) {
      const item = store.get(key);
      if (!item) return null;
      return { body: item.bytes, size: item.bytes.byteLength, httpMetadata: item.httpMetadata };
    },
    async delete(key) { store.delete(key); },
  };
}

const lineDirectory = {
  'tok-adm-ics3': 'line-adm-ics3',
  'tok-ics1-3': 'line-ics1-3',
  'tok-ics2-3': 'line-ics2-3',
  'tok-f1-3': 'line-f1-3',
  'tok-f2-3': 'line-f2-3',
};

const env = () => ({
  DB: db,
  ENVIRONMENT: 'staging',
  LINE_CHANNEL_ID: 'ics3-channel',
  AGENCY_CODE_HMAC_KEYS: keyRing,
  EVIDENCE_BUCKET: makeMemoryR2(r2Store),
  LINE_VERIFY: {
    async fetch(request) {
      const form = new URLSearchParams(await request.text());
      const sub = lineDirectory[form.get('id_token')];
      if (!sub || form.get('client_id') !== 'ics3-channel') return new Response('{}', { status: 401 });
      return Response.json({ sub });
    },
  },
  ASSETS: { async fetch() { return new Response('ok'); } },
});

async function callWorker(pathname, { method = 'GET', token, body, headers = {} } = {}) {
  const reqHeaders = { 'cf-connecting-ip': '198.51.100.88', ...headers };
  if (token) reqHeaders.authorization = `Bearer ${token}`;
  let reqBody = body;
  if (body !== undefined && !(body instanceof Uint8Array) && !Buffer.isBuffer(body)) {
    reqHeaders['content-type'] = 'application/json';
    reqBody = JSON.stringify(body);
  }
  const res = await worker.fetch(new Request(`https://audit.ready-to-grow.test${pathname}`, {
    method,
    headers: reqHeaders,
    body: reqBody,
  }), env());
  return { status: res.status, body: await res.json().catch(() => null) };
}

before(async () => {
  r2Store = new Map();
  mf = new Miniflare({
    workers: [{
      config: {
        name: 'worker-ics-audit-test',
        compatibilityDate: '2025-10-11',
        compatibilityFlags: ['nodejs_compat'],
        manifest: {
          mainModule: 'index.js',
          modulesRoot: path.resolve('.'),
          modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } },
        },
        env: { DB: { type: 'd1', name: 'worker-ics-audit-test' } },
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
    '0006_ready_to_grow_features.sql',
    '0007_photo_evidence.sql',
    '0008_ics_audit_assistant.sql',
  ]) {
    const sql = fs.readFileSync(new URL(`../d1/migrations/${file}`, import.meta.url), 'utf8')
      .replace(/--[^\r\n]*/g, '')
      .replace(/\s+/g, ' ');
    await db.exec(sql);
  }

  await db.prepare("INSERT INTO users(id,line_id,name,role,status,linked_at) VALUES(1,'line-adm-ics3','Admin','admin','active',CURRENT_TIMESTAMP)").run();
  const [adminDigest] = await agencyCodeDigests('ADMIN-001', keyRing);
  await db.prepare('INSERT INTO agency_credentials(user_id,key_version,code_digest,code_hint) VALUES(1,?,?,?)').bind(adminDigest.version, adminDigest.digest, 'ADMIN-001').run();
  adminToken = (await callWorker('/api/login', { method: 'POST', body: { idToken: 'tok-adm-ics3' } })).body.token;

  const setupAccount = async (name, role, code, tok) => {
    const u = (await callWorker('/api/admin/users', { method: 'POST', token: adminToken, body: { name, role, agencyCode: code } })).body;
    const inv = (await callWorker('/api/admin/invites', { method: 'POST', token: adminToken, body: { targetUserId: u.id } })).body;
    const red = (await callWorker('/api/auth/register/invite', { method: 'POST', body: { agencyCode: code, invitationToken: inv.invitationToken, idToken: tok } })).body;
    return { id: u.id, token: red.token };
  };

  const ics1 = await setupAccount('ICS Officer A', 'ics', 'ICS-A3-01', 'tok-ics1-3');
  const ics2 = await setupAccount('ICS Officer B', 'ics', 'ICS-A3-02', 'tok-ics2-3');
  const f1 = await setupAccount('Farmer One', 'farmer', 'F-A3-01', 'tok-f1-3');
  const f2 = await setupAccount('Farmer Two', 'farmer', 'F-A3-02', 'tok-f2-3');
  ics1Token = ics1.token;
  ics2Token = ics2.token;
  farmer1Token = f1.token;
  farmer1Id = f1.id;

  await callWorker('/api/admin/assignments', { method: 'POST', token: adminToken, body: { icsUserId: ics1.id, farmerUserId: f1.id } });
  await callWorker('/api/admin/assignments', { method: 'POST', token: adminToken, body: { icsUserId: ics2.id, farmerUserId: f2.id } });

  farmer1PlotId = (await callWorker('/api/plots', { method: 'POST', token: farmer1Token, body: { name: 'แปลง A-01', crop: 'ข้าวหอมมะลิ', area: '3 ไร่' } })).body.id;
  farmer2PlotId = (await callWorker('/api/plots', { method: 'POST', token: f2.token, body: { name: 'แปลง B-02', crop: 'ถั่วเหลือง', area: '2 ไร่' } })).body.id;
});

after(async () => mf?.dispose());

test('seeded checklists keep PGS, EU_ORGANIC, FAIRTRADE separate and draft_unvalidated; Admin validates while ICS cannot', async () => {
  assert.equal((await callWorker('/api/checklists', { token: farmer1Token })).status, 403);

  const listRes = await callWorker('/api/checklists', { token: ics1Token });
  assert.equal(listRes.status, 200);
  const codes = listRes.body.map(c => c.standard_code);
  assert.ok(codes.includes('PGS'));
  assert.ok(codes.includes('EU_ORGANIC'));
  assert.ok(codes.includes('FAIRTRADE'));
  assert.ok(listRes.body.every(c => c.validation_status === 'draft_unvalidated'));

  // ICS trying to create a pre-validated checklist is forbidden
  const icsTryValidated = await callWorker('/api/checklists', {
    method: 'POST',
    token: ics1Token,
    body: {
      standard_code: 'PGS',
      title: 'พยายามยืนยันเอง',
      items: [{ label: 'ตรวจแนวกันชน', required: true }],
      validation_status: 'validated',
    },
  });
  assert.equal(icsTryValidated.status, 403);

  // ICS creates draft checklist
  const createRes = await callWorker('/api/checklists', {
    method: 'POST',
    token: ics1Token,
    body: {
      standard_code: 'EU_ORGANIC',
      title: 'ตรวจจุดแยกเก็บผลผลิต EU Organic',
      description: 'ทดสอบร่าง',
      items: [{ key: 'storage_sep', label: 'แยกยุ้งฉางเก็บผลผลิต', required: true }],
    },
  });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.validation_status, 'draft_unvalidated');
  const createdChecklistId = createRes.body.id;

  // ICS cannot validate via PATCH either
  const icsPatchVal = await callWorker(`/api/checklists/${createdChecklistId}`, {
    method: 'PATCH',
    token: ics1Token,
    body: { validation_status: 'validated' },
  });
  assert.equal(icsPatchVal.status, 403);

  // Admin validates the checklist
  const adminVal = await callWorker(`/api/checklists/${createdChecklistId}`, {
    method: 'PATCH',
    token: adminToken,
    body: { validation_status: 'validated' },
  });
  assert.equal(adminVal.status, 200);
  assert.equal(adminVal.body.validation_status, 'validated');
});

test('reviews with checklist_results & findings create linked CAPA, enforce standard matching, and write audit_logs', async () => {
  const euList = (await callWorker('/api/checklists?standard_code=EU_ORGANIC', { token: ics1Token })).body;
  const euChecklistId = euList[0].id;

  // Mixing PGS standard_code with an EU_ORGANIC checklist must fail 400
  const mismatchRes = await callWorker('/api/reviews', {
    method: 'POST',
    token: ics1Token,
    body: {
      plot_id: farmer1PlotId,
      standard_code: 'PGS',
      checklist_id: euChecklistId,
      result: 'ผ่าน',
      note: 'ทดสอบปนมาตรฐาน',
    },
  });
  assert.equal(mismatchRes.status, 400);

  const dueSoon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const revRes = await callWorker('/api/reviews', {
    method: 'POST',
    token: ics1Token,
    body: {
      plot_id: farmer1PlotId,
      standard_code: 'EU_ORGANIC',
      checklist_id: euChecklistId,
      checklist_results: [
        { key: 'eu_conversion_period', label: 'ตรวจระยะปรับเปลี่ยน', status: 'pass', note: 'บันทึกครบ' },
        { key: 'eu_segregation', label: 'แยกเครื่องมือ', status: 'fail', note: 'ใช้ถังพ่นร่วมกัน' },
      ],
      result: 'ต้องแก้ไข',
      note: 'พบการใช้ภาชนะร่วมกับแปลงข้างเคียง',
      findings: [
        {
          severity: 'high',
          finding: 'ใช้ถังฉีดพ่นน้ำหมักร่วมกับเครื่องมือภายนอก',
          action_required: 'จัดหาถังแยกเฉพาะแปลงอินทรีย์และทำป้ายกำกับ',
          due_date: dueSoon,
        },
      ],
    },
  });
  assert.equal(revRes.status, 201);
  assert.equal(revRes.body.standard_code, 'EU_ORGANIC');
  assert.equal(revRes.body.corrective_action_ids.length, 1);

  const listRev = await callWorker('/api/reviews', { token: ics1Token });
  assert.equal(listRev.status, 200);
  const createdReview = listRev.body.find(r => r.id === revRes.body.id);
  assert.equal(createdReview.standard_code, 'EU_ORGANIC');
  assert.equal(createdReview.checklist_results.length, 2);
  assert.equal(createdReview.open_actions_count, 1);
  assert.equal(createdReview.total_actions_count, 1);

  const logsRes = await callWorker('/api/audit-logs', { token: ics1Token });
  assert.equal(logsRes.status, 200);
  const eventTypes = logsRes.body.map(l => l.event_type);
  assert.ok(eventTypes.includes('review.created'));
  assert.ok(eventTypes.includes('corrective_action.created'));
  assert.equal((await callWorker('/api/audit-logs', { token: farmer1Token })).status, 403);
});

test('corrective actions enforce RBAC, assignment isolation, and resolution note before closing', async () => {
  const pastDue = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  const createRes = await callWorker('/api/corrective-actions', {
    method: 'POST',
    token: ics1Token,
    body: {
      plot_id: farmer1PlotId,
      standard_code: 'FAIRTRADE',
      severity: 'medium',
      finding: 'ยังไม่มีบันทึกการประชุมสมาชิกกลุ่มประจำเดือน',
      action_required: 'แนบบันทึกการประชุมและลายมือชื่อสมาชิก',
      due_date: pastDue,
    },
  });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.is_overdue, true);
  assert.equal(createRes.body.standard_code, 'FAIRTRADE');
  const actionId = createRes.body.id;

  // Farmer and unassigned ICS-2 are forbidden
  assert.equal((await callWorker('/api/corrective-actions', { token: farmer1Token })).status, 403);
  assert.equal((await callWorker(`/api/corrective-actions/${actionId}`, {
    method: 'PATCH',
    token: ics2Token,
    body: { status: 'in_progress' },
  })).status, 403);
  assert.equal((await callWorker('/api/corrective-actions', {
    method: 'POST',
    token: ics2Token,
    body: { plot_id: farmer1PlotId, finding: 'hack', action_required: 'x', due_date: pastDue },
  })).status, 403);

  // ICS-2 list does not include ICS-1's CAPA
  const ics2List = await callWorker('/api/corrective-actions', { token: ics2Token });
  assert.equal(ics2List.status, 200);
  assert.ok(!ics2List.body.some(ca => ca.plot_id === farmer1PlotId));

  // Closing without resolution_note fails 400
  const closeNoNote = await callWorker(`/api/corrective-actions/${actionId}`, {
    method: 'PATCH',
    token: ics1Token,
    body: { status: 'resolved', resolution_note: '' },
  });
  assert.equal(closeNoNote.status, 400);

  // Move to in_progress then resolved with note
  const inProgRes = await callWorker(`/api/corrective-actions/${actionId}`, {
    method: 'PATCH',
    token: ics1Token,
    body: { status: 'in_progress', resolution_note: 'นัดเกษตรกรส่งเอกสารสัปดาห์นี้' },
  });
  assert.equal(inProgRes.status, 200);
  assert.equal(inProgRes.body.status, 'in_progress');
  assert.equal(inProgRes.body.resolved_at, null);

  const resolvedRes = await callWorker(`/api/corrective-actions/${actionId}`, {
    method: 'PATCH',
    token: ics1Token,
    body: { status: 'resolved', resolution_note: 'เกษตรกรส่งเอกสารครบถ้วนแล้ว' },
  });
  assert.equal(resolvedRes.status, 200);
  assert.equal(resolvedRes.body.status, 'resolved');
  assert.equal(resolvedRes.body.is_overdue, false);
  assert.ok(resolvedRes.body.resolved_at);

  const logsRes = await callWorker('/api/audit-logs', { token: ics1Token });
  assert.ok(logsRes.body.some(l => l.event_type === 'corrective_action.updated' && l.target_id === String(actionId)));
});

test('enhanced /api/risks detects inactive, pending, missing_evidence (cleared once photo linked), overdue_action, and open_action', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const pastDue = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);

  // Create overdue CAPA on plot 1 & pending approval on plot 1 & activity WITHOUT photo on plot 1
  const overdueCa = await callWorker('/api/corrective-actions', {
    method: 'POST',
    token: ics1Token,
    body: {
      plot_id: farmer1PlotId,
      standard_code: 'PGS',
      severity: 'medium',
      finding: 'ป้ายแปลงชำรุด',
      action_required: 'ซ่อมแซมป้ายรหัสแปลง',
      due_date: pastDue,
    },
  });
  assert.equal(overdueCa.status, 201);

  assert.equal((await callWorker('/api/approvals', {
    method: 'POST',
    token: farmer1Token,
    body: { plot_id: farmer1PlotId, input_name: 'ปุ๋ยหมักทดสอบ', details: 'หมักจากมูลวัวอินทรีย์' },
  })).status, 201);

  const actNoPhoto = await callWorker('/api/activities', {
    method: 'POST',
    token: farmer1Token,
    body: { plot_id: farmer1PlotId, kind: 'ใส่ปุ๋ย', details: 'หว่านปุ๋ยหมักรอบแรก', activity_date: today },
  });
  assert.equal(actNoPhoto.status, 201);

  // Also farmer 1 adds a 2nd plot with NO recent activity (inactive)
  const plotInactiveRes = await callWorker('/api/plots', {
    method: 'POST',
    token: farmer1Token,
    body: { name: 'แปลง A-02 ว่างบันทึก', crop: 'ปอเทือง', area: '1 ไร่' },
  });
  const inactivePlotId = plotInactiveRes.body.id;

  const risks1 = await callWorker('/api/risks', { token: ics1Token });
  assert.equal(risks1.status, 200);
  const types = new Set(risks1.body.map(r => r.type));
  assert.ok(types.has('overdue_action'), 'must detect overdue_action');
  assert.ok(types.has('open_action'), 'must detect open_action from earlier review');
  assert.ok(types.has('pending'), 'must detect pending approval');
  assert.ok(types.has('missing_evidence'), 'must detect missing_evidence on activity without photo');
  assert.ok(types.has('inactive'), 'must detect inactive plot');
  // Never leaks ICS-2 plot B-02
  assert.ok(!risks1.body.some(r => r.plot_id === farmer2PlotId));

  // Verify every risk item has severity + explanation
  for (const r of risks1.body) {
    assert.ok(['high', 'medium', 'low'].includes(r.severity));
    assert.ok(typeof r.explanation === 'string' && r.explanation.length > 0);
  }

  // Now attach photo evidence directly to the activity and verify missing_evidence clears for plot 1!
  const evRes = await callWorker(`/api/evidence?plot_id=${farmer1PlotId}&entity_type=activity&entity_id=${actNoPhoto.body.id}`, {
    method: 'POST',
    token: farmer1Token,
    body: pngBytes,
    headers: { 'content-type': 'image/png' },
  });
  assert.equal(evRes.status, 201);

  // Also record an activity with photo on inactivePlotId to ensure tests cover clearing inactive vs missing_evidence cleanly
  const risksAfter = await callWorker('/api/risks', { token: ics1Token });
  assert.ok(!risksAfter.body.some(r => r.type === 'missing_evidence' && r.plot_id === farmer1PlotId),
    'missing_evidence must clear once all recent activities have photo evidence');
  assert.ok(risksAfter.body.some(r => r.type === 'inactive' && r.plot_id === inactivePlotId));

  // Suppress unused variable lint mentally: farmer1Id used for sanity
  assert.ok(farmer1Id > 0);
});
