import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Miniflare } from 'miniflare';
import worker from '../worker/index.js';
import { agencyCodeDigests } from '../worker/auth.js';
import { D1Repository } from '../worker/repository/d1.js';

const primaryKey = Buffer.alloc(32, 21).toString('base64url');
const previousKey = Buffer.alloc(32, 22).toString('base64url');
const keyRing = `primary-v2:${primaryKey},previous-v1:${previousKey}`;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const inviteToken = label => crypto.createHash('sha256').update(label).digest('base64url');
let mf;
let db;

async function run(sql, ...params) {
  return db.prepare(sql).bind(...params).run();
}

async function first(sql, ...params) {
  return db.prepare(sql).bind(...params).first();
}

async function addAccount(id, role, status, code, keyVersion = 'primary-v2') {
  await run('INSERT INTO users(id,name,role,status) VALUES(?,?,?,?)', id, `${role}-${id}`, role, status);
  const digest = (await agencyCodeDigests(code, keyVersion === 'primary-v2' ? `primary-v2:${primaryKey}` : `previous-v1:${previousKey}`))[0];
  await run('INSERT INTO agency_credentials(user_id,key_version,code_digest,code_hint) VALUES(?,?,?,?)', id, digest.version, digest.digest, code);
}

async function addInvite(id, userId, rawToken, state = 'active') {
  const expires = state === 'expired' ? '2020-01-01T00:00:00.000Z' : '2099-01-01T00:00:00.000Z';
  await run(`INSERT INTO registration_invites(id,user_id,token_hash,created_by,expires_at,revoked_at)
    VALUES(?,?,?,?,?,?)`, id, userId, hash(rawToken), 1, expires, state === 'revoked' ? '2026-01-01T00:00:00.000Z' : null);
}

const lineSubjects = {
  'line-farmer-token': 'line-farmer-new',
  'line-ics-token': 'line-ics-new',
  'line-concurrent-a': 'line-concurrent-a',
  'line-concurrent-b': 'line-concurrent-b',
  'line-failure-token': 'line-failure',
  'line-duplicate-token': 'line-existing',
};

const env = () => ({
  DB: db,
  LINE_CHANNEL_ID: 'test-channel',
  AGENCY_CODE_HMAC_KEYS: keyRing,
  LINE_VERIFY: {
    async fetch(request) {
      const form = new URLSearchParams(await request.text());
      const sub = lineSubjects[form.get('id_token')];
      if (!sub || form.get('client_id') !== 'test-channel') return new Response('{}', { status: 401 });
      return Response.json({ sub });
    },
  },
});

async function redeem(body, ip = '198.51.100.10') {
  const request = new Request('https://ready-to-grow.test/api/auth/register/invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify(body),
  });
  const response = await worker.fetch(request, env());
  return { status: response.status, body: await response.json(), headers: response.headers };
}

before(async () => {
  mf = new Miniflare({
    workers: [{ config: {
      name: 'invitation-redemption-test',
      compatibilityDate: '2025-10-11',
      compatibilityFlags: ['nodejs_compat'],
      manifest: {
        mainModule: 'index.js',
        modulesRoot: path.resolve('.'),
        modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } },
      },
      env: { DB: { type: 'd1', name: 'invitation-redemption-test' } },
    } }],
  });
  db = await mf.getD1Database('DB');
  for (const file of ['0001_initial_schema.sql', '0002_phase3_mutation_guards_and_indexes.sql', '0003_auth_rate_limits.sql', '0004_admin_line_identity_operations.sql', '0005_admin_identity_audit_actor.sql']) {
    const sql = fs.readFileSync(new URL(`../d1/migrations/${file}`, import.meta.url), 'utf8')
      .replace(/--[^\r\n]*/g, '')
      .replace(/\s+/g, ' ');
    await db.exec(sql);
  }
  await run("INSERT INTO users(id,line_id,name,role,status,linked_at) VALUES(1,'line-existing','Admin','admin','active',CURRENT_TIMESTAMP)");
  await addAccount(10, 'farmer', 'unlinked', 'F-010', 'previous-v1');
  await addAccount(11, 'ics', 'unlinked', 'ICS-011');
  await addAccount(12, 'farmer', 'unlinked', 'F-012');
  await addAccount(13, 'farmer', 'unlinked', 'F-013');
  await addAccount(14, 'farmer', 'unlinked', 'F-014');
  await addAccount(15, 'farmer', 'unlinked', 'F-015');
  await addAccount(16, 'farmer', 'unlinked', 'F-016');
  await addAccount(17, 'farmer', 'unlinked', 'F-017');
  await addAccount(18, 'farmer', 'disabled', 'F-018');
  await addAccount(19, 'farmer', 'unlinked', 'F-019');
  await addInvite(100, 10, inviteToken('farmer'));
  await addInvite(101, 11, inviteToken('ics'));
  await addInvite(102, 12, inviteToken('concurrent'));
  await addInvite(103, 13, inviteToken('expired'), 'expired');
  await addInvite(104, 14, inviteToken('revoked'), 'revoked');
  await addInvite(105, 16, inviteToken('wrong-target'));
  await addInvite(106, 17, inviteToken('duplicate-line'));
  await addInvite(107, 18, inviteToken('disabled'));
  await addInvite(108, 19, inviteToken('invalid-line'));
});

after(async () => mf?.dispose());

test('Worker redeems Farmer and ICS invitations, rotates HMAC, and stores only hashes', async () => {
  const farmer = await redeem({ agencyCode: 'F-010', invitationToken: inviteToken('farmer'), idToken: 'line-farmer-token', role: 'admin', lineUserId: 'forged' });
  assert.equal(farmer.status, 200);
  assert.equal(farmer.body.user.role, 'farmer');
  assert.equal(farmer.body.user.line_id, 'line-farmer-new');
  assert.equal(farmer.body.redirectTo, 'home');
  assert.equal(farmer.headers.get('cache-control'), 'no-store');
  const credential = await first('SELECT key_version,claimed_at FROM agency_credentials WHERE user_id=10');
  assert.equal(credential.key_version, 'primary-v2');
  assert.ok(credential.claimed_at);
  assert.equal((await first('SELECT count(*) count FROM sessions WHERE token_hash=?', farmer.body.token)).count, 0);
  assert.equal((await first('SELECT count(*) count FROM sessions WHERE token_hash=?', hash(farmer.body.token))).count, 1);
  assert.equal((await first('SELECT count(*) count FROM registration_invites WHERE token_hash=?', inviteToken('farmer'))).count, 0);

  const ics = await redeem({ agencyCode: 'ICS-011', invitationToken: inviteToken('ics'), idToken: 'line-ics-token' }, '198.51.100.11');
  assert.equal(ics.status, 200);
  assert.equal(ics.body.user.role, 'ics');
  assert.equal(ics.body.redirectTo, 'risks');
  assert.equal((await first("SELECT count(*) count FROM audit_logs WHERE event_type='account.linked' AND target_id IN ('10','11')")).count, 2);
});

test('one invitation can be redeemed only once under concurrent requests and replay', async () => {
  const body = { agencyCode: 'F-012', invitationToken: inviteToken('concurrent') };
  const results = await Promise.all([
    redeem({ ...body, idToken: 'line-concurrent-a' }, '198.51.100.12'),
    redeem({ ...body, idToken: 'line-concurrent-b' }, '198.51.100.13'),
  ]);
  assert.deepEqual(results.map(item => item.status).sort(), [200, 400]);
  assert.equal((await first('SELECT count(*) count FROM sessions WHERE user_id=12')).count, 1);
  assert.equal((await first("SELECT count(*) count FROM audit_logs WHERE event_type='account.linked' AND target_id='12'")).count, 1);
  assert.equal((await first('SELECT count(*) count FROM registration_invites WHERE id=102 AND used_at IS NOT NULL')).count, 1);
  const replay = await redeem({ ...body, idToken: 'line-concurrent-a' }, '198.51.100.14');
  assert.equal(replay.status, 400);
});

test('expired, revoked, wrong-target, wrong-code, duplicate LINE, and disabled failures roll back completely', async () => {
  const cases = [
    [13, 'F-013', 'expired', 'line-failure-token'],
    [14, 'F-014', 'revoked', 'line-failure-token'],
    [15, 'F-015', 'wrong-target', 'line-failure-token'],
    [16, 'WRONG-CODE', 'wrong-target', 'line-failure-token'],
    [17, 'F-017', 'duplicate-line', 'line-duplicate-token'],
    [18, 'F-018', 'disabled', 'line-failure-token'],
  ];
  for (const [userId, agencyCode, label, idToken] of cases) {
    const beforeState = await first('SELECT line_id,status FROM users WHERE id=?', userId);
    const sessionsBefore = (await first('SELECT count(*) count FROM sessions')).count;
    const auditsBefore = (await first("SELECT count(*) count FROM audit_logs WHERE event_type='account.linked'")).count;
    const result = await redeem({ agencyCode, invitationToken: inviteToken(label), idToken }, `203.0.113.${userId}`);
    assert.equal(result.status, 400, label);
    assert.deepEqual(await first('SELECT line_id,status FROM users WHERE id=?', userId), beforeState, label);
    assert.equal((await first('SELECT count(*) count FROM sessions')).count, sessionsBefore, label);
    assert.equal((await first("SELECT count(*) count FROM audit_logs WHERE event_type='account.linked'")).count, auditsBefore, label);
  }
});

test('failed LINE verification cannot consume an invitation or create side effects', async () => {
  const result = await redeem({ agencyCode: 'F-019', invitationToken: inviteToken('invalid-line'), idToken: 'invalid-line-token' }, '203.0.113.19');
  assert.equal(result.status, 401);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal((await first('SELECT line_id FROM users WHERE id=19')).line_id, null);
  assert.equal((await first('SELECT used_at FROM registration_invites WHERE id=108')).used_at, null);
  assert.equal((await first('SELECT count(*) count FROM sessions WHERE user_id=19')).count, 0);
  assert.equal((await first("SELECT count(*) count FROM audit_logs WHERE event_type='account.linked' AND target_id='19'")).count, 0);
});

test('distributed pre-verification IP limiter cannot be bypassed by rotating tokens or agency codes', async () => {
  const trustedKey = hash('local-untrusted');
  const before = (await first("SELECT COALESCE(SUM(attempts),0) attempts FROM auth_rate_limits WHERE scope='invite_redeem_ip' AND key_hash=?", trustedKey)).attempts;
  let last;
  for (let attempt = 0; attempt < 31; attempt += 1) {
    last = await redeem({ agencyCode: `UNKNOWN-${attempt}`, invitationToken: inviteToken(`rotated-${attempt}`), idToken: 'invalid-line-token' }, '192.0.2.44');
  }
  assert.equal(last.status, 429);
  assert.equal(last.body.error, 'ลองใหม่ภายหลัง');
  assert.equal((await first("SELECT COALESCE(SUM(attempts),0) attempts FROM auth_rate_limits WHERE scope='invite_redeem_ip' AND key_hash=?", trustedKey)).attempts, before + 31, 'spoofed header is ignored without request.cf');
});

test('rate-limit cleanup is bounded and removes stale D1 rows', async () => {
  const repository = new D1Repository(db);
  const now = 64 * 60_000 * 1000;
  await run("INSERT INTO auth_rate_limits(scope,key_hash,window_start,attempts,updated_at) VALUES('stale','stale-key',0,1,0)");
  assert.equal(await repository.consumeAuthAttempt('cleanup-test', `00${'a'.repeat(62)}`, now, 60_000, 5), true);
  assert.equal((await first("SELECT count(*) count FROM auth_rate_limits WHERE scope='stale'")).count, 0);
  assert.equal((await first("SELECT count(*) count FROM auth_rate_limits WHERE scope='cleanup-test'")).count, 1);
});
