import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStagingConfig, validateStagingOptions } from '../scripts/staging-config.js';
import { buildStagingSeed } from '../scripts/staging-seed.js';

const valid = {
  databaseId: '12345678-1234-4234-8234-123456789abc',
  databaseName: 'ready-to-grow-staging',
  workerName: 'ready-to-grow-staging',
  liffId: '1234567890-AbCdEf',
  lineChannelId: '1234567890',
};

test('staging config is isolated and rejects placeholder or non-staging bindings', () => {
  const config = buildStagingConfig(valid);
  assert.equal(config.vars.ENVIRONMENT, 'staging');
  assert.equal(config.d1_databases[0].database_id, valid.databaseId);
  assert.deepEqual(config.assets.run_worker_first, ['/api/*']);
  assert.throws(() => validateStagingOptions({ ...valid, databaseId: '00000000-0000-0000-0000-000000000000' }), /non-zero/);
  assert.throws(() => validateStagingOptions({ ...valid, databaseName: 'production' }), /staging name/);
});

test('staging seed has all roles and stores hashes without passwords or LINE identities', async () => {
  const keyRing = `v1:${Buffer.alloc(32, 7).toString('base64url')}`;
  const sql = await buildStagingSeed({ users: [
    { id: 910001, agencyCode: 'ADMIN-T01', name: 'Staging Admin', role: 'admin' },
    { id: 910002, agencyCode: 'ICS-T01', name: 'Staging ICS', role: 'ics' },
    { id: 910003, agencyCode: 'F-T01', name: 'Staging Farmer', role: 'farmer', assignedTo: 'ICS-T01' },
  ] }, keyRing);
  assert.match(sql, /agency_credentials/);
  assert.match(sql, /farmer_assignments/);
  assert.doesNotMatch(sql, /ADMIN-T01|ICS-T01|F-T01/);
  assert.doesNotMatch(sql, /password_hash|requested_line_id/);
  await assert.rejects(() => buildStagingSeed({ users: [
    { id: 1, agencyCode: 'ADMIN-01', name: 'Admin', role: 'admin', password: 'forbidden' },
    { id: 2, agencyCode: 'ICS-01', name: 'ICS', role: 'ics' },
    { id: 3, agencyCode: 'F-001', name: 'Farmer', role: 'farmer' },
  ] }, keyRing), /forbidden/);
});
