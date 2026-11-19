import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Miniflare } from 'miniflare';
import worker from '../worker/index.js';
import { agencyCodeDigests } from '../worker/auth.js';
import { createLocalEvidenceStorage } from '../lib/evidence-storage.js';

const primaryKey = Buffer.alloc(32, 41).toString('base64url');
const keyRing = `v1:${primaryKey}`;

// Minimal valid magic-byte payloads
const jpegBytes = Uint8Array.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 0x4A, 0x46, 0x49, 0x46, 0, 1, 1, 1, 0, 1]);
const pngBytes = Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const webpBytes = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 20, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
const svgSpoofBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

let mf;
let db;
let r2Store;
let adminToken;
let ics1Token;
let ics2Token;
let farmer1Token;
let farmer2Token;
let farmer1PlotId;
let tempEvidenceDir;

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
    async delete(key) {
      store.delete(key);
    },
  };
}

const lineDirectory = {
  'tok-adm': 'line-adm-ev',
  'tok-ics1': 'line-ics1-ev',
  'tok-ics2': 'line-ics2-ev',
  'tok-f1': 'line-f1-ev',
  'tok-f2': 'line-f2-ev',
};

const env = ({ withBucket = true } = {}) => ({
  DB: db,
  ENVIRONMENT: 'staging',
  LINE_CHANNEL_ID: 'ev-channel',
  AGENCY_CODE_HMAC_KEYS: keyRing,
  ...(withBucket ? { EVIDENCE_BUCKET: makeMemoryR2(r2Store) } : {}),
  LINE_VERIFY: {
    async fetch(request) {
      const form = new URLSearchParams(await request.text());
      const sub = lineDirectory[form.get('id_token')];
      if (!sub || form.get('client_id') !== 'ev-channel') return new Response('{}', { status: 401 });
      return Response.json({ sub });
    },
  },
  ASSETS: { async fetch() { return new Response('ok'); } },
});

async function callWorker(pathname, { method = 'GET', token, body, headers = {}, withBucket = true } = {}) {
  const reqHeaders = { 'cf-connecting-ip': '198.51.100.77', ...headers };
  if (token) reqHeaders.authorization = `Bearer ${token}`;
  let reqBody = body;
  if (body && !(body instanceof Uint8Array) && !Buffer.isBuffer(body)) {
    reqHeaders['content-type'] = 'application/json';
    reqBody = JSON.stringify(body);
  }
  return worker.fetch(new Request(`https://evidence.ready-to-grow.test${pathname}`, {
    method,
    headers: reqHeaders,
    body: reqBody,
  }), env({ withBucket }));
}

before(async () => {
  r2Store = new Map();
  tempEvidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pakmaii-evidence-'));
  mf = new Miniflare({
    workers: [{
      config: {
        name: 'worker-photo-evidence-test',
        compatibilityDate: '2025-10-11',
        compatibilityFlags: ['nodejs_compat'],
        manifest: {
          mainModule: 'index.js',
          modulesRoot: path.resolve('.'),
          modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } },
        },
        env: { DB: { type: 'd1', name: 'worker-photo-evidence-test' } },
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
  ]) {
    const sql = fs.readFileSync(new URL(`../d1/migrations/${file}`, import.meta.url), 'utf8')
      .replace(/--[^\r\n]*/g, '')
      .replace(/\s+/g, ' ');
    await db.exec(sql);
  }

  await db.prepare("INSERT INTO users(id,line_id,name,role,status,linked_at) VALUES(1,'line-adm-ev','Admin','admin','active',CURRENT_TIMESTAMP)").run();
  const [adminDigest] = await agencyCodeDigests('ADMIN-001', keyRing);
  await db.prepare('INSERT INTO agency_credentials(user_id,key_version,code_digest,code_hint) VALUES(1,?,?,?)').bind(adminDigest.version, adminDigest.digest, 'ADMIN-001').run();
  adminToken = (await (await callWorker('/api/login', { method: 'POST', body: { idToken: 'tok-adm' } })).json()).token;

  const setupAccount = async (name, role, code, tok) => {
    const u = await (await callWorker('/api/admin/users', { method: 'POST', token: adminToken, body: { name, role, agencyCode: code } })).json();
    const inv = await (await callWorker('/api/admin/invites', { method: 'POST', token: adminToken, body: { targetUserId: u.id } })).json();
    const red = await (await callWorker('/api/auth/register/invite', { method: 'POST', body: { agencyCode: code, invitationToken: inv.invitationToken, idToken: tok } })).json();
    return { id: u.id, token: red.token };
  };

  const ics1 = await setupAccount('ICS 1', 'ics', 'ICS-EV-01', 'tok-ics1');
  const ics2 = await setupAccount('ICS 2', 'ics', 'ICS-EV-02', 'tok-ics2');
  const f1 = await setupAccount('Farmer 1', 'farmer', 'F-EV-01', 'tok-f1');
  const f2 = await setupAccount('Farmer 2', 'farmer', 'F-EV-02', 'tok-f2');
  ics1Token = ics1.token;
  ics2Token = ics2.token;
  farmer1Token = f1.token;
  farmer2Token = f2.token;

  await callWorker('/api/admin/assignments', { method: 'POST', token: adminToken, body: { icsUserId: ics1.id, farmerUserId: f1.id } });
  await callWorker('/api/admin/assignments', { method: 'POST', token: adminToken, body: { icsUserId: ics2.id, farmerUserId: f2.id } });

  const pRes = await callWorker('/api/plots', { method: 'POST', token: farmer1Token, body: { name: 'แปลง EV-1', crop: 'ข้าวอินทรีย์', area: '2 ไร่' } });
  farmer1PlotId = (await pRes.json()).id;
});

after(async () => {
  await mf?.dispose();
  if (tempEvidenceDir) fs.rmSync(tempEvidenceDir, { recursive: true, force: true });
});

test('/api/config reflects evidenceUploadEnabled and missing R2 binding fails closed with 503', async () => {
  const cfgOn = await (await callWorker('/api/config', { withBucket: true })).json();
  assert.equal(cfgOn.evidenceUploadEnabled, true);
  const cfgOff = await (await callWorker('/api/config', { withBucket: false })).json();
  assert.equal(cfgOff.evidenceUploadEnabled, false);

  const res503 = await callWorker(`/api/evidence?plot_id=${farmer1PlotId}&entity_type=activity`, {
    method: 'POST',
    token: farmer1Token,
    body: jpegBytes,
    headers: { 'content-type': 'image/jpeg' },
    withBucket: false,
  });
  assert.equal(res503.status, 503);
  const errBody = await res503.json();
  assert.equal(errBody.code, 'EVIDENCE_STORAGE_UNAVAILABLE');
});

test('Rejects spoofed MIME (415), empty payload (400), >5MB payload (413), and unauthenticated access (401)', async () => {
  const unauth = await callWorker(`/api/evidence?plot_id=${farmer1PlotId}&entity_type=activity`, {
    method: 'POST',
    body: jpegBytes,
    headers: { 'content-type': 'image/jpeg' },
  });
  assert.equal(unauth.status, 401);

  const emptyRes = await callWorker(`/api/evidence?plot_id=${farmer1PlotId}&entity_type=activity`, {
    method: 'POST',
    token: farmer1Token,
    body: new Uint8Array(0),
    headers: { 'content-type': 'image/jpeg' },
  });
  assert.equal(emptyRes.status, 400);

  const spoofRes = await callWorker(`/api/evidence?plot_id=${farmer1PlotId}&entity_type=activity`, {
    method: 'POST',
    token: farmer1Token,
    body: svgSpoofBytes,
    headers: { 'content-type': 'image/jpeg' },
  });
  assert.equal(spoofRes.status, 415);

  const oversized = await callWorker(`/api/evidence?plot_id=${farmer1PlotId}&entity_type=activity`, {
    method: 'POST',
    token: farmer1Token,
    body: new Uint8Array(5 * 1024 * 1024 + 10),
    headers: { 'content-type': 'image/jpeg' },
  });
  assert.equal(oversized.status, 413);
});

test('Farmer uploads JPEG/PNG/WebP evidence to R2, attaches to activity, and enforces strict RBAC isolation', async () => {
  const upJpeg = await callWorker(`/api/evidence?plot_id=${farmer1PlotId}&entity_type=activity`, {
    method: 'POST',
    token: farmer1Token,
    body: jpegBytes,
    headers: { 'content-type': 'image/png' }, // magic bytes determine image/jpeg
  });
  assert.equal(upJpeg.status, 201);
  const evMeta = await upJpeg.json();
  assert.equal(evMeta.content_type, 'image/jpeg');
  assert.equal(evMeta.size_bytes, jpegBytes.byteLength);
  assert.equal(evMeta.storage_backend, 'r2');

  // Also test PNG & WebP acceptance
  const upPng = await callWorker(`/api/evidence?plot_id=${farmer1PlotId}&entity_type=activity`, {
    method: 'POST',
    token: farmer1Token,
    body: pngBytes,
    headers: { 'content-type': 'image/png' },
  });
  assert.equal(upPng.status, 201);
  assert.equal((await upPng.json()).content_type, 'image/png');

  const upWebp = await callWorker(`/api/evidence?plot_id=${farmer1PlotId}&entity_type=activity`, {
    method: 'POST',
    token: farmer1Token,
    body: webpBytes,
    headers: { 'content-type': 'image/webp' },
  });
  assert.equal(upWebp.status, 201);
  assert.equal((await upWebp.json()).content_type, 'image/webp');

  // Attach uploaded evidence to activity
  const today = new Date().toISOString().slice(0, 10);
  const actRes = await callWorker('/api/activities', {
    method: 'POST',
    token: farmer1Token,
    body: { plot_id: farmer1PlotId, kind: 'ใส่ปุ๋ย', details: 'ถ่ายภาพกองปุ๋ยหมัก', activity_date: today, evidence_id: evMeta.id },
  });
  assert.equal(actRes.status, 201);
  const actCreated = await actRes.json();
  assert.equal(actCreated.evidence_id, evMeta.id);

  // Re-using the same evidence_id for another activity must fail
  const reuseRes = await callWorker('/api/activities', {
    method: 'POST',
    token: farmer1Token,
    body: { plot_id: farmer1PlotId, kind: 'ให้น้ำ', details: 'ใช้ซ้ำ', activity_date: today, evidence_id: evMeta.id },
  });
  assert.equal(reuseRes.status, 400);

  // GET /api/activities returns evidence_id
  const actList = await (await callWorker('/api/activities', { token: farmer1Token })).json();
  assert.equal(actList[0].evidence_id, evMeta.id);

  // Cross-farmer and cross-ICS access MUST fail with 403
  assert.equal((await callWorker(`/api/evidence/${evMeta.id}`, { token: farmer2Token })).status, 403);
  assert.equal((await callWorker(`/api/evidence/${evMeta.id}/content`, { token: farmer2Token })).status, 403);
  assert.equal((await callWorker(`/api/evidence/${evMeta.id}`, { token: ics2Token })).status, 403);
  assert.equal((await callWorker(`/api/evidence/${evMeta.id}/content`, { token: ics2Token })).status, 403);

  // Owner (farmer1) and assigned ICS (ics1) and Admin can download with strict headers
  for (const allowedTok of [farmer1Token, ics1Token, adminToken]) {
    const contentRes = await callWorker(`/api/evidence/${evMeta.id}/content`, { token: allowedTok });
    assert.equal(contentRes.status, 200);
    assert.equal(contentRes.headers.get('content-type'), 'image/jpeg');
    assert.equal(contentRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(contentRes.headers.get('content-security-policy'), "default-src 'none'; sandbox");
    assert.equal(contentRes.headers.get('cache-control'), 'private, no-store');
    const downloaded = new Uint8Array(await contentRes.arrayBuffer());
    assert.deepEqual(downloaded, jpegBytes);
  }

  // ICS uploads inspection evidence and links to POST /api/reviews
  const icsUp = await callWorker(`/api/evidence?plot_id=${farmer1PlotId}&entity_type=review`, {
    method: 'POST',
    token: ics1Token,
    body: pngBytes,
    headers: { 'content-type': 'image/png' },
  });
  assert.equal(icsUp.status, 201);
  const reviewEv = await icsUp.json();
  const revRes = await callWorker('/api/reviews', {
    method: 'POST',
    token: ics1Token,
    body: { plot_id: farmer1PlotId, result: 'ผ่าน', note: 'แนวกันชนสมบูรณ์', evidence_id: reviewEv.id },
  });
  assert.equal(revRes.status, 201);
  const revs = await (await callWorker('/api/reviews', { token: ics1Token })).json();
  assert.equal(revs[0].evidence_id, reviewEv.id);

  // Audit logs record evidence uploads
  const logs = await db.prepare("SELECT event_type, actor_user_id FROM audit_logs WHERE event_type='evidence.uploaded'").all();
  assert.equal(logs.results.length, 4);
});

test('Local disk evidence storage stores, retrieves, deletes, and rejects path traversal', async () => {
  const local = createLocalEvidenceStorage(tempEvidenceDir);
  await local.put('evidence/activity/plot-1/2026-11-20/sample.jpg', jpegBytes, 'image/jpeg');
  const loaded = await local.get('evidence/activity/plot-1/2026-11-20/sample.jpg');
  assert.deepEqual(new Uint8Array(loaded.body), jpegBytes);
  await local.delete('evidence/activity/plot-1/2026-11-20/sample.jpg');
  assert.equal(await local.get('evidence/activity/plot-1/2026-11-20/sample.jpg'), null);

  await assert.rejects(() => local.get('../secret.txt'), /ไม่ถูกต้อง/);
  await assert.rejects(() => local.put('/abs/path.jpg', jpegBytes, 'image/jpeg'), /ไม่ถูกต้อง/);
});
