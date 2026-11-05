import { migration001 } from './migrations/001_auth_identity_and_rbac.js';
import { migration002 } from './migrations/002_admin_password_credentials.js';

export const migrations = [migration001, migration002];

export function ensureMigrationTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations(
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}

export function runMigrations(db, availableMigrations = migrations) {
  ensureMigrationTable(db);
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(row => row.version));
  const completed = [];

  for (const migration of [...availableMigrations].sort((a, b) => a.version - b.version)) {
    if (applied.has(migration.version)) continue;
    if (db.inTransaction) throw new Error('Migration runner must not be called inside a transaction');

    const previousForeignKeys = db.pragma('foreign_keys', { simple: true });
    if (migration.foreignKeysOff) db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        migration.up(db);
        const violations = db.pragma('foreign_key_check');
        if (violations.length) throw new Error(`Foreign key violations in migration ${migration.version}: ${JSON.stringify(violations)}`);
        db.prepare('INSERT INTO schema_migrations(version,name) VALUES(?,?)').run(migration.version, migration.name);
      })();
      completed.push(migration.version);
    } finally {
      db.pragma(`foreign_keys = ${previousForeignKeys ? 'ON' : 'OFF'}`);
    }
  }

  return completed;
}
