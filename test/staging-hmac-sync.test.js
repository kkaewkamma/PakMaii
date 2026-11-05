import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertSynchronizationTarget, STAGING_TARGET, synchronizationCommands, validateEmptyPrecheck,
} from '../scripts/staging-hmac-sync-plan.js';
import { removeEmptySecureTempDir, wipeAndRemoveFile } from '../scripts/secure-temp.js';

test('HMAC synchronization is pinned to the approved staging target', () => {
  const config = { name: STAGING_TARGET.workerName, vars: { ENVIRONMENT: 'staging' } };
  const database = { database_name: STAGING_TARGET.databaseName, database_id: STAGING_TARGET.databaseId };
  assert.doesNotThrow(() => assertSynchronizationTarget(config, database));
  assert.throws(() => assertSynchronizationTarget({ ...config, name: 'production' }, database), /approved staging/);
  assert.throws(() => assertSynchronizationTarget(config, { ...database, database_id: 'wrong' }), /approved staging/);
});

test('synchronization plan uses one secret file and deploys before remote seed', () => {
  const plan = synchronizationCommands({ wrangler: 'wrangler.js', configFile: 'staging.json', secretsFile: 'secret.tmp', seedFile: 'seed.tmp', tag: 'candidate-tag' });
  assert.deepEqual(plan.upload.slice(0, 3), ['wrangler.js', 'versions', 'upload']);
  assert.ok(plan.upload.includes('--secrets-file'));
  assert.ok(plan.upload.includes('secret.tmp'));
  assert.deepEqual(plan.deploy.slice(0, 3), ['wrangler.js', 'versions', 'deploy']);
  assert.ok(plan.deploy.includes('candidate-tag@100%'));
  assert.deepEqual(plan.seed.slice(0, 3), ['wrangler.js', 'd1', 'execute']);
  assert.ok(plan.seed.includes('seed.tmp'));
  assert.ok(!JSON.stringify(plan).includes('AGENCY_CODE_HMAC_KEYS'));
  assert.match(plan.verify.join(' '), /ends_at IS NULL/);
  assert.doesNotMatch(plan.verify.join(' '), /ended_at/);
});

test('secure cleanup overwrites files and removes an empty Windows temp directory', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rtg-staging-hmac-sync-'));
  const secretFile = path.join(directory, 'secrets.json');
  const seedFile = path.join(directory, 'seed.sql');
  fs.writeFileSync(secretFile, 'synthetic-secret-never-logged');
  fs.writeFileSync(seedFile, 'synthetic-seed');
  wipeAndRemoveFile(secretFile);
  wipeAndRemoveFile(seedFile);
  assert.equal(fs.existsSync(secretFile), false);
  assert.equal(fs.existsSync(seedFile), false);
  removeEmptySecureTempDir(directory);
  assert.equal(fs.existsSync(directory), false);
  assert.throws(() => removeEmptySecureTempDir(path.resolve('.')), /Refusing/);
});

test('remote precheck requires migrations 0001-0005 and empty identity tables', () => {
  const valid = [
    { results: Array.from({ length: 5 }, (_, index) => ({ id: index + 1, name: `000${index + 1}.sql` })) },
    { results: [{ users_count: 0 }] },
    { results: [{ assignments_count: 0 }] },
  ];
  assert.doesNotThrow(() => validateEmptyPrecheck(valid));
  assert.throws(() => validateEmptyPrecheck(valid.map((item, index) => index === 1 ? { results: [{ users_count: 1 }] } : item)), /not empty/);
  assert.throws(() => validateEmptyPrecheck(valid.slice(1)), /not exactly/);
});
