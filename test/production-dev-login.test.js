import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtg-production-'));
process.env.NODE_ENV = 'production';
process.env.DEV_AUTH_ENABLED = 'true';
process.env.DB_PATH = path.join(tempDir, 'test.db');
const setup = new Database(process.env.DB_PATH);
setup.exec("CREATE TABLE users(id INTEGER PRIMARY KEY, line_id TEXT UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'farmer' CHECK(role IN ('farmer','ics')), created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
runMigrations(setup);
setup.close();

const { startServer, db } = await import('../server.js');
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

test('development login remains unavailable in production even when its flag is true', async () => {
  const response = await fetch(`${baseUrl}/api/dev/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agencyCode: 'ADMIN-001' }) });
  assert.equal(response.status, 404);
});

test('production config never advertises development authentication', async () => {
  const response = await fetch(`${baseUrl}/api/config`);
  assert.equal((await response.json()).development, false);
});

