import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { agencyCodeDigests } from '../lib/agency-code.js';
import { hashPassword } from '../lib/password.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtg-invites-'));
const databasePath = path.join(tempDir, 'test.db');
const testKey = crypto.randomBytes(32);
process.env.NODE_ENV = 'development';
process.env.DEV_AUTH_ENABLED = 'true';
process.env.DB_PATH = databasePath;
process.env.LINE_CHANNEL_ID = 'test-channel';
process.env.AGENCY_CODE_HMAC_KEYS = `test-v1:${testKey.toString('base64url')}`;

const setup = new Database(databasePath);
setup.exec("CREATE TABLE users(id INTEGER PRIMARY KEY, line_id TEXT UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'farmer' CHECK(role IN ('farmer','ics')), created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
runMigrations(setup);
setup.exec(`
  INSERT INTO users(id,line_id,name,role,status,linked_at) VALUES
    (1,'dev-admin','Admin','admin','active',CURRENT_TIMESTAMP),
    (2,'dev-farmer','Existing Farmer','farmer','active',CURRENT_TIMESTAMP),
    (3,'dev-ics','Existing ICS','ics','active',CURRENT_TIMESTAMP);
`);
for (const [userId, code] of [[1,'ADMIN-001'],[2,'DEV-FARMER'],[3,'ICS-001']]) {
  const [{ digest }] = agencyCodeDigests(code, [{ version: 'test-v1', key: testKey }]);
  setup.prepare('INSERT INTO agency_credentials(user_id,key_version,code_digest,code_hint) VALUES(?,?,?,?)').run(userId, 'test-v1', digest, code);
}
{
  const password = hashPassword('Admin-Test-Password-001!');
  setup.prepare('INSERT INTO admin_password_credentials(user_id,algorithm,salt,password_hash,parameters_json) VALUES(?,?,?,?,?)')
    .run(1, password.algorithm, password.salt, password.passwordHash, password.parametersJson);
}
for (let number = 1; number <= 8; number += 1) {
  const code = `F-${String(number).padStart(3, '0')}`;
  const userId = 100 + number;
  setup.prepare("INSERT INTO users(id,line_id,name,role,status) VALUES(?,NULL,?,'farmer','unlinked')").run(userId, `Farmer ${code}`);
  const [{ digest }] = agencyCodeDigests(code, [{ version: 'test-v1', key: testKey }]);
  setup.prepare('INSERT INTO agency_credentials(user_id,key_version,code_digest,code_hint) VALUES(?,?,?,?)').run(userId, 'test-v1', digest, code);
}
setup.prepare("INSERT INTO users(id,line_id,name,role,status,linked_at) VALUES(50,'dev-suspended','Suspended Farmer','farmer','disabled',CURRENT_TIMESTAMP)").run();
{
  const [{ digest }] = agencyCodeDigests('SUSP-001', [{ version: 'test-v1', key: testKey }]);
  setup.prepare('INSERT INTO agency_credentials(user_id,key_version,code_digest,code_hint) VALUES(?,?,?,?)').run(50, 'test-v1', digest, 'SUSP-001');
}
setup.exec(`
  CREATE TABLE plots(id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL, crop TEXT NOT NULL, area TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  INSERT INTO farmer_assignments(id,ics_user_id,farmer_user_id,assigned_by) VALUES(1,3,101,1);
  INSERT INTO plots(id,owner_id,name,crop) VALUES(1001,101,'Assigned Plot','Rice'),(1002,102,'Other Plot','Herbs');
`);
setup.close();

const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  if (String(input) !== 'https://api.line.me/oauth2/v2.1/verify') return nativeFetch(input, options);
  const body = new URLSearchParams(options.body);
  const idToken = body.get('id_token');
  if (!idToken?.startsWith('valid-')) return new Response(JSON.stringify({ error: 'invalid' }), { status: 401, headers: { 'content-type': 'application/json' } });
  return new Response(JSON.stringify({ sub: idToken.slice(6), name: 'LINE Test User' }), { status: 200, headers: { 'content-type': 'application/json' } });
};

const { startServer, db } = await import('../server.js');
let server;
let baseUrl;
let adminToken;
let farmerToken;
let icsToken;

async function request(route, { method = 'GET', token, body } = {}) {
  const response = await nativeFetch(`${baseUrl}${route}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, headers: response.headers, body: await response.json() };
}

async function createInvite(targetUserId) {
  return request('/api/admin/invites', { method: 'POST', token: adminToken, body: { targetUserId } });
}

before(async () => {
  server = startServer(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const adminLogin = await request('/api/auth/admin/password-login', { method: 'POST', body: { agencyCode: 'ADMIN-001', password: 'Admin-Test-Password-001!' } });
  const farmerLogin = await request('/api/dev/login', { method: 'POST', body: { agencyCode: 'DEV-FARMER' } });
  const icsLogin = await request('/api/dev/login', { method: 'POST', body: { agencyCode: 'ICS-001' } });
  assert.equal(adminLogin.body.redirectTo, 'invites');
  assert.equal(farmerLogin.body.redirectTo, 'home');
  assert.equal(icsLogin.body.redirectTo, 'risks');
  adminToken = adminLogin.body.token;
  farmerToken = farmerLogin.body.token;
  icsToken = icsLogin.body.token;
});

after(async () => {
  globalThis.fetch = nativeFetch;
  await new Promise(resolve => server.close(resolve));
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('only an authenticated active admin can create an F-001 invitation', async () => {
  assert.equal((await request('/api/admin/invites', { method: 'POST', body: { targetUserId: 101 } })).status, 401);
  assert.equal((await request('/api/admin/invites', { method: 'POST', token: farmerToken, body: { targetUserId: 101 } })).status, 403);
  assert.equal((await request('/api/admin/invites', { method: 'POST', token: icsToken, body: { targetUserId: 101 } })).status, 403);
  const created = await createInvite(101);
  assert.equal(created.status, 201);
  assert.match(created.body.invitationToken, /^[A-Za-z0-9_-]{43}$/);
  assert.match(created.headers.get('cache-control'), /no-store/);
  const lifetime = new Date(created.body.expiresAt).getTime() - Date.now();
  assert.ok(lifetime <= 86_400_000 && lifetime > 86_390_000);
  const stored = db.prepare('SELECT token_hash FROM registration_invites WHERE id=?').get(created.body.id);
  assert.equal(stored.token_hash.length, 64);
  assert.notEqual(stored.token_hash, created.body.invitationToken);
  const auditText = JSON.stringify(db.prepare("SELECT metadata_json FROM audit_logs WHERE event_type='invitation.created'").all());
  assert.equal(auditText.includes(created.body.invitationToken), false);

  const replacement = await createInvite(101);
  assert.equal(replacement.status, 201);
  assert.ok(db.prepare('SELECT revoked_at FROM registration_invites WHERE id=?').get(created.body.id).revoked_at);
  assert.equal(db.prepare('SELECT count(*) count FROM registration_invites WHERE user_id=101 AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?').get(new Date().toISOString()).count, 1);
});

test('Super User password login, logout, and role isolation work', async () => {
  assert.equal((await request('/api/auth/admin/password-login', { method: 'POST', body: { agencyCode: 'ADMIN-001', password: 'wrong-password' } })).status, 401);
  assert.equal((await request('/api/dev/login', { method: 'POST', body: { agencyCode: 'ADMIN-001' } })).status, 401);
  assert.equal((await request('/api/admin/users')).status, 401);
  assert.equal((await request('/api/admin/users', { token: farmerToken })).status, 403);
  assert.equal((await request('/api/admin/users', { token: icsToken })).status, 403);
  assert.equal((await request('/api/admin/users', { token: adminToken })).status, 200);
  const stored = db.prepare('SELECT password_hash,salt FROM admin_password_credentials WHERE user_id=1').get();
  assert.notEqual(stored.password_hash, 'Admin-Test-Password-001!');
  assert.ok(stored.salt.length > 10);

  const secondLogin = await request('/api/auth/admin/password-login', { method: 'POST', body: { agencyCode: 'ADMIN-001', password: 'Admin-Test-Password-001!' } });
  assert.equal(secondLogin.status, 200);
  assert.equal((await request('/api/logout', { method: 'POST', token: secondLogin.body.token })).status, 200);
  assert.equal((await request('/api/me', { token: secondLogin.body.token })).status, 401);
});

test('Super User can create Farmer and ICS identities and manage assignments', async () => {
  const officer = await request('/api/admin/users', { method: 'POST', token: adminToken, body: { agencyCode: 'ICS-NEW', name: 'New ICS', role: 'ics' } });
  const farmer = await request('/api/admin/users', { method: 'POST', token: adminToken, body: { agencyCode: 'F-NEW', name: 'New Farmer', role: 'farmer' } });
  assert.equal(officer.status, 201);
  assert.equal(farmer.status, 201);
  const assigned = await request('/api/admin/assignments', { method: 'POST', token: adminToken, body: { icsUserId: officer.body.id, farmerUserId: farmer.body.id } });
  assert.equal(assigned.status, 201);
  const assignments = await request('/api/admin/assignments', { token: adminToken });
  assert.ok(assignments.body.some(item => item.id === assigned.body.id && item.ends_at === null));
  assert.equal((await request(`/api/admin/assignments/${assigned.body.id}/end`, { method: 'PATCH', token: adminToken })).status, 200);
  assert.ok(db.prepare('SELECT ends_at FROM farmer_assignments WHERE id=?').get(assigned.body.id).ends_at);
});

test('unified development login rejects unknown and suspended identities', async () => {
  assert.equal((await request('/api/dev/login', { method: 'POST', body: { agencyCode: 'UNKNOWN-001' } })).status, 401);
  assert.equal((await request('/api/dev/login', { method: 'POST', body: { agencyCode: 'SUSP-001' } })).status, 403);
});

test('ICS data access is isolated to active assignments', async () => {
  const icsPlots = await request('/api/plots', { token: icsToken });
  assert.equal(icsPlots.status, 200);
  assert.deepEqual(icsPlots.body.map(plot => plot.id), [1001]);
  const adminPlots = await request('/api/plots', { token: adminToken });
  assert.deepEqual(adminPlots.body.map(plot => plot.id).sort(), [1001, 1002]);
});

test('an existing session is rejected after the user is suspended', async () => {
  db.prepare("UPDATE users SET status='disabled' WHERE id=2").run();
  assert.equal((await request('/api/me', { token: farmerToken })).status, 403);
  db.prepare("UPDATE users SET status='active' WHERE id=2").run();
});

test('invite listing never returns full token or token hash', async () => {
  const listed = await request('/api/admin/invites', { token: adminToken });
  assert.equal(listed.status, 200);
  assert.ok(listed.body.length > 0);
  const serialized = JSON.stringify(listed.body);
  assert.equal(serialized.includes('invitationToken'), false);
  assert.equal(serialized.includes('token_hash'), false);
});

test('revoked invitation cannot be redeemed', async () => {
  const created = await createInvite(102);
  assert.equal((await request(`/api/admin/invites/${created.body.id}/revoke`, { method: 'PATCH', token: adminToken })).status, 200);
  const redeemed = await request('/api/auth/register/invite', { method: 'POST', body: { idToken: 'valid-line-revoked', agencyCode: 'F-002', invitationToken: created.body.invitationToken } });
  assert.equal(redeemed.status, 400);
  assert.equal(db.prepare('SELECT line_id FROM users WHERE id=102').get().line_id, null);
});

test('successful redemption links once and replay fails', async () => {
  const created = await createInvite(103);
  const body = { idToken: 'valid-line-f003', agencyCode: 'F-003', invitationToken: created.body.invitationToken };
  assert.equal((await request('/api/auth/register/invite', { method: 'POST', body })).status, 200);
  assert.equal((await request('/api/auth/register/invite', { method: 'POST', body })).status, 400);
  const invite = db.prepare('SELECT used_at,token_hash FROM registration_invites WHERE id=?').get(created.body.id);
  assert.ok(invite.used_at);
  assert.equal(invite.token_hash, crypto.createHash('sha256').update(created.body.invitationToken).digest('hex'));
});

test('an already linked LINE account cannot link another farmer', async () => {
  const created = await createInvite(104);
  const result = await request('/api/auth/register/invite', { method: 'POST', body: { idToken: 'valid-line-f003', agencyCode: 'F-004', invitationToken: created.body.invitationToken } });
  assert.equal(result.status, 400);
  assert.equal(db.prepare('SELECT line_id FROM users WHERE id=104').get().line_id, null);
});

test('invitation cannot be used with a different agency account', async () => {
  const created = await createInvite(105);
  const result = await request('/api/auth/register/invite', { method: 'POST', body: { idToken: 'valid-line-wrong-target', agencyCode: 'F-006', invitationToken: created.body.invitationToken } });
  assert.equal(result.status, 400);
  assert.equal(db.prepare('SELECT used_at FROM registration_invites WHERE id=?').get(created.body.id).used_at, null);
});

test('expired invitation cannot be redeemed', async () => {
  const created = await createInvite(106);
  db.prepare("UPDATE registration_invites SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(created.body.id);
  const result = await request('/api/auth/register/invite', { method: 'POST', body: { idToken: 'valid-line-expired', agencyCode: 'F-006', invitationToken: created.body.invitationToken } });
  assert.equal(result.status, 400);
});

test('concurrent redemption succeeds exactly once', async () => {
  const created = await createInvite(107);
  const body = { idToken: 'valid-line-concurrent', agencyCode: 'F-007', invitationToken: created.body.invitationToken };
  const results = await Promise.all([
    request('/api/auth/register/invite', { method: 'POST', body }),
    request('/api/auth/register/invite', { method: 'POST', body }),
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 400]);
  assert.equal(db.prepare('SELECT count(*) count FROM users WHERE line_id=?').get('line-concurrent').count, 1);
  assert.equal(db.prepare('SELECT count(*) count FROM registration_invites WHERE id=? AND used_at IS NOT NULL').get(created.body.id).count, 1);
});
