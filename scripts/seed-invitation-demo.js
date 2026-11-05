import Database from 'better-sqlite3';
import path from 'node:path';
import 'dotenv/config';
import { agencyCodeDigests, ensureDevelopmentKeyFile, loadAgencyKeyRing } from '../lib/agency-code.js';

if (process.env.NODE_ENV !== 'development') throw new Error('Demo seed is restricted to NODE_ENV=development');
ensureDevelopmentKeyFile();
const [primaryKey] = loadAgencyKeyRing();
const databasePath = path.resolve(process.env.DB_PATH || 'farm.db');
const db = new Database(databasePath, { fileMustExist: true });
db.pragma('foreign_keys = ON');
if (!db.prepare("SELECT 1 FROM schema_migrations WHERE version=1").get()) throw new Error('Phase 1 migration is required before demo seed');

const seed = db.transaction(() => {
  const ensureCredential = (userId, code) => {
    const [{ digest }] = agencyCodeDigests(code, [primaryKey]);
    const existing = db.prepare('SELECT * FROM agency_credentials WHERE user_id=?').get(userId);
    if (!existing) db.prepare('INSERT INTO agency_credentials(user_id,key_version,code_digest,code_hint) VALUES(?,?,?,?)').run(userId, primaryKey.version, digest, code);
    else if (existing.code_hint !== code) throw new Error(`User ${userId} already has a different agency identity`);
  };

  let admin = db.prepare("SELECT * FROM users WHERE line_id='dev-admin'").get();
  if (!admin) {
    const result = db.prepare("INSERT INTO users(line_id,name,role,status,linked_at) VALUES('dev-admin','Development Admin','admin','active',CURRENT_TIMESTAMP)").run();
    admin = db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid);
  } else if (admin.role !== 'admin' || admin.status !== 'active') {
    throw new Error('Existing dev-admin identity is not an active admin');
  }
  ensureCredential(admin.id, 'ADMIN-001');

  let officer = db.prepare("SELECT * FROM users WHERE line_id='dev-ics'").get();
  if (!officer) {
    const result = db.prepare("INSERT INTO users(line_id,name,role,status,linked_at) VALUES('dev-ics','Development ICS','ics','active',CURRENT_TIMESTAMP)").run();
    officer = db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid);
  } else if (officer.role !== 'ics' || officer.status !== 'active') {
    throw new Error('Existing dev-ics identity is not an active ICS officer');
  }
  ensureCredential(officer.id, 'ICS-001');

  let farmer = db.prepare("SELECT u.* FROM users u JOIN agency_credentials c ON c.user_id=u.id WHERE c.code_hint='F-001'").get();
  if (!farmer) {
    const result = db.prepare("INSERT INTO users(line_id,name,role,status) VALUES(NULL,'Farmer F-001','farmer','unlinked')").run();
    farmer = db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid);
    ensureCredential(farmer.id, 'F-001');
  } else if (farmer.role !== 'farmer') {
    throw new Error('Existing F-001 identity is not a farmer');
  }
  if (farmer.status === 'unlinked' && farmer.line_id === null) {
    const activeInvite = db.prepare("SELECT 1 FROM registration_invites WHERE user_id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?").get(farmer.id, new Date().toISOString());
    if (activeInvite) throw new Error('F-001 has an active invitation; revoke it before enabling unified development login');
    db.prepare("UPDATE users SET line_id='dev-f001',status='active',linked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(farmer.id);
  } else if (farmer.status !== 'active' || farmer.line_id !== 'dev-f001') {
    throw new Error('Existing F-001 identity conflicts with the unified development identity');
  }

  if (!db.prepare('SELECT 1 FROM farmer_assignments WHERE ics_user_id=? AND farmer_user_id=? AND ends_at IS NULL').get(officer.id, farmer.id)) {
    db.prepare('INSERT INTO farmer_assignments(ics_user_id,farmer_user_id,assigned_by) VALUES(?,?,?)').run(officer.id, farmer.id, admin.id);
  }

  let invitationFarmer = db.prepare("SELECT u.* FROM users u JOIN agency_credentials c ON c.user_id=u.id WHERE c.code_hint='F-002'").get();
  if (!invitationFarmer) {
    const result = db.prepare("INSERT INTO users(line_id,name,role,status) VALUES(NULL,'Farmer F-002','farmer','unlinked')").run();
    invitationFarmer = db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid);
    ensureCredential(invitationFarmer.id, 'F-002');
  }
  return { adminId: admin.id, icsId: officer.id, farmerId: farmer.id, invitationFarmerId: invitationFarmer.id, developmentCodes: ['F-001','ICS-001','ADMIN-001'] };
});

try {
  const result = seed();
  console.log(JSON.stringify({ seeded: true, ...result, secretStoredLocally: true }, null, 2));
} finally {
  db.close();
}
