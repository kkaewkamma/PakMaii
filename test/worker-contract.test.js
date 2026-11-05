import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { hashPassword } from '../lib/password.js';
import { agencyCodeDigests as nodeAgencyCodeDigests } from '../lib/agency-code.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtg-worker-contract-'));
const databasePath = path.join(tempDir, 'contract.db');
const schema = fs.readFileSync(new URL('../d1/migrations/0001_initial_schema.sql', import.meta.url), 'utf8');
const phase3Schema = fs.readFileSync(new URL('../d1/migrations/0002_phase3_mutation_guards_and_indexes.sql', import.meta.url), 'utf8');
const authSchema = fs.readFileSync(new URL('../d1/migrations/0003_auth_rate_limits.sql', import.meta.url), 'utf8');
const fixture = new Database(databasePath);
fixture.pragma('foreign_keys = ON');
fixture.exec(schema);
fixture.exec(phase3Schema);
fixture.exec(authSchema);
fixture.exec(`CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  INSERT INTO schema_migrations(version,name) VALUES(1,'auth_identity_and_rbac'),(2,'admin_password_credentials');`);

const tokens = {
  farmer: '1'.repeat(64),
  otherFarmer: '2'.repeat(64),
  ics: '3'.repeat(64),
  admin: '4'.repeat(64),
  expired: '5'.repeat(64),
};
const primaryKey = Buffer.alloc(32, 7);
const previousKey = Buffer.alloc(32, 8);
const keyRing = `primary-v2:${primaryKey.toString('base64url')},previous-v1:${previousKey.toString('base64url')}`;
const adminTestPassword = crypto.randomBytes(18).toString('base64url');
const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');

fixture.exec(`
  INSERT INTO users(id,line_id,name,role,status,linked_at) VALUES
    (1,'line-farmer','Farmer One','farmer','active',CURRENT_TIMESTAMP),
    (2,'line-other','Farmer Two','farmer','active',CURRENT_TIMESTAMP),
    (3,'line-ics','ICS One','ics','active',CURRENT_TIMESTAMP),
    (4,'line-admin','Admin One','admin','active',CURRENT_TIMESTAMP),
    (5,NULL,'Farmer Unlinked','farmer','unlinked',NULL),
    (6,'line-disabled','Disabled Farmer','farmer','disabled',CURRENT_TIMESTAMP),
    (7,NULL,'ICS Unlinked','ics','unlinked',NULL);
  INSERT INTO agency_credentials(user_id,key_version,code_digest,code_hint)
    VALUES(5,'test','digest-five','F-005'),(7,'test','digest-seven','ICS-007');
  INSERT INTO farmer_assignments(id,ics_user_id,farmer_user_id,assigned_by) VALUES(10,3,1,4);
  INSERT INTO plots(id,owner_id,name,crop,area) VALUES
    (20,1,'Assigned Plot','Rice','2 rai'),(21,2,'Other Plot','Herbs','1 rai');
  INSERT INTO activities(id,plot_id,user_id,kind,details,activity_date)
    VALUES(30,20,1,'plant','seeded','2026-09-01');
  INSERT INTO approvals(id,plot_id,user_id,input_name,details)
    VALUES(40,20,1,'compost','organic');
  INSERT INTO lots(id,plot_id,code,crop,harvest_date,quantity)
    VALUES(50,20,'LOT-50','Rice','2026-10-01',10);
  INSERT INTO reviews(id,plot_id,reviewer_id,result,note)
    VALUES(60,20,3,'pass','ok');
  INSERT INTO registration_invites(id,user_id,token_hash,created_by,expires_at)
    VALUES(70,5,'invite-hash',4,'2099-01-01T00:00:00.000Z');
`);
const sessionInsert = fixture.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)');
sessionInsert.run(tokenHash(tokens.farmer), 1, 4102444800000);
sessionInsert.run(tokenHash(tokens.otherFarmer), 2, 4102444800000);
sessionInsert.run(tokenHash(tokens.ics), 3, 4102444800000);
sessionInsert.run(tokenHash(tokens.admin), 4, 4102444800000);
sessionInsert.run(tokenHash(tokens.expired), 1, 1);
const [{ digest: previousAdminDigest }] = nodeAgencyCodeDigests('ADMIN-001', [{ version: 'previous-v1', key: previousKey }]);
fixture.prepare('INSERT INTO agency_credentials(user_id,key_version,code_digest,code_hint) VALUES(?,?,?,?)').run(4, 'previous-v1', previousAdminDigest, 'ADMIN-001');
const adminPassword = hashPassword(adminTestPassword);
fixture.prepare(`INSERT INTO admin_password_credentials(user_id,algorithm,salt,password_hash,parameters_json)
  VALUES(?,?,?,?,?)`).run(4, adminPassword.algorithm, adminPassword.salt, adminPassword.passwordHash, adminPassword.parametersJson);
fixture.close();

process.env.NODE_ENV = 'production';
process.env.DEV_AUTH_ENABLED = 'false';
process.env.DB_PATH = databasePath;
process.env.LIFF_ID = 'contract-liff-id';

const [{ startServer, db }, workerModule] = await Promise.all([
  import('../server.js'),
  import('../worker/index.js'),
]);

class SqliteD1Statement {
  constructor(database, sql, params = []) { this.database = database; this.sql = sql; this.params = params; }
  bind(...params) { return new SqliteD1Statement(this.database, this.sql, params); }
  async first() { return this.database.prepare(this.sql).get(...this.params) ?? null; }
  async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.params) }; }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid) } };
  }
}

let batchQueue = Promise.resolve();
const d1 = {
  prepare: sql => new SqliteD1Statement(db, sql),
  batch(statements) {
    const execute = () => db.transaction(() => statements.map(statement => {
      const result = db.prepare(statement.sql).run(...statement.params);
      return { success: true, meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid) } };
    }))();
    const pending = batchQueue.then(execute, execute);
    batchQueue = pending.catch(() => {});
    return pending;
  },
};
let server;
let baseUrl;

before(async () => {
  server = startServer(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function expressRequest(route, token) {
  const response = await fetch(`${baseUrl}${route}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: response.status, body: await response.json() };
}

async function workerRequest(route, token, method = 'GET') {
  const options = typeof method === 'string' ? { method } : method;
  const headers = { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.body ? { 'content-type': 'application/json' } : {}) };
  const request = new Request(`http://localhost${route}`, { method: options.method || 'GET', headers, body: options.body ? JSON.stringify(options.body) : undefined });
  const response = await workerModule.default.fetch(request, {
    DB: d1,
    LIFF_ID: 'contract-liff-id',
    AGENCY_CODE_HMAC_KEYS: keyRing,
    LINE_CHANNEL_ID: 'test-line-channel',
    ENVIRONMENT: 'local',
    ASSETS: { fetch: () => new Response('asset') },
  });
  return { status: response.status, body: await response.json() };
}

async function assertContract(route, token) {
  const [expressResponse, workerResponse] = await Promise.all([expressRequest(route, token), workerRequest(route, token)]);
  assert.deepEqual(workerResponse, expressResponse, route);
}

test('public and authenticated read-only responses match Express', async () => {
  await assertContract('/api/health');
  await assertContract('/api/config');
  await assertContract('/api/plots');
  await assertContract('/api/me', tokens.farmer);
  for (const route of ['/api/plots', '/api/activities', '/api/approvals', '/api/lots']) {
    await assertContract(route, tokens.farmer);
    await assertContract(route, tokens.ics);
    await assertContract(route, tokens.admin);
  }
  await assertContract('/api/risks', tokens.ics);
  await assertContract('/api/reviews', tokens.ics);
});

test('role isolation and admin read-only responses match Express', async () => {
  await assertContract('/api/risks', tokens.farmer);
  await assertContract('/api/reviews', tokens.admin);
  for (const route of ['/api/admin/users', '/api/admin/assignments', '/api/admin/invites', '/api/admin/unlinked-farmers', '/api/admin/unlinked-users']) {
    await assertContract(route, tokens.farmer);
    await assertContract(route, tokens.admin);
  }
});

test('Worker does not expose development login', async () => {
  assert.deepEqual(await workerRequest('/api/dev/login', undefined, 'POST'), { status: 404, body: { error: 'ไม่พบ API' } });
  await assertContract('/api/not-a-route');
});

test('Worker Farmer mutations validate ownership and input', async () => {
  assert.equal((await workerRequest('/api/plots', undefined, { method: 'POST', body: { name: 'X', crop: 'Y' } })).status, 401);
  assert.equal((await workerRequest('/api/plots', tokens.ics, { method: 'POST', body: { name: 'X', crop: 'Y' } })).status, 403);
  const created = await workerRequest('/api/plots', tokens.farmer, { method: 'POST', body: { name: 'Worker Plot', crop: 'Rice', area: '3 rai' } });
  assert.equal(created.status, 201);
  const plotId = created.body.id;
  const updated = await workerRequest(`/api/plots/${plotId}`, tokens.farmer, { method: 'PATCH', body: { name: 'Worker Plot 2', area: '4 rai' } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.name, 'Worker Plot 2');
  assert.equal((await workerRequest(`/api/plots/${plotId}`, tokens.otherFarmer, { method: 'PATCH', body: { name: 'Stolen' } })).status, 403);
  assert.equal((await workerRequest(`/api/plots/${plotId}`, tokens.farmer, { method: 'PATCH', body: { owner_id: 2 } })).status, 400);
  assert.equal((await workerRequest('/api/activities', tokens.otherFarmer, { method: 'POST', body: { plot_id: plotId, kind: 'x', details: 'x', activity_date: '2026-10-15' } })).status, 403);
  assert.equal((await workerRequest('/api/activities', tokens.farmer, { method: 'POST', body: { plot_id: plotId, kind: 'plant', details: 'done', activity_date: '2026-10-15', photo_url: 'https://example.test/a.jpg' } })).status, 201);
  const approval = await workerRequest('/api/approvals', tokens.farmer, { method: 'POST', body: { plot_id: plotId, input_name: 'compost', details: 'organic' } });
  assert.equal(approval.status, 201);
  assert.equal((await workerRequest(`/api/approvals/${approval.body.id}`, tokens.ics, { method: 'PATCH', body: { status: 'approved', comment: 'ok' } })).status, 200);
  assert.equal((await workerRequest(`/api/approvals/${approval.body.id}`, tokens.ics, { method: 'PATCH', body: { status: 'rejected' } })).status, 404);
  assert.equal((await workerRequest('/api/lots', tokens.farmer, { method: 'POST', body: { plot_id: plotId, code: 'WORKER-LOT', crop: 'Rice', harvest_date: '2026-10-15', quantity: 5 } })).status, 201);
  assert.equal((await workerRequest('/api/lots', tokens.farmer, { method: 'POST', body: { plot_id: plotId, code: 'WORKER-LOT', crop: 'Rice', harvest_date: '2026-10-15', quantity: 5 } })).status, 409);
  assert.equal((await workerRequest('/api/reviews', tokens.ics, { method: 'POST', body: { plot_id: plotId, result: 'pass', note: 'checked' } })).status, 201);
});

test('Worker Admin mutations are atomic and role isolated', async () => {
  assert.equal((await workerRequest('/api/admin/users', tokens.farmer, { method: 'POST', body: { name: 'No', role: 'farmer', agencyCode: 'F-900' } })).status, 403);
  const created = await workerRequest('/api/admin/users', tokens.admin, { method: 'POST', body: { name: 'New Farmer', role: 'farmer', agencyCode: 'F-900' } });
  assert.equal(created.status, 201);
  const countBeforeDuplicate = db.prepare('SELECT count(*) count FROM users').get().count;
  assert.equal((await workerRequest('/api/admin/users', tokens.admin, { method: 'POST', body: { name: 'Duplicate', role: 'farmer', agencyCode: 'F-900' } })).status, 409);
  assert.equal(db.prepare('SELECT count(*) count FROM users').get().count, countBeforeDuplicate, 'failed batch must roll back user insert');
  assert.equal((await workerRequest(`/api/admin/users/${created.body.id}/status`, tokens.admin, { method: 'PATCH', body: { status: 'active' } })).status, 200);

  const assignmentResponses = await Promise.all([
    workerRequest('/api/admin/assignments', tokens.admin, { method: 'POST', body: { icsUserId: 3, farmerUserId: 2 } }),
    workerRequest('/api/admin/assignments', tokens.admin, { method: 'POST', body: { icsUserId: 3, farmerUserId: 2 } }),
  ]);
  assert.deepEqual(assignmentResponses.map(item => item.status), [201, 201]);
  assert.equal(db.prepare('SELECT count(*) count FROM farmer_assignments WHERE farmer_user_id=2 AND ends_at IS NULL').get().count, 1);
  const activeAssignment = db.prepare('SELECT id FROM farmer_assignments WHERE farmer_user_id=2 AND ends_at IS NULL').get();
  const ended = await Promise.all([
    workerRequest(`/api/admin/assignments/${activeAssignment.id}/end`, tokens.admin, { method: 'PATCH', body: {} }),
    workerRequest(`/api/admin/assignments/${activeAssignment.id}/end`, tokens.admin, { method: 'PATCH', body: {} }),
  ]);
  assert.deepEqual(ended.map(item => item.status).sort(), [200, 404]);
  assert.equal(db.prepare("SELECT count(*) count FROM audit_logs WHERE event_type='assignment.ended' AND target_id=?").get(String(activeAssignment.id)).count, 1);
});

test('Worker invitation create/revoke is concurrent-safe and never lists secrets', async () => {
  const targets = await workerRequest('/api/admin/unlinked-users', tokens.admin);
  assert.deepEqual(targets.body.map(item => item.role).sort(), ['farmer','ics']);
  const icsInvite = await workerRequest('/api/admin/invites', tokens.admin, { method: 'POST', body: { targetUserId: 7 } });
  assert.equal(icsInvite.status, 201);
  const created = await Promise.all([
    workerRequest('/api/admin/invites', tokens.admin, { method: 'POST', body: { targetUserId: 5 } }),
    workerRequest('/api/admin/invites', tokens.admin, { method: 'POST', body: { targetUserId: 5 } }),
  ]);
  assert.deepEqual(created.map(item => item.status), [201, 201]);
  for (const response of created) assert.match(response.body.invitationToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(db.prepare("SELECT count(*) count FROM registration_invites WHERE user_id=5 AND used_at IS NULL AND revoked_at IS NULL AND expires_at>datetime('now')").get().count, 1);
  const stored = db.prepare('SELECT token_hash FROM registration_invites WHERE id=?').get(created[1].body.id);
  assert.notEqual(stored.token_hash, created[1].body.invitationToken);
  const list = await workerRequest('/api/admin/invites', tokens.admin);
  assert.ok(list.body.every(row => !Object.hasOwn(row, 'token_hash') && !Object.hasOwn(row, 'invitationToken')));
  const revoked = await Promise.all([
    workerRequest(`/api/admin/invites/${created[1].body.id}/revoke`, tokens.admin, { method: 'PATCH', body: {} }),
    workerRequest(`/api/admin/invites/${created[1].body.id}/revoke`, tokens.admin, { method: 'PATCH', body: {} }),
  ]);
  assert.deepEqual(revoked.map(item => item.status).sort(), [200, 409]);
  assert.equal(db.prepare("SELECT count(*) count FROM audit_logs WHERE event_type='invitation.revoked' AND target_id=?").get(String(created[1].body.id)).count, 1);
});

test('Worker rejects a valid session when its account is disabled', async () => {
  db.prepare("UPDATE users SET status='disabled' WHERE id=1").run();
  assert.deepEqual(await workerRequest('/api/plots', tokens.farmer), { status: 403, body: { error: 'บัญชีถูกระงับหรือยังไม่พร้อมใช้งาน' } });
});

test('Worker verifies LINE identity, creates a hashed session, and logs out', async () => {
  const originalFetch = globalThis.fetch;
  let verificationBody;
  globalThis.fetch = async request => {
    assert.equal(request.url, 'https://api.line.me/oauth2/v2.1/verify');
    verificationBody = await request.text();
    return new Response(JSON.stringify({ sub: 'line-other', name: 'Ignored LINE Name' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const login = await workerRequest('/api/login', undefined, { method: 'POST', body: { idToken: 'verified-token', role: 'admin', lineUserId: 'line-admin' } });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.id, 2);
    assert.equal(login.body.user.role, 'farmer');
    assert.match(login.body.token, /^[a-f0-9]{64}$/);
    assert.match(verificationBody, /id_token=verified-token/);
    assert.match(verificationBody, /client_id=test-line-channel/);
    assert.equal(db.prepare('SELECT count(*) count FROM sessions WHERE token_hash=?').get(login.body.token).count, 0);
    assert.equal(db.prepare('SELECT count(*) count FROM sessions WHERE token_hash=?').get(tokenHash(login.body.token)).count, 1);
    assert.equal((await workerRequest('/api/me', login.body.token)).status, 200);
    assert.deepEqual(await workerRequest('/api/logout', login.body.token, { method: 'POST', body: {} }), { status: 200, body: { ok: true } });
    assert.equal((await workerRequest('/api/me', login.body.token)).status, 401);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Worker rejects failed LINE verification, unlinked identity, disabled user, and expired session', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'invalid' }), { status: 400 });
    assert.equal((await workerRequest('/api/login', undefined, { method: 'POST', body: { idToken: 'invalid-token' } })).status, 401);
    globalThis.fetch = async () => new Response(JSON.stringify({ sub: 'not-linked' }), { status: 200 });
    const unlinked = await workerRequest('/api/login', undefined, { method: 'POST', body: { idToken: 'unlinked-token' } });
    assert.equal(unlinked.status, 403);
    assert.equal(unlinked.body.code, 'REGISTRATION_REQUIRED');
    globalThis.fetch = async () => new Response(JSON.stringify({ sub: 'line-disabled' }), { status: 200 });
    assert.equal((await workerRequest('/api/login', undefined, { method: 'POST', body: { idToken: 'disabled-token' } })).status, 403);
    assert.equal((await workerRequest('/api/me', tokens.expired)).status, 401);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Worker Admin password login supports HMAC rotation and session revocation', async () => {
  const login = await workerRequest('/api/auth/admin/password-login', undefined, { method: 'POST', body: { agencyCode: 'ADMIN-001', password: adminTestPassword, role: 'farmer' } });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, 'admin');
  assert.equal(login.body.redirectTo, 'invites');
  const [{ digest: primaryDigest }] = nodeAgencyCodeDigests('ADMIN-001', [{ version: 'primary-v2', key: primaryKey }]);
  assert.deepEqual(db.prepare('SELECT key_version,code_digest FROM agency_credentials WHERE user_id=4').get(), { key_version: 'primary-v2', code_digest: primaryDigest });
  assert.equal(db.prepare('SELECT count(*) count FROM sessions WHERE token_hash=?').get(login.body.token).count, 0);
  assert.equal((await workerRequest('/api/admin/users', login.body.token)).status, 200);
  assert.equal((await workerRequest('/api/plots', login.body.token, { method: 'POST', body: { name: 'No', crop: 'No' } })).status, 403);
  assert.equal((await workerRequest('/api/logout', login.body.token, { method: 'POST', body: {} })).status, 200);
  assert.equal((await workerRequest('/api/me', login.body.token)).status, 401);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    assert.equal((await workerRequest('/api/auth/admin/password-login', undefined, { method: 'POST', body: { agencyCode: 'ADMIN-001', password: `${adminTestPassword}-wrong` } })).status, 401);
  }
  assert.equal((await workerRequest('/api/auth/admin/password-login', undefined, { method: 'POST', body: { agencyCode: 'ADMIN-001', password: `${adminTestPassword}-wrong` } })).status, 429);
});
