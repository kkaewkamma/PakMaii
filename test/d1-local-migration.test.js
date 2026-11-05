import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'));

function findDatabase(directory) {
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(fullPath);
      else if (entry.name.endsWith('.sqlite')) return fullPath;
    }
  }
  throw new Error('Wrangler did not create a local D1 SQLite file');
}

test('D1 local migration enforces foreign keys, uniqueness, role triggers, and immutable audit logs', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtg-d1-local-'));
  const persistPath = path.join(tempDir, 'state');
  const executable = path.join(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const result = spawnSync(process.execPath, [executable,
    'd1', 'migrations', 'apply', 'ready-to-grow-local', '--local', '--persist-to', persistPath,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, XDG_CONFIG_HOME: path.join(tempDir, 'xdg'), WRANGLER_SEND_METRICS: 'false' },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const database = new Database(findDatabase(persistPath));
  database.pragma('foreign_keys = ON');
  assert.deepEqual(database.pragma('foreign_key_check'), []);
  assert.deepEqual(database.pragma('integrity_check'), [{ integrity_check: 'ok' }]);

  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);
  for (const table of ['users','plots','activities','approvals','lots','reviews','sessions','agency_credentials','farmer_assignments','registration_invites','registration_requests','audit_logs','admin_password_credentials','mutation_guards','auth_rate_limits','admin_identity_operations','d1_migrations']) {
    assert.ok(tables.includes(table), table);
  }
  const indexes = database.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(row => row.name);
  for (const index of ['plots_owner_id','activities_plot_date','approvals_plot_status','lots_plot_id','reviews_plot_id','sessions_expires_at','users_role_status','auth_rate_limits_updated_at','admin_identity_operations_target_time']) {
    assert.ok(indexes.includes(index), index);
  }

  database.exec(`
    INSERT INTO users(id,line_id,name,role,status,linked_at) VALUES
      (1,'farmer-line','Farmer','farmer','active',CURRENT_TIMESTAMP),
      (2,'ics-line','ICS','ics','active',CURRENT_TIMESTAMP),
      (3,'admin-line','Admin','admin','active',CURRENT_TIMESTAMP),
      (4,'farmer-line-2','Farmer 2','farmer','active',CURRENT_TIMESTAMP);
    INSERT INTO farmer_assignments(id,ics_user_id,farmer_user_id,assigned_by) VALUES(1,2,1,3);
    INSERT INTO audit_logs(id,actor_user_id,event_type,target_type,metadata_json) VALUES(1,3,'test','user','{}');
  `);
  assert.throws(() => database.prepare('INSERT INTO plots(owner_id,name,crop) VALUES(999,?,?)').run('Bad', 'Bad'), /FOREIGN KEY/);
  assert.throws(() => database.prepare('INSERT INTO users(line_id,name,role,status,linked_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)').run('farmer-line', 'Duplicate', 'farmer', 'active'), /UNIQUE/);
  assert.throws(() => database.prepare('INSERT INTO farmer_assignments(ics_user_id,farmer_user_id,assigned_by) VALUES(2,1,3)').run(), /UNIQUE/);
  assert.throws(() => database.prepare('INSERT INTO farmer_assignments(ics_user_id,farmer_user_id,assigned_by) VALUES(1,4,3)').run(), /ICS officer/);
  assert.throws(() => database.prepare("UPDATE audit_logs SET event_type='changed' WHERE id=1").run(), /append-only/);
  assert.throws(() => database.prepare('DELETE FROM audit_logs WHERE id=1').run(), /append-only/);
  database.prepare("INSERT INTO admin_identity_operations(action,target_user_id,requested_line_id,operator_ref,reason) VALUES('recover',3,'admin-line-new','migration-test','verified recovery test')").run();
  assert.equal(database.prepare('SELECT line_id FROM users WHERE id=3').get().line_id, 'admin-line-new');
  assert.throws(() => database.prepare("UPDATE admin_identity_operations SET reason='changed' WHERE id=1").run(), /append-only/);
  assert.throws(() => database.prepare('DELETE FROM admin_identity_operations WHERE id=1').run(), /append-only/);
  assert.throws(() => database.transaction(() => {
    database.prepare('UPDATE farmer_assignments SET ends_at=CURRENT_TIMESTAMP WHERE id=999 AND ends_at IS NULL').run();
    database.prepare('INSERT INTO mutation_guards(value) VALUES(changes())').run();
    database.prepare("INSERT INTO audit_logs(actor_user_id,event_type,target_type,target_id) VALUES(3,'assignment.ended','farmer_assignment','999')").run();
  })(), /CHECK/);
  assert.equal(database.prepare("SELECT count(*) count FROM audit_logs WHERE target_id='999'").get().count, 0);
  database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
