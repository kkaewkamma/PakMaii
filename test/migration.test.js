import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations } from '../db/migrate.js';
import { captureProtectedState, verifyDatabase } from '../db/verification.js';

function createRelationalFixture(filename) {
  const db = new Database(filename);
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE users(id INTEGER PRIMARY KEY, line_id TEXT UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'farmer' CHECK(role IN ('farmer','ics')), created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE plots(id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL, crop TEXT NOT NULL, area TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE activities(id INTEGER PRIMARY KEY, plot_id INTEGER NOT NULL REFERENCES plots(id), user_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL, details TEXT NOT NULL, activity_date TEXT NOT NULL, photo_url TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE approvals(id INTEGER PRIMARY KEY, plot_id INTEGER NOT NULL REFERENCES plots(id), user_id INTEGER NOT NULL REFERENCES users(id), input_name TEXT NOT NULL, details TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), reviewer_id INTEGER REFERENCES users(id), reviewed_at TEXT, comment TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE lots(id INTEGER PRIMARY KEY, plot_id INTEGER NOT NULL REFERENCES plots(id), code TEXT NOT NULL UNIQUE, crop TEXT NOT NULL, harvest_date TEXT NOT NULL, quantity REAL NOT NULL CHECK(quantity >= 0), created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE reviews(id INTEGER PRIMARY KEY, plot_id INTEGER NOT NULL REFERENCES plots(id), reviewer_id INTEGER NOT NULL REFERENCES users(id), result TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);

    INSERT INTO users(id,line_id,name,role) VALUES
      (11,'line-farmer-1','Farmer One','farmer'),
      (22,'line-farmer-2','Farmer Two','farmer'),
      (35,'line-ics-1','ICS One','ics');
    INSERT INTO plots(id,owner_id,name,crop,area) VALUES(101,11,'Plot A','Rice','2 rai'),(102,22,'Plot B','Herbs','1 rai');
    INSERT INTO activities(id,plot_id,user_id,kind,details,activity_date) VALUES(201,101,11,'plant','seeded','2026-01-01');
    INSERT INTO approvals(id,plot_id,user_id,input_name,details,status,reviewer_id) VALUES(301,101,11,'compost','organic','approved',35);
    INSERT INTO lots(id,plot_id,code,crop,harvest_date,quantity) VALUES(401,101,'LOT-A','Rice','2026-02-01',20);
    INSERT INTO reviews(id,plot_id,reviewer_id,result,note) VALUES(501,101,35,'pass','ok');
    INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('hash-1',11,4102444800000);
  `);
  return db;
}

test('migration preserves relational data, row counts, and primary keys', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtg-migration-'));
  const filename = path.join(dir, 'fixture.db');
  const db = createRelationalFixture(filename);
  const before = captureProtectedState(db);

  assert.deepEqual(runMigrations(db), [1, 2]);
  const verification = verifyDatabase(db, before);
  assert.deepEqual(verification.integrity, ['ok']);
  assert.deepEqual(verification.foreignKeyErrors, []);
  assert.equal(verification.preserved, true);
  assert.deepEqual(db.prepare('SELECT id,line_id,name,role,status FROM users ORDER BY id').all(), [
    { id: 11, line_id: 'line-farmer-1', name: 'Farmer One', role: 'farmer', status: 'active' },
    { id: 22, line_id: 'line-farmer-2', name: 'Farmer Two', role: 'farmer', status: 'active' },
    { id: 35, line_id: 'line-ics-1', name: 'ICS One', role: 'ics', status: 'active' },
  ]);
  assert.equal(db.prepare('SELECT reviewer_id FROM reviews WHERE id=501').get().reviewer_id, 35);
  assert.equal(db.prepare('SELECT user_id FROM sessions WHERE token_hash=?').get('hash-1').user_id, 11);
  assert.deepEqual(runMigrations(db), []);

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('admin role is separate and assignments retain history with one active row per farmer', () => {
  const db = createRelationalFixture(':memory:');
  runMigrations(db);
  db.prepare("INSERT INTO users(id,line_id,name,role,status,linked_at) VALUES(?,?,?,'admin','active',CURRENT_TIMESTAMP)").run(90, 'line-admin', 'Admin');

  db.prepare('INSERT INTO farmer_assignments(id,ics_user_id,farmer_user_id,assigned_by) VALUES(1,35,11,90)').run();
  assert.throws(() => db.prepare('INSERT INTO farmer_assignments(id,ics_user_id,farmer_user_id,assigned_by) VALUES(2,35,11,90)').run(), /UNIQUE/);
  db.prepare("UPDATE farmer_assignments SET ends_at=datetime('now') WHERE id=1").run();
  db.prepare('INSERT INTO farmer_assignments(id,ics_user_id,farmer_user_id,assigned_by) VALUES(2,35,11,90)').run();
  assert.equal(db.prepare('SELECT count(*) count FROM farmer_assignments WHERE farmer_user_id=11').get().count, 2);
  assert.equal(db.prepare('SELECT count(*) count FROM farmer_assignments WHERE farmer_user_id=11 AND ends_at IS NULL').get().count, 1);
  assert.throws(() => db.prepare('INSERT INTO farmer_assignments(ics_user_id,farmer_user_id,assigned_by) VALUES(11,22,90)').run(), /ICS officer/);
  db.close();
});

test('a failed migration rolls back schema and version record', () => {
  const db = createRelationalFixture(':memory:');
  runMigrations(db);
  const failing = {
    version: 99,
    name: 'intentional_failure',
    up(database) {
      database.exec('CREATE TABLE must_rollback(id INTEGER PRIMARY KEY)');
      throw new Error('intentional failure');
    },
  };
  assert.throws(() => runMigrations(db, [failing]), /intentional failure/);
  assert.equal(db.prepare("SELECT count(*) count FROM sqlite_master WHERE type='table' AND name='must_rollback'").get().count, 0);
  assert.equal(db.prepare('SELECT count(*) count FROM schema_migrations WHERE version=99').get().count, 0);
  assert.equal(db.pragma('integrity_check')[0].integrity_check, 'ok');
  db.close();
});

test('verified backup retains related rows before migration', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtg-backup-'));
  const sourcePath = path.join(dir, 'source.db');
  const backupPath = path.join(dir, 'backup.db');
  const source = createRelationalFixture(sourcePath);
  const before = captureProtectedState(source);
  await source.backup(backupPath);
  const backup = new Database(backupPath, { readonly: true });
  const verification = verifyDatabase(backup, before);
  assert.equal(verification.preserved, true);
  assert.deepEqual(verification.foreignKeyErrors, []);
  assert.deepEqual(verification.integrity, ['ok']);
  backup.close();
  source.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
