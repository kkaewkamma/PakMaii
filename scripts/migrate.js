import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import { runMigrations } from '../db/migrate.js';
import { captureProtectedState, verifyDatabase } from '../db/verification.js';

const source = path.resolve(process.env.DB_PATH || 'farm.db');
const backupDir = path.resolve('backups');
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(backupDir, `${path.basename(source)}.pre-migration-${stamp}.db`);

const db = new Database(source, { fileMustExist: true });
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
const before = captureProtectedState(db);

try {
  await db.backup(backup);
  const backupDb = new Database(backup, { readonly: true, fileMustExist: true });
  const backupVerification = verifyDatabase(backupDb, before);
  backupDb.close();
  if (backupVerification.integrity.some(value => value !== 'ok') || backupVerification.foreignKeyErrors.length || !backupVerification.preserved) {
    throw new Error('Backup verification failed; migration was not started');
  }

  const applied = runMigrations(db);
  const verification = verifyDatabase(db, before);
  if (verification.integrity.some(value => value !== 'ok') || verification.foreignKeyErrors.length || !verification.preserved) {
    throw new Error(`Post-migration verification failed. Restore from ${backup}`);
  }

  console.log(JSON.stringify({ database: source, backup, applied, verification }, null, 2));
} finally {
  db.close();
}

