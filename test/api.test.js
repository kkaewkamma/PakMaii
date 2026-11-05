import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { agencyCodeDigests } from '../lib/agency-code.js';
import crypto from 'node:crypto';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ready-to-grow-'));
process.env.NODE_ENV = 'development';
process.env.DEV_AUTH_ENABLED = 'true';
process.env.DB_PATH = path.join(tempDir, 'test.db');
const testKey = crypto.randomBytes(32);
process.env.AGENCY_CODE_HMAC_KEYS = `test-v1:${testKey.toString('base64url')}`;

const bootstrapDb = new Database(process.env.DB_PATH);
bootstrapDb.exec("CREATE TABLE users(id INTEGER PRIMARY KEY, line_id TEXT UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'farmer' CHECK(role IN ('farmer','ics')), created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
runMigrations(bootstrapDb);
bootstrapDb.exec("INSERT INTO users(id,line_id,name,role,status,linked_at) VALUES(1,'dev-farmer','Dev Farmer','farmer','active',CURRENT_TIMESTAMP),(2,'dev-ics','Dev ICS','ics','active',CURRENT_TIMESTAMP),(3,'dev-other','Other Farmer','farmer','active',CURRENT_TIMESTAMP)");
for (const [userId, code] of [[1,'F-001'],[2,'ICS-001'],[3,'F-002']]) {
  const [{ digest }] = agencyCodeDigests(code, [{ version: 'test-v1', key: testKey }]);
  bootstrapDb.prepare('INSERT INTO agency_credentials(user_id,key_version,code_digest,code_hint) VALUES(?,?,?,?)').run(userId, 'test-v1', digest, code);
}
bootstrapDb.close();

const { startServer, db } = await import('../server.js');
let server;
let baseUrl;
let farmerToken;
let icsToken;
let otherFarmerToken;
let plotId;

const request = async (route, { method = 'GET', token, body } = {}) => {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
};

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

test('health and localhost development config work', async () => {
  const health = await request('/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { ok: true, service: 'ready-to-grow' });
  const config = await request('/api/config');
  assert.equal(config.body.development, true);
});

test('development users can log in with separate roles', async () => {
  const farmer = await request('/api/dev/login', { method: 'POST', body: { agencyCode: 'F-001' } });
  const ics = await request('/api/dev/login', { method: 'POST', body: { agencyCode: 'ICS-001' } });
  const other = await request('/api/dev/login', { method: 'POST', body: { agencyCode: 'F-002' } });
  assert.equal(farmer.status, 200);
  assert.equal(ics.status, 200);
  assert.equal(farmer.body.user.role, 'farmer');
  assert.equal(ics.body.user.role, 'ics');
  assert.equal(farmer.body.redirectTo, 'home');
  assert.equal(ics.body.redirectTo, 'risks');
  farmerToken = farmer.body.token;
  icsToken = ics.body.token;
  otherFarmerToken = other.body.token;
});

test('development login is unavailable through a tunnel or reverse proxy', async () => {
  const response = await fetch(`${baseUrl}/api/dev/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.10' },
    body: JSON.stringify({ agencyCode: 'ICS-001' }),
  });
  assert.equal(response.status, 404);
});

test('authentication and farmer CRUD validation work', async () => {
  assert.equal((await request('/api/plots')).status, 401);
  const created = await request('/api/plots', { method: 'POST', token: farmerToken, body: { name: 'แปลงทดสอบ', crop: 'ผักกาด', area: '1 ไร่' } });
  assert.equal(created.status, 201);
  plotId = created.body.id;
  const updated = await request(`/api/plots/${plotId}`, { method: 'PATCH', token: farmerToken, body: { name: 'แปลงทดสอบแก้ไข', crop: 'คะน้า', area: '2 ไร่' } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.name, 'แปลงทดสอบแก้ไข');
  assert.equal(updated.body.crop, 'คะน้า');
  assert.equal(updated.body.area, '2 ไร่');
  assert.equal((await request(`/api/plots/${plotId}`, { method: 'PATCH', token: farmerToken, body: { name: '   ' } })).status, 400);
  assert.equal((await request(`/api/plots/${plotId}`, { method: 'PATCH', token: farmerToken, body: { name: 123 } })).status, 400);
  assert.equal((await request(`/api/plots/${plotId}`, { method: 'PATCH', token: farmerToken, body: { area: 'x'.repeat(201) } })).status, 400);
  assert.equal((await request(`/api/plots/${plotId}`, { method: 'PATCH', token: farmerToken, body: { owner_id: 3 } })).status, 400);
  assert.equal((await request(`/api/plots/${plotId}`, { method: 'PATCH', token: icsToken, body: { name: 'ICS edit' } })).status, 403);
  assert.equal((await request(`/api/plots/${plotId}`, { method: 'PATCH', token: otherFarmerToken, body: { name: 'Cross-account edit' } })).status, 403);
  const invalidPhoto = await request('/api/activities', { method: 'POST', token: farmerToken, body: { plot_id: plotId, kind: 'ปลูก', details: 'ทดสอบ', activity_date: '2026-10-14', photo_url: 'http://example.com/a.jpg' } });
  assert.equal(invalidPhoto.status, 400);
  const lot = await request('/api/lots', { method: 'POST', token: farmerToken, body: { plot_id: plotId, code: 'LOT-001', crop: 'ผักกาด', harvest_date: '2026-10-14', quantity: 10 } });
  assert.equal(lot.status, 201);
});

test('role authorization protects ICS operations', async () => {
  assert.equal((await request('/api/risks', { token: farmerToken })).status, 403);
  assert.equal((await request('/api/risks', { token: icsToken })).status, 200);
  const icsLot = await request('/api/lots', { method: 'POST', token: icsToken, body: { plot_id: plotId, code: 'LOT-ICS', crop: 'ผัก', harvest_date: '2026-10-14', quantity: 1 } });
  assert.equal(icsLot.status, 403);
});

test('logout revokes the current session', async () => {
  assert.equal((await request('/api/logout', { method: 'POST', token: farmerToken })).status, 200);
  assert.equal((await request('/api/me', { token: farmerToken })).status, 401);
});
