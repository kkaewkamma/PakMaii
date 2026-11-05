import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Miniflare } from 'miniflare';
import worker from '../worker/index.js';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
let mf;
let db;

const subjects = {
  'first-admin-token': 'line-admin-first',
  'shared-admin-token': 'line-admin-shared',
  'old-admin-token': 'line-admin-old',
  'recovered-admin-token': 'line-admin-recovered',
  'disabled-admin-token': 'line-admin-disabled',
};
const env = (environment = 'production') => ({
  DB: db,
  ENVIRONMENT: environment,
  LINE_CHANNEL_ID: 'admin-test-channel',
  LINE_VERIFY: { async fetch(request) {
    const form = new URLSearchParams(await request.text());
    const sub = subjects[form.get('id_token')];
    return sub ? Response.json({ sub }) : Response.json({ error: 'invalid' }, { status: 401 });
  } },
  ASSETS: { fetch: () => new Response('asset') },
});

async function run(sql, ...params) { return db.prepare(sql).bind(...params).run(); }
async function first(sql, ...params) { return db.prepare(sql).bind(...params).first(); }
async function request(route, body, environment = 'production') {
  const response = await worker.fetch(new Request(`https://ready-to-grow.test${route}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), env(environment));
  return { status: response.status, body: await response.json(), cacheControl: response.headers.get('cache-control') };
}
async function operation(action, targetUserId, lineId, operator = 'ops-ticket-1', reason = 'verified operator request') {
  return run(`INSERT INTO admin_identity_operations(action,target_user_id,requested_line_id,operator_ref,reason)
    VALUES(?,?,?,?,?)`, action, targetUserId, lineId, operator, reason);
}

before(async () => {
  mf = new Miniflare({ workers: [{ config: {
    name: 'admin-line-test', compatibilityDate: '2025-10-11', compatibilityFlags: ['nodejs_compat'],
    manifest: { mainModule: 'index.js', modulesRoot: path.resolve('.'), modules: {
      'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' },
    } },
    env: { DB: { type: 'd1', name: 'admin-line-test' } },
  } }] });
  db = await mf.getD1Database('DB');
  for (const file of ['0001_initial_schema.sql','0002_phase3_mutation_guards_and_indexes.sql','0003_auth_rate_limits.sql','0004_admin_line_identity_operations.sql','0005_admin_identity_audit_actor.sql']) {
    const sql = fs.readFileSync(new URL(`../d1/migrations/${file}`, import.meta.url), 'utf8').replace(/--[^\r\n]*/g, '').replace(/\s+/g, ' ');
    await db.exec(sql);
  }
  await db.exec(`INSERT INTO users(id,line_id,name,role,status,linked_at) VALUES
    (1,NULL,'First Admin','admin','unlinked',NULL),
    (2,NULL,'Second Admin','admin','unlinked',NULL),
    (3,'line-admin-old','Recovery Admin','admin','active',CURRENT_TIMESTAMP),
    (4,'line-admin-disabled','Disabled Admin','admin','disabled',CURRENT_TIMESTAMP),
    (5,NULL,'Farmer','farmer','unlinked',NULL),
    (6,NULL,'Concurrent Admin','admin','unlinked',NULL);
    INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('${'a'.repeat(64)}',3,4102444800000);`.replace(/\s+/g, ' '));
});

after(async () => mf?.dispose());

test('operator-only action links the first Admin and normal LINE login reads role from D1', async () => {
  await operation('link', 1, 'line-admin-first');
  const linked = await first('SELECT line_id,role,status,linked_at FROM users WHERE id=1');
  assert.equal(linked.line_id, 'line-admin-first');
  assert.equal(linked.role, 'admin');
  assert.equal(linked.status, 'active');
  assert.ok(linked.linked_at);
  const login = await request('/api/login', { idToken: 'first-admin-token', role: 'farmer', lineUserId: 'forged' });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, 'admin');
  assert.equal(login.body.redirectTo, 'invites');
  assert.equal(login.cacheControl, 'no-store');
  assert.equal((await first('SELECT count(*) count FROM sessions WHERE token_hash=?', login.body.token)).count, 0);
  assert.equal((await first('SELECT count(*) count FROM sessions WHERE token_hash=?', hash(login.body.token))).count, 1);
  const audit = await first("SELECT actor_user_id,metadata_json FROM audit_logs WHERE event_type='admin.line_linked' AND target_id='1'");
  assert.equal(audit.actor_user_id, null, 'operator action must not be falsely attributed to the target Admin');
  assert.equal(JSON.parse(audit.metadata_json).operatorRef, 'ops-ticket-1');
});

test('duplicate LINE and concurrent Admin linking permit exactly one account', async () => {
  const results = await Promise.allSettled([
    operation('link', 2, 'line-admin-shared', 'ops-a', 'approved admin link A'),
    operation('link', 6, 'line-admin-shared', 'ops-b', 'approved admin link B'),
  ]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal((await first("SELECT count(*) count FROM users WHERE line_id='line-admin-shared'")).count, 1);
  assert.equal((await first("SELECT count(*) count FROM audit_logs WHERE event_type='admin.line_linked' AND metadata_json LIKE '%admin-shared%'")).count, 0, 'audit metadata must not contain full LINE identity');
});

test('operator guards reject Farmer elevation and disabled Admin changes', async () => {
  await assert.rejects(operation('link', 5, 'line-farmer-forged'), /admin identity operation is not allowed/);
  await assert.rejects(operation('recover', 4, 'line-disabled-new'), /admin identity operation is not allowed/);
  assert.deepEqual(await first('SELECT role,line_id,status FROM users WHERE id=5'), { role: 'farmer', line_id: null, status: 'unlinked' });
  assert.equal((await first('SELECT line_id FROM users WHERE id=4')).line_id, 'line-admin-disabled');
  assert.equal((await request('/api/login', { idToken: 'disabled-admin-token' })).status, 403);
});

test('recovery and unlink are audited atomically and revoke every existing session', async () => {
  await operation('recover', 3, 'line-admin-recovered', 'security-case-3', 'verified account recovery');
  assert.equal((await first('SELECT line_id FROM users WHERE id=3')).line_id, 'line-admin-recovered');
  assert.equal((await first('SELECT count(*) count FROM sessions WHERE user_id=3')).count, 0);
  assert.equal((await first("SELECT count(*) count FROM audit_logs WHERE event_type='admin.line_recovered' AND target_id='3'")).count, 1);
  const login = await request('/api/login', { idToken: 'recovered-admin-token' });
  assert.equal(login.status, 200);
  await operation('unlink', 3, null, 'security-case-4', 'verified account unlink request');
  assert.equal((await first('SELECT line_id FROM users WHERE id=3')).line_id, null);
  assert.equal((await first('SELECT count(*) count FROM sessions WHERE user_id=3')).count, 0);
  assert.equal((await first("SELECT count(*) count FROM audit_logs WHERE event_type='admin.line_unlinked' AND target_id='3'")).count, 1);
  assert.equal((await request('/api/login', { idToken: 'recovered-admin-token' })).status, 403);
});

test('failed LINE verification creates no session and Worker production rejects scrypt password login', async () => {
  const sessionsBefore = (await first('SELECT count(*) count FROM sessions')).count;
  const invalidLogin = await request('/api/login', { idToken: 'invalid-token', role: 'admin' });
  assert.equal(invalidLogin.status, 401);
  assert.equal(invalidLogin.cacheControl, 'no-store');
  assert.equal((await first('SELECT count(*) count FROM sessions')).count, sessionsBefore);
  const password = await request('/api/auth/admin/password-login', { agencyCode: 'ADMIN-001', password: 'not-evaluated' });
  assert.equal(password.status, 503);
  assert.equal(password.body.code, 'ADMIN_PASSWORD_LOGIN_UNAVAILABLE');
  assert.equal(password.cacheControl, 'no-store');
});
