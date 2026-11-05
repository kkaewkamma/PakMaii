import express from 'express';
import Database from 'better-sqlite3';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { agencyCodeDigests, invitationTokenHash, loadAgencyKeyRing } from './lib/agency-code.js';
import { verifyPassword } from './lib/password.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDevelopment = process.env.NODE_ENV === 'development';
const devAuthEnabled = isDevelopment && process.env.DEV_AUTH_ENABLED === 'true';
const dbPath = path.resolve(process.env.DB_PATH || path.join(__dirname, 'farm.db'));
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, line_id TEXT UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'farmer' CHECK(role IN ('farmer','ics')), created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS plots(id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL, crop TEXT NOT NULL, area TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS activities(id INTEGER PRIMARY KEY, plot_id INTEGER NOT NULL REFERENCES plots(id), user_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL, details TEXT NOT NULL, activity_date TEXT NOT NULL, photo_url TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS approvals(id INTEGER PRIMARY KEY, plot_id INTEGER NOT NULL REFERENCES plots(id), user_id INTEGER NOT NULL REFERENCES users(id), input_name TEXT NOT NULL, details TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), reviewer_id INTEGER REFERENCES users(id), reviewed_at TEXT, comment TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS lots(id INTEGER PRIMARY KEY, plot_id INTEGER NOT NULL REFERENCES plots(id), code TEXT NOT NULL UNIQUE, crop TEXT NOT NULL, harvest_date TEXT NOT NULL, quantity REAL NOT NULL CHECK(quantity >= 0), created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY, plot_id INTEGER NOT NULL REFERENCES plots(id), reviewer_id INTEGER NOT NULL REFERENCES users(id), result TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);`);
if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get() || !db.prepare('SELECT 1 FROM schema_migrations WHERE version=2').get()) {
  db.close();
  throw new Error('Database migration version 2 is required. Run npm run migrate before starting the server.');
}
db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());

export const app = express();
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'", 'https://static.line-scdn.net'],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://*.line.me', 'https://*.line-scdn.net'],
      frameSrc: ['https://*.line.me'],
      frameAncestors: ["'self'"],
      baseUri: ["'none'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
      manifestSrc: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
}));
app.use(express.json({ limit: '100kb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use(express.static(path.join(__dirname, 'public')));

class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const text = (value, field, max = 500) => {
  if (value === undefined || value === null || String(value).trim() === '') throw new HttpError(400, `กรุณากรอก ${field}`);
  const clean = String(value).trim();
  if (clean.length > max) throw new HttpError(400, `${field} ยาวเกินกำหนด`);
  return clean;
};
const optionalText = (value, field, max = 500) => value === undefined || value === null || String(value).trim() === '' ? '' : text(value, field, max);
const positiveId = (value, field = 'รหัส') => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, `${field} ไม่ถูกต้อง`);
  return id;
};
const isoDate = (value, field) => {
  const date = text(value, field, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new HttpError(400, `${field} ไม่ถูกต้อง`);
  return date;
};
const photoUrl = value => {
  if (!value) return null;
  let parsed;
  try { parsed = new URL(String(value)); } catch { throw new HttpError(400, 'ลิงก์รูปภาพไม่ถูกต้อง'); }
  if (parsed.protocol !== 'https:') throw new HttpError(400, 'ลิงก์รูปภาพต้องเป็น HTTPS');
  return parsed.toString();
};
const makeSession = userId => {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hash, userId, Date.now() + 7 * 86_400_000);
  return token;
};
function auth(req, res, next) {
  const match = (req.headers.authorization || '').match(/^Bearer ([A-Fa-f0-9]{64})$/);
  if (!match) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  const hash = crypto.createHash('sha256').update(match[1]).digest('hex');
  const row = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(hash, Date.now());
  if (!row) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  if (row.status !== 'active') return res.status(403).json({ error: 'บัญชีถูกระงับหรือยังไม่พร้อมใช้งาน' });
  req.sessionHash = hash;
  req.user = row;
  next();
}
const ics = (req, res, next) => req.user.role === 'ics' ? next() : res.status(403).json({ error: 'เฉพาะเจ้าหน้าที่ ICS' });
const admin = (req, res, next) => req.user.role === 'admin' && req.user.status === 'active' ? next() : res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบ' });
function ownPlot(req, rawId) {
  const id = positiveId(rawId, 'รหัสแปลง');
  const plot = db.prepare('SELECT * FROM plots WHERE id=?').get(id);
  if (!plot) throw new HttpError(404, 'ไม่พบแปลง');
  if (req.user.role === 'admin') return plot;
  if (req.user.role === 'farmer' && plot.owner_id === req.user.id) return plot;
  if (req.user.role === 'ics' && db.prepare('SELECT 1 FROM farmer_assignments WHERE ics_user_id=? AND farmer_user_id=? AND ends_at IS NULL').get(req.user.id, plot.owner_id)) return plot;
  throw new HttpError(403, 'ไม่มีสิทธิ์เข้าถึงแปลง');
}
const isLoopback = req => {
  const cameThroughProxy = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.headers.forwarded;
  return !cameThroughProxy && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
};

async function verifyLineIdToken(idToken) {
  const token = text(idToken, 'LINE ID token', 4096);
  if (!process.env.LINE_CHANNEL_ID) throw new HttpError(503, 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ID');
  const response = await fetch('https://api.line.me/oauth2/v2.1/verify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ id_token: token, client_id: process.env.LINE_CHANNEL_ID }) });
  const profile = await response.json().catch(() => ({}));
  if (!response.ok || !profile.sub) throw new HttpError(401, 'LINE authentication ไม่สำเร็จ');
  return profile;
}

function writeAudit(eventType, actorUserId, targetType, targetId, metadata = {}) {
  db.prepare('INSERT INTO audit_logs(actor_user_id,event_type,target_type,target_id,metadata_json) VALUES(?,?,?,?,?)')
    .run(actorUserId ?? null, eventType, targetType, targetId == null ? null : String(targetId), JSON.stringify(metadata));
}

const redeemLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'ลองใหม่ภายหลัง' } });
const adminLoginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'ลองใหม่ภายหลัง' } });
const genericRegistrationError = () => new HttpError(400, 'ข้อมูลลงทะเบียนหรือคำเชิญไม่ถูกต้อง');
const landingForRole = role => ({ farmer: 'home', ics: 'risks', admin: 'invites' })[role];

app.post('/api/login', wrap(async (req, res) => {
  const profile = await verifyLineIdToken(req.body?.idToken);
  const user = db.prepare('SELECT * FROM users WHERE line_id=?').get(profile.sub);
  if (!user) throw new HttpError(403, 'ต้องลงทะเบียนบัญชีก่อน', 'REGISTRATION_REQUIRED');
  if (user.status !== 'active') throw new HttpError(403, 'บัญชีไม่พร้อมใช้งาน');
  res.set('Cache-Control', 'no-store').json({ token: makeSession(user.id), user, redirectTo: landingForRole(user.role) });
}));
app.post('/api/dev/login', wrap((req, res) => {
  if (!devAuthEnabled || !isLoopback(req)) throw new HttpError(404, 'ไม่พบ endpoint');
  let keyRing;
  try { keyRing = loadAgencyKeyRing(); } catch { throw new HttpError(503, 'Development identity ยังไม่พร้อมใช้งาน'); }
  const candidates = agencyCodeDigests(req.body?.agencyCode, keyRing);
  if (!candidates.length) throw new HttpError(401, 'รหัสประจำตัวไม่ถูกต้อง');
  const credential = db.prepare(`SELECT user_id FROM agency_credentials WHERE code_digest IN (${candidates.map(() => '?').join(',')})`).get(...candidates.map(item => item.digest));
  const user = credential ? db.prepare('SELECT * FROM users WHERE id=?').get(credential.user_id) : null;
  if (!user) throw new HttpError(401, 'รหัสประจำตัวไม่ถูกต้อง');
  if (user.role === 'admin') throw new HttpError(401, 'กรุณาใช้รหัสผ่าน Super User');
  if (user.status !== 'active') throw new HttpError(403, 'บัญชีถูกระงับหรือยังไม่พร้อมใช้งาน');
  res.set('Cache-Control', 'no-store').json({ token: makeSession(user.id), user, redirectTo: landingForRole(user.role) });
}));
app.post('/api/auth/admin/password-login', adminLoginLimiter, wrap((req, res) => {
  let keyRing;
  try { keyRing = loadAgencyKeyRing(); } catch { throw new HttpError(503, 'ระบบเข้าสู่ระบบยังไม่พร้อมใช้งาน'); }
  const candidates = agencyCodeDigests(req.body?.agencyCode, keyRing);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!candidates.length || !password) throw new HttpError(401, 'รหัสประจำตัวหรือรหัสผ่านไม่ถูกต้อง');
  const placeholders = candidates.map(() => '?').join(',');
  const row = db.prepare(`SELECT u.*,p.algorithm,p.salt,p.password_hash,p.parameters_json
    FROM users u JOIN agency_credentials c ON c.user_id=u.id
    JOIN admin_password_credentials p ON p.user_id=u.id
    WHERE c.code_digest IN (${placeholders})`).get(...candidates.map(item => item.digest));
  if (!row || row.role !== 'admin' || row.status !== 'active' || !verifyPassword(password, row)) throw new HttpError(401, 'รหัสประจำตัวหรือรหัสผ่านไม่ถูกต้อง');
  writeAudit('admin.password_login', row.id, 'user', row.id);
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(row.id);
  res.set('Cache-Control', 'no-store').json({ token: makeSession(user.id), user, redirectTo: 'invites' });
}));
app.get('/api/admin/users', auth, admin, wrap((req, res) => {
  res.json(db.prepare(`SELECT u.id,u.name,u.role,u.status,u.line_id IS NOT NULL linked,c.code_hint agency_code,u.created_at,u.updated_at
    FROM users u LEFT JOIN agency_credentials c ON c.user_id=u.id ORDER BY u.id`).all());
}));
app.post('/api/admin/users', auth, admin, wrap((req, res) => {
  const name = text(req.body?.name, 'ชื่อ', 100);
  const role = req.body?.role;
  if (!['farmer','ics'].includes(role)) throw new HttpError(400, 'สร้างได้เฉพาะ Farmer หรือ ICS');
  let keyRing;
  try { keyRing = loadAgencyKeyRing(); } catch { throw new HttpError(503, 'ระบบรหัสประจำตัวยังไม่พร้อมใช้งาน'); }
  const agencyCode = text(req.body?.agencyCode, 'รหัสประจำตัว', 32);
  const [primary] = agencyCodeDigests(agencyCode, keyRing);
  if (!primary) throw new HttpError(400, 'รูปแบบรหัสประจำตัวไม่ถูกต้อง');
  const userId = db.transaction(() => {
    const result = db.prepare("INSERT INTO users(line_id,name,role,status) VALUES(NULL,?,?,'unlinked')").run(name, role);
    db.prepare('INSERT INTO agency_credentials(user_id,key_version,code_digest,code_hint) VALUES(?,?,?,?)').run(result.lastInsertRowid, primary.version, primary.digest, agencyCode.toUpperCase());
    writeAudit('user.created', req.user.id, 'user', result.lastInsertRowid, { role });
    return result.lastInsertRowid;
  }).immediate();
  res.status(201).json({ id: userId });
}));
app.patch('/api/admin/users/:id/status', auth, admin, wrap((req, res) => {
  const id = positiveId(req.params.id), status = req.body?.status;
  if (!['active','disabled'].includes(status)) throw new HttpError(400, 'สถานะไม่ถูกต้อง');
  const target = db.prepare("SELECT * FROM users WHERE id=? AND role IN ('farmer','ics')").get(id);
  if (!target) throw new HttpError(404, 'ไม่พบบัญชีที่จัดการได้');
  db.transaction(() => {
    db.prepare('UPDATE users SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status, id);
    if (status === 'disabled') db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    writeAudit('user.status_changed', req.user.id, 'user', id, { from: target.status, to: status });
  }).immediate();
  res.json({ ok: true });
}));
app.get('/api/admin/assignments', auth, admin, wrap((req, res) => res.json(db.prepare(`SELECT fa.*,i.name ics_name,f.name farmer_name
  FROM farmer_assignments fa JOIN users i ON i.id=fa.ics_user_id JOIN users f ON f.id=fa.farmer_user_id ORDER BY fa.id DESC`).all())));
app.post('/api/admin/assignments', auth, admin, wrap((req, res) => {
  const icsUserId = positiveId(req.body?.icsUserId, 'รหัส ICS'), farmerUserId = positiveId(req.body?.farmerUserId, 'รหัส Farmer');
  const id = db.transaction(() => {
    db.prepare("UPDATE farmer_assignments SET ends_at=CURRENT_TIMESTAMP WHERE farmer_user_id=? AND ends_at IS NULL").run(farmerUserId);
    const result = db.prepare('INSERT INTO farmer_assignments(ics_user_id,farmer_user_id,assigned_by) VALUES(?,?,?)').run(icsUserId, farmerUserId, req.user.id);
    writeAudit('assignment.created', req.user.id, 'farmer_assignment', result.lastInsertRowid, { icsUserId, farmerUserId });
    return result.lastInsertRowid;
  }).immediate();
  res.status(201).json({ id });
}));
app.patch('/api/admin/assignments/:id/end', auth, admin, wrap((req, res) => {
  const id = positiveId(req.params.id);
  const changed = db.prepare('UPDATE farmer_assignments SET ends_at=CURRENT_TIMESTAMP WHERE id=? AND ends_at IS NULL').run(id).changes;
  if (!changed) throw new HttpError(404, 'ไม่พบ assignment ที่ active');
  writeAudit('assignment.ended', req.user.id, 'farmer_assignment', id);
  res.json({ ok: true });
}));
app.get('/api/admin/invites', auth, admin, wrap((req, res) => {
  const now = new Date().toISOString();
  const rows = db.prepare(`SELECT i.id,i.user_id target_user_id,u.name target_name,u.role target_role,u.status target_user_status,c.code_hint target_code,
    CASE WHEN i.used_at IS NOT NULL THEN 'used' WHEN i.revoked_at IS NOT NULL THEN 'revoked'
         WHEN i.expires_at<=? THEN 'expired' ELSE 'active' END status,
    i.created_at,i.expires_at,i.used_at,i.revoked_at
    FROM registration_invites i JOIN users u ON u.id=i.user_id
    LEFT JOIN agency_credentials c ON c.user_id=u.id ORDER BY i.id DESC LIMIT 200`).all(now);
  res.set('Cache-Control', 'no-store').json(rows);
}));
app.get('/api/admin/unlinked-farmers', auth, admin, wrap((req, res) => {
  res.set('Cache-Control', 'no-store').json(db.prepare(`SELECT u.id,u.name,c.code_hint agency_code
    FROM users u JOIN agency_credentials c ON c.user_id=u.id
    WHERE u.role='farmer' AND u.status='unlinked' AND u.line_id IS NULL ORDER BY c.code_hint`).all());
}));
app.get('/api/admin/unlinked-users', auth, admin, wrap((req, res) => {
  res.set('Cache-Control', 'no-store').json(db.prepare(`SELECT u.id,u.name,u.role,u.status,c.code_hint agency_code
    FROM users u JOIN agency_credentials c ON c.user_id=u.id
    WHERE u.role IN ('farmer','ics') AND u.status='unlinked' AND u.line_id IS NULL
    ORDER BY u.role,c.code_hint`).all());
}));
app.post('/api/admin/invites', auth, admin, wrap((req, res) => {
  const targetUserId = positiveId(req.body?.targetUserId, 'รหัสผู้ใช้เป้าหมาย');
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = invitationTokenHash(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60_000).toISOString();
  const created = db.transaction(() => {
    const target = db.prepare(`SELECT u.*,c.code_hint FROM users u JOIN agency_credentials c ON c.user_id=u.id WHERE u.id=?`).get(targetUserId);
    if (!target || target.role !== 'farmer' || target.status !== 'unlinked' || target.line_id !== null) throw new HttpError(409, 'บัญชีเป้าหมายไม่พร้อมรับคำเชิญ');
    const revoked = db.prepare('UPDATE registration_invites SET revoked_at=? WHERE user_id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?').run(now.toISOString(), targetUserId, now.toISOString()).changes;
    const result = db.prepare('INSERT INTO registration_invites(user_id,token_hash,created_by,expires_at) VALUES(?,?,?,?)').run(targetUserId, tokenHash, req.user.id, expiresAt);
    writeAudit('invitation.created', req.user.id, 'registration_invite', result.lastInsertRowid, { targetUserId, replacedActiveInvites: revoked, expiresAt });
    return result.lastInsertRowid;
  }).immediate();
  res.set('Cache-Control', 'no-store').status(201).json({ id: created, targetUserId, invitationToken: token, expiresAt });
}));
app.patch('/api/admin/invites/:id/revoke', auth, admin, wrap((req, res) => {
  const inviteId = positiveId(req.params.id, 'รหัสคำเชิญ');
  const now = new Date().toISOString();
  const changed = db.transaction(() => {
    const result = db.prepare('UPDATE registration_invites SET revoked_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?').run(now, inviteId, now);
    if (!result.changes) throw new HttpError(409, 'คำเชิญไม่ active หรือไม่พบ');
    writeAudit('invitation.revoked', req.user.id, 'registration_invite', inviteId);
    return result.changes;
  }).immediate();
  res.json({ ok: Boolean(changed) });
}));
app.post('/api/auth/register/invite', redeemLimiter, wrap(async (req, res) => {
  const agencyCode = optionalText(req.body?.agencyCode, 'รหัสประจำตัว', 32);
  const invitationToken = optionalText(req.body?.invitationToken, 'รหัสเชิญ', 200);
  if (!agencyCode || !/^[A-Za-z0-9_-]{43}$/.test(invitationToken)) throw genericRegistrationError();
  const profile = await verifyLineIdToken(req.body?.idToken);
  let keyRing;
  try { keyRing = loadAgencyKeyRing(); } catch { throw new HttpError(503, 'ระบบลงทะเบียนยังไม่พร้อมใช้งาน'); }
  const candidates = agencyCodeDigests(agencyCode, keyRing);
  if (!candidates.length) throw genericRegistrationError();
  const placeholders = candidates.map(() => '?').join(',');
  const credential = db.prepare(`SELECT * FROM agency_credentials WHERE code_digest IN (${placeholders})`).get(...candidates.map(item => item.digest));
  if (!credential) throw genericRegistrationError();
  const hash = invitationTokenHash(invitationToken);
  const now = new Date().toISOString();
  const user = db.transaction(() => {
    const target = db.prepare("SELECT * FROM users WHERE id=? AND role='farmer' AND status='unlinked' AND line_id IS NULL").get(credential.user_id);
    const invite = db.prepare('SELECT * FROM registration_invites WHERE token_hash=? AND user_id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?').get(hash, credential.user_id, now);
    if (!target || !invite || db.prepare('SELECT 1 FROM users WHERE line_id=?').get(profile.sub)) throw genericRegistrationError();
    const linked = db.prepare("UPDATE users SET line_id=?,status='active',linked_at=?,updated_at=? WHERE id=? AND line_id IS NULL AND status='unlinked'").run(profile.sub, now, now, target.id);
    const consumed = db.prepare('UPDATE registration_invites SET used_at=?,used_by_line_id=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?').run(now, profile.sub, invite.id, now);
    if (linked.changes !== 1 || consumed.changes !== 1) throw genericRegistrationError();
    const primaryDigest = candidates[0];
    db.prepare('UPDATE agency_credentials SET key_version=?,code_digest=?,claimed_at=COALESCE(claimed_at,?),updated_at=? WHERE user_id=?')
      .run(primaryDigest.version, primaryDigest.digest, now, now, target.id);
    writeAudit('account.linked', target.id, 'user', target.id, { invitationId: invite.id });
    return db.prepare('SELECT * FROM users WHERE id=?').get(target.id);
  }).immediate();
  res.set('Cache-Control', 'no-store').json({ token: makeSession(user.id), user, redirectTo: landingForRole(user.role) });
}));
app.post('/api/logout', auth, (req, res) => { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.sessionHash); res.set('Cache-Control', 'no-store').json({ ok: true }); });
app.get('/api/me', auth, (req, res) => res.set('Cache-Control', 'no-store').json(req.user));
app.get('/api/plots', auth, wrap((req, res) => {
  if (req.user.role === 'admin') return res.json(db.prepare('SELECT p.*,u.name owner FROM plots p JOIN users u ON u.id=p.owner_id ORDER BY p.id DESC').all());
  if (req.user.role === 'ics') return res.json(db.prepare('SELECT p.*,u.name owner FROM plots p JOIN users u ON u.id=p.owner_id JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL ORDER BY p.id DESC').all(req.user.id));
  res.json(db.prepare('SELECT * FROM plots WHERE owner_id=? ORDER BY id DESC').all(req.user.id));
}));
app.post('/api/plots', auth, wrap((req, res) => { if (req.user.role !== 'farmer') throw new HttpError(403, 'เฉพาะเกษตรกร'); const name = text(req.body.name, 'ชื่อแปลง', 100), crop = text(req.body.crop, 'พืชที่ปลูก', 100), area = optionalText(req.body.area, 'พื้นที่', 200); const result = db.prepare('INSERT INTO plots(owner_id,name,crop,area) VALUES(?,?,?,?)').run(req.user.id, name, crop, area); res.status(201).json({ id: result.lastInsertRowid }); }));
app.patch('/api/plots/:id', auth, wrap((req, res) => {
  if (req.user.role !== 'farmer') throw new HttpError(403, 'เฉพาะเกษตรกร');
  const plot = ownPlot(req, req.params.id);
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const allowed = new Set(['name','crop','area']);
  if (Object.keys(body).some(key => !allowed.has(key))) throw new HttpError(400, 'มีข้อมูลที่ไม่อนุญาตให้แก้ไข');
  for (const key of Object.keys(body)) if (typeof body[key] !== 'string') throw new HttpError(400, `${key} ต้องเป็นข้อความ`);
  const updates = [];
  const values = [];
  if (Object.hasOwn(body, 'name')) { updates.push('name=?'); values.push(text(body.name, 'ชื่อแปลง', 100)); }
  if (Object.hasOwn(body, 'crop')) { updates.push('crop=?'); values.push(text(body.crop, 'พืชที่ปลูก', 100)); }
  if (Object.hasOwn(body, 'area')) { updates.push('area=?'); values.push(optionalText(body.area, 'พื้นที่', 200)); }
  if (!updates.length) throw new HttpError(400, 'ไม่มีข้อมูลสำหรับแก้ไข');
  db.prepare(`UPDATE plots SET ${updates.join(',')} WHERE id=? AND owner_id=?`).run(...values, plot.id, req.user.id);
  res.json(db.prepare('SELECT * FROM plots WHERE id=?').get(plot.id));
}));
app.get('/api/activities', auth, wrap((req, res) => {
  const base = 'SELECT a.*,p.name plot_name,u.name farmer FROM activities a JOIN plots p ON p.id=a.plot_id JOIN users u ON u.id=a.user_id';
  if (req.user.role === 'admin') return res.json(db.prepare(`${base} ORDER BY a.activity_date DESC,a.id DESC LIMIT 300`).all());
  if (req.user.role === 'ics') return res.json(db.prepare(`${base} JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL ORDER BY a.activity_date DESC,a.id DESC LIMIT 300`).all(req.user.id));
  res.json(db.prepare(`${base} WHERE p.owner_id=? ORDER BY a.activity_date DESC,a.id DESC LIMIT 300`).all(req.user.id));
}));
app.post('/api/activities', auth, wrap((req, res) => { if (req.user.role !== 'farmer') throw new HttpError(403, 'เฉพาะเกษตรกร'); const plot = ownPlot(req, req.body.plot_id), kind = text(req.body.kind, 'กิจกรรม', 100), details = text(req.body.details, 'รายละเอียด', 2000), activityDate = isoDate(req.body.activity_date, 'วันที่ทำกิจกรรม'), url = photoUrl(req.body.photo_url); const result = db.prepare('INSERT INTO activities(plot_id,user_id,kind,details,activity_date,photo_url) VALUES(?,?,?,?,?,?)').run(plot.id, req.user.id, kind, details, activityDate, url); res.status(201).json({ id: result.lastInsertRowid }); }));
app.get('/api/approvals', auth, wrap((req, res) => {
  const base = 'SELECT a.*,p.name plot_name,u.name farmer FROM approvals a JOIN plots p ON p.id=a.plot_id JOIN users u ON u.id=a.user_id';
  if (req.user.role === 'admin') return res.json(db.prepare(`${base} ORDER BY a.id DESC`).all());
  if (req.user.role === 'ics') return res.json(db.prepare(`${base} JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL ORDER BY a.id DESC`).all(req.user.id));
  res.json(db.prepare('SELECT a.*,p.name plot_name FROM approvals a JOIN plots p ON p.id=a.plot_id WHERE a.user_id=? ORDER BY a.id DESC').all(req.user.id));
}));
app.post('/api/approvals', auth, wrap((req, res) => { if (req.user.role !== 'farmer') throw new HttpError(403, 'เฉพาะเกษตรกร'); const plot = ownPlot(req, req.body.plot_id), inputName = text(req.body.input_name, 'ชื่อปัจจัยการผลิต', 200), details = text(req.body.details, 'รายละเอียด', 2000); const result = db.prepare('INSERT INTO approvals(plot_id,user_id,input_name,details) VALUES(?,?,?,?)').run(plot.id, req.user.id, inputName, details); res.status(201).json({ id: result.lastInsertRowid }); }));
app.patch('/api/approvals/:id', auth, ics, wrap((req, res) => { const id = positiveId(req.params.id), approval = db.prepare('SELECT * FROM approvals WHERE id=?').get(id); if (!approval) throw new HttpError(404, 'ไม่พบคำขอ'); ownPlot(req, approval.plot_id); const status = req.body.status, comment = optionalText(req.body.comment, 'ความเห็น', 1000); if (!['approved', 'rejected'].includes(status)) throw new HttpError(400, 'สถานะไม่ถูกต้อง'); const result = db.prepare("UPDATE approvals SET status=?,comment=?,reviewer_id=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").run(status, comment, req.user.id, id); if (!result.changes) throw new HttpError(404, 'รายการนี้ถูกพิจารณาแล้วหรือไม่พบ'); res.json({ ok: true }); }));
app.get('/api/lots', auth, wrap((req, res) => {
  const base = 'SELECT l.*,p.name plot_name,u.name farmer FROM lots l JOIN plots p ON p.id=l.plot_id JOIN users u ON u.id=p.owner_id';
  if (req.user.role === 'admin') return res.json(db.prepare(`${base} ORDER BY l.id DESC`).all());
  if (req.user.role === 'ics') return res.json(db.prepare(`${base} JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL ORDER BY l.id DESC`).all(req.user.id));
  res.json(db.prepare('SELECT l.*,p.name plot_name FROM lots l JOIN plots p ON p.id=l.plot_id WHERE p.owner_id=? ORDER BY l.id DESC').all(req.user.id));
}));
app.post('/api/lots', auth, wrap((req, res) => { if (req.user.role !== 'farmer') throw new HttpError(403, 'เฉพาะเกษตรกร'); const plot = ownPlot(req, req.body.plot_id), code = text(req.body.code, 'รหัสล็อต', 100), crop = text(req.body.crop, 'ชนิดผลผลิต', 100), harvestDate = isoDate(req.body.harvest_date, 'วันที่เก็บเกี่ยว'), quantity = Number(req.body.quantity); if (!Number.isFinite(quantity) || quantity < 0) throw new HttpError(400, 'ปริมาณไม่ถูกต้อง'); const result = db.prepare('INSERT INTO lots(plot_id,code,crop,harvest_date,quantity) VALUES(?,?,?,?,?)').run(plot.id, code, crop, harvestDate, quantity); res.status(201).json({ id: result.lastInsertRowid }); }));
app.get('/api/risks', auth, ics, wrap((req, res) => { const pending = db.prepare("SELECT a.id,a.input_name,p.name plot_name,'pending' type FROM approvals a JOIN plots p ON p.id=a.plot_id JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL WHERE a.status='pending'").all(req.user.id); const inactive = db.prepare("SELECT p.id,p.name plot_name,'inactive' type FROM plots p JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL WHERE NOT EXISTS (SELECT 1 FROM activities a WHERE a.plot_id=p.id AND a.activity_date>=date('now','-14 days'))").all(req.user.id); res.json([...pending, ...inactive]); }));
app.get('/api/reviews', auth, ics, wrap((req, res) => res.json(db.prepare('SELECT r.*,p.name plot_name FROM reviews r JOIN plots p ON p.id=r.plot_id JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL ORDER BY r.id DESC').all(req.user.id))));
app.post('/api/reviews', auth, ics, wrap((req, res) => { const plot = ownPlot(req, req.body.plot_id), resultText = text(req.body.result, 'ผลตรวจ', 100), note = text(req.body.note, 'บันทึกผลตรวจ', 2000); const result = db.prepare('INSERT INTO reviews(plot_id,reviewer_id,result,note) VALUES(?,?,?,?)').run(plot.id, req.user.id, resultText, note); res.status(201).json({ id: result.lastInsertRowid }); }));
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'ready-to-grow' }));
app.get('/api/config', (req, res) => res.json({ liffId: process.env.LIFF_ID || '', development: devAuthEnabled && isLoopback(req) }));

app.use('/api', (req, res) => res.status(404).json({ error: 'ไม่พบ API' }));
app.use((error, req, res, next) => {
  const known = error instanceof HttpError;
  const duplicate = error?.code === 'SQLITE_CONSTRAINT_UNIQUE';
  const status = known ? error.status : duplicate ? 409 : 500;
  if (status >= 500) console.error(error);
  if (['/api/login','/api/auth/admin/password-login','/api/auth/register/invite','/api/logout','/api/me'].includes(req.path)) res.set('Cache-Control', 'no-store');
  res.status(status).json({ error: known ? error.message : duplicate ? 'ข้อมูลนี้มีอยู่แล้ว' : 'เกิดข้อผิดพลาดภายในระบบ', ...(known && error.code ? { code: error.code } : {}) });
});

export function startServer(port = Number(process.env.PORT) || 3000) {
  return app.listen(port, () => console.log(`Ready to Grow running on port ${port} (${isDevelopment ? 'development' : 'production'})`));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startServer();
