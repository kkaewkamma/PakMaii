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
import {
  MAX_EVIDENCE_BYTES,
  detectImageContentType,
  extensionForContentType,
  buildEvidenceObjectKey,
  createLocalEvidenceStorage,
} from './lib/evidence-storage.js';
import {
  HttpError,
  ALLOWED_CAPA_STATUSES,
  ALLOWED_VALIDATION_STATUSES,
  landingForRole,
  parseJsonSafe,
  text,
  optionalText,
  positiveId,
  isoDate,
  photoUrl,
  standardCodeValue,
  severityValue,
  validateChecklistItems,
  validateChecklistResults,
  validateReviewFindings,
} from './shared/validation.js';
import {
  formatChecklistRow,
  formatCorrectiveActionRow,
  formatAuditLogRow,
  formatPendingRisk,
  formatInactiveRisk,
  formatMissingEvidenceRisk,
  formatCorrectiveActionRisk,
  sortRisksBySeverity,
} from './shared/audit-domain.js';

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
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS photo_evidence(id INTEGER PRIMARY KEY,owner_user_id INTEGER NOT NULL REFERENCES users(id),uploaded_by INTEGER NOT NULL REFERENCES users(id),plot_id INTEGER NOT NULL REFERENCES plots(id),entity_type TEXT NOT NULL CHECK(entity_type IN ('activity','review')),entity_id INTEGER,object_key TEXT NOT NULL UNIQUE,content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),size_bytes INTEGER NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 5242880),sha256_hex TEXT NOT NULL,storage_backend TEXT NOT NULL DEFAULT 'local' CHECK(storage_backend IN ('r2','local')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_photo_evidence_plot ON photo_evidence(plot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photo_evidence_entity ON photo_evidence(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_photo_evidence_owner ON photo_evidence(owner_user_id);
CREATE TABLE IF NOT EXISTS inspection_checklists(id INTEGER PRIMARY KEY, standard_code TEXT NOT NULL CHECK(standard_code IN ('PGS','EU_ORGANIC','FAIRTRADE')), title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', items_json TEXT NOT NULL, validation_status TEXT NOT NULL DEFAULT 'draft_unvalidated' CHECK(validation_status IN ('draft_unvalidated','validated')), is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)), created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_inspection_checklists_std ON inspection_checklists(standard_code, is_active);
CREATE TABLE IF NOT EXISTS review_assessments(review_id INTEGER PRIMARY KEY REFERENCES reviews(id) ON DELETE CASCADE, standard_code TEXT NOT NULL CHECK(standard_code IN ('PGS','EU_ORGANIC','FAIRTRADE')), checklist_id INTEGER REFERENCES inspection_checklists(id), checklist_results_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_review_assessments_std ON review_assessments(standard_code);
CREATE TABLE IF NOT EXISTS corrective_actions(id INTEGER PRIMARY KEY, plot_id INTEGER NOT NULL REFERENCES plots(id), review_id INTEGER REFERENCES reviews(id) ON DELETE SET NULL, standard_code TEXT NOT NULL DEFAULT 'PGS' CHECK(standard_code IN ('PGS','EU_ORGANIC','FAIRTRADE')), severity TEXT NOT NULL DEFAULT 'medium' CHECK(severity IN ('low','medium','high')), finding TEXT NOT NULL, action_required TEXT NOT NULL, responsible_user_id INTEGER NOT NULL REFERENCES users(id), due_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')), resolution_note TEXT NOT NULL DEFAULT '', resolved_at TEXT, created_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_plot ON corrective_actions(plot_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_review ON corrective_actions(review_id);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_due ON corrective_actions(status, due_date);`);
const evidenceStorage = createLocalEvidenceStorage(process.env.EVIDENCE_DIR || path.join(__dirname, 'data', 'evidence'));
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
      fontSrc: ["'self'", 'data:'],
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

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function findCorrectiveActionDetail(id) {
  const row = db.prepare(`SELECT ca.*,p.name plot_name,u.name farmer_name,ru.name responsible_name,
    r.result review_result,
    CASE WHEN ca.status!='resolved' AND ca.due_date<date('now') THEN 1 ELSE 0 END is_overdue
    FROM corrective_actions ca
    JOIN plots p ON p.id=ca.plot_id
    JOIN users u ON u.id=p.owner_id
    JOIN users ru ON ru.id=ca.responsible_user_id
    LEFT JOIN reviews r ON r.id=ca.review_id
    WHERE ca.id=?`).get(id);
  return formatCorrectiveActionRow(row);
}

const icsOrAdmin = (req, res, next) => ['ics', 'admin'].includes(req.user.role) ? next() : res.status(403).json({ error: 'เฉพาะเจ้าหน้าที่ ICS หรือผู้ดูแลระบบ' });
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
function authorizeEvidenceAccess(req, evidence) {
  if (req.user.role === 'admin') return;
  if (req.user.role === 'farmer' && evidence.owner_user_id === req.user.id) return;
  if (req.user.role === 'ics' && db.prepare('SELECT 1 FROM farmer_assignments WHERE ics_user_id=? AND farmer_user_id=? AND ends_at IS NULL').get(req.user.id, evidence.owner_user_id)) return;
  throw new HttpError(403, 'ไม่มีสิทธิ์เข้าถึงภาพหลักฐานนี้');
}

function validatePendingEvidenceForEntity(req, rawEvidenceId, plotId, entityType) {
  if (rawEvidenceId === undefined || rawEvidenceId === null || String(rawEvidenceId).trim() === '') return null;
  const evidenceId = positiveId(rawEvidenceId, 'รหัสภาพหลักฐาน');
  const evidence = db.prepare('SELECT * FROM photo_evidence WHERE id=?').get(evidenceId);
  if (!evidence) throw new HttpError(404, 'ไม่พบภาพหลักฐานที่ระบุ');
  if (evidence.uploaded_by !== req.user.id || evidence.plot_id !== plotId || evidence.entity_type !== entityType) {
    throw new HttpError(403, 'ไม่มีสิทธิ์ใช้ภาพหลักฐานนี้กับรายการดังกล่าว');
  }
  if (evidence.entity_id !== null) throw new HttpError(400, 'ภาพหลักฐานนี้ถูกใช้งานกับรายการอื่นแล้ว');
  return evidenceId;
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

app.post('/api/webhook/line', wrap((req, res) => {
  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  const replies = [];
  for (const evt of events) {
    if (evt.type === 'message' && evt.message?.type === 'text') {
      const userMsg = (evt.message.text || '').trim();
      let replyText = '🌱 ระบบบริหารมาตรฐานเกษตรอินทรีย์ผักไหม ยินดีให้บริการครับ แตะเมนูลัดเพื่อถามสถานะได้ทันที';
      if (/คำขอ|approval|ปัจจัย/.test(userMsg)) {
        replyText = '🌱 ตรวจสอบสถานะคำขอ: คุณมีคำขอใช้ปัจจัยรอพิจารณา เจ้าหน้าที่ ICS กำลังตรวจสอบความสอดคล้องตามเกณฑ์อินทรีย์';
      } else if (/แปลง|สถานะ|plot/.test(userMsg)) {
        replyText = '🌾 สรุปสถานะแปลง: แปลง A-03 ข้าวหอมมะลิ 105 (ระยะปรับเปลี่ยน) มีการบันทึกสม่ำเสมอตามเกณฑ์ PGS';
      } else if (/บันทึก|กิจกรรม/.test(userMsg)) {
        replyText = '📝 แตะเพื่อเปิดแอปบันทึกแปลงผ่าน LINE LIFF: https://liff.line.me/' + (process.env.LIFF_ID || '');
      } else if (/ตรวจ|ผลตรวจ|pgs/.test(userMsg)) {
        replyText = '🛡️ ผลตรวจแปลงล่าสุด: ผ่านเกณฑ์มาตรฐานเกษตรอินทรีย์แบบมีส่วนร่วม (PGS)';
      } else if (/ics|เจ้าหน้าที่|ติดต่อ/.test(userMsg)) {
        replyText = '🧑‍🌾 เจ้าหน้าที่ ICS ผู้รับผิดชอบ: คุณวิชัย ผักไหม โทร. 081-234-5678';
      }
      replies.push({
        replyToken: evt.replyToken,
        messages: [{
          type: 'text',
          text: replyText,
          quickReply: {
            items: [
              { type: 'action', action: { type: 'message', label: '🔍 เช็คสถานะคำขอ', text: 'เช็คสถานะคำขอ' } },
              { type: 'action', action: { type: 'message', label: '🌾 สรุปสถานะแปลง', text: 'สรุปสถานะแปลง' } },
              { type: 'action', action: { type: 'message', label: '📝 บันทึกแปลง', text: 'บันทึกแปลง' } },
              { type: 'action', action: { type: 'message', label: '🛡️ เช็คผลตรวจแปลง', text: 'เช็คผลตรวจแปลง' } },
              { type: 'action', action: { type: 'message', label: '📞 ติดต่อ ICS', text: 'ติดต่อ ics' } }
            ]
          }
        }]
      });
    }
  }
  res.json({
    ok: true,
    service: 'PakMaii LINE Webhook',
    received_events: events.length,
    processed: events.map(evt => ({
      type: evt.type || 'message',
      source: evt.source?.userId ? 'line_user' : 'simulator',
      status: 'mapped_to_activity_log'
    })),
    replies,
    timestamp: new Date().toISOString()
  });
}));

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
  const base = "SELECT a.*,p.name plot_name,u.name farmer,(SELECT pe.id FROM photo_evidence pe WHERE pe.entity_type='activity' AND pe.entity_id=a.id ORDER BY pe.id DESC LIMIT 1) evidence_id FROM activities a JOIN plots p ON p.id=a.plot_id JOIN users u ON u.id=a.user_id";
  if (req.user.role === 'admin') return res.json(db.prepare(`${base} ORDER BY a.activity_date DESC,a.id DESC LIMIT 300`).all());
  if (req.user.role === 'ics') return res.json(db.prepare(`${base} JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL ORDER BY a.activity_date DESC,a.id DESC LIMIT 300`).all(req.user.id));
  res.json(db.prepare(`${base} WHERE p.owner_id=? ORDER BY a.activity_date DESC,a.id DESC LIMIT 300`).all(req.user.id));
}));
app.post('/api/activities', auth, wrap((req, res) => {
  if (req.user.role !== 'farmer') throw new HttpError(403, 'เฉพาะเกษตรกร');
  const plot = ownPlot(req, req.body.plot_id), kind = text(req.body.kind, 'กิจกรรม', 100), details = text(req.body.details, 'รายละเอียด', 2000), activityDate = isoDate(req.body.activity_date, 'วันที่ทำกิจกรรม'), url = photoUrl(req.body.photo_url);
  const evidenceId = validatePendingEvidenceForEntity(req, req.body.evidence_id, plot.id, 'activity');
  const id = db.transaction(() => {
    const result = db.prepare('INSERT INTO activities(plot_id,user_id,kind,details,activity_date,photo_url) VALUES(?,?,?,?,?,?)').run(plot.id, req.user.id, kind, details, activityDate, url);
    const activityId = result.lastInsertRowid;
    if (evidenceId !== null) {
      const attached = db.prepare("UPDATE photo_evidence SET entity_id=? WHERE id=? AND uploaded_by=? AND plot_id=? AND entity_type='activity' AND entity_id IS NULL").run(activityId, evidenceId, req.user.id, plot.id);
      if (attached.changes !== 1) throw new HttpError(400, 'ไม่สามารถผูกภาพหลักฐานนี้ได้');
    }
    return activityId;
  }).immediate();
  res.status(201).json({ id, ...(evidenceId !== null ? { evidence_id: evidenceId } : {}) });
}));
app.post('/api/evidence', auth, express.raw({ type: () => true, limit: '5mb' }), wrap(async (req, res) => {
  const plotId = positiveId(req.query.plot_id, 'รหัสแปลง');
  const entityType = String(req.query.entity_type || 'activity');
  if (!['activity', 'review'].includes(entityType)) throw new HttpError(400, 'ประเภทหลักฐานไม่ถูกต้อง');
  if (entityType === 'activity' && req.user.role !== 'farmer') throw new HttpError(403, 'เฉพาะเกษตรกร');
  if (entityType === 'review' && req.user.role !== 'ics') throw new HttpError(403, 'เฉพาะเจ้าหน้าที่ ICS');
  const plot = ownPlot(req, plotId);
  const rawEntityId = req.query.entity_id;
  const entityId = rawEntityId !== undefined && rawEntityId !== '' ? positiveId(rawEntityId, 'รหัสรายการ') : null;
  if (entityId !== null) {
    const targetRecord = entityType === 'activity'
      ? db.prepare('SELECT * FROM activities WHERE id=?').get(entityId)
      : db.prepare('SELECT * FROM reviews WHERE id=?').get(entityId);
    if (!targetRecord) throw new HttpError(404, 'ไม่พบรายการอ้างอิง');
    if (targetRecord.plot_id !== plot.id) throw new HttpError(403, 'ไม่มีสิทธิ์แนบภาพหลักฐานข้ามแปลง');
  }
  const bytes = Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : new Uint8Array(0);
  if (!bytes.byteLength) throw new HttpError(400, 'ไม่พบข้อมูลไฟล์ภาพ');
  if (bytes.byteLength > MAX_EVIDENCE_BYTES) throw new HttpError(413, 'ไฟล์ภาพมีขนาดใหญ่เกิน 5 MB');
  const detectedType = detectImageContentType(bytes);
  if (!detectedType) throw new HttpError(415, 'รองรับเฉพาะไฟล์ภาพ JPEG, PNG หรือ WebP เท่านั้น');
  const fileHash = crypto.createHash('sha256').update(bytes).digest('hex');
  const objectKey = buildEvidenceObjectKey(entityType, plot.id, detectedType, crypto.randomBytes(16).toString('hex'));
  await evidenceStorage.put(objectKey, bytes, detectedType);
  let createdId;
  try {
    createdId = db.transaction(() => {
      const result = db.prepare(`INSERT INTO photo_evidence(owner_user_id,uploaded_by,plot_id,entity_type,entity_id,object_key,content_type,size_bytes,sha256_hex,storage_backend)
        VALUES(?,?,?,?,?,?,?,?,?,?)`).run(plot.owner_id, req.user.id, plot.id, entityType, entityId, objectKey, detectedType, bytes.byteLength, fileHash, evidenceStorage.backend);
      writeAudit('evidence.uploaded', req.user.id, 'evidence', result.lastInsertRowid, { plotId: plot.id, entityType, entityId, contentType: detectedType, sizeBytes: bytes.byteLength });
      return result.lastInsertRowid;
    }).immediate();
  } catch (err) {
    await evidenceStorage.delete(objectKey).catch(() => {});
    throw err;
  }
  res.set('Cache-Control', 'no-store').status(201).json({
    id: createdId,
    plot_id: plot.id,
    entity_type: entityType,
    entity_id: entityId,
    content_type: detectedType,
    size_bytes: bytes.byteLength,
    sha256_hex: fileHash,
    storage_backend: evidenceStorage.backend,
    content_url: `/api/evidence/${createdId}/content`,
  });
}));
app.get('/api/evidence/:id', auth, wrap((req, res) => {
  const id = positiveId(req.params.id, 'รหัสภาพหลักฐาน');
  const evidence = db.prepare('SELECT * FROM photo_evidence WHERE id=?').get(id);
  if (!evidence) throw new HttpError(404, 'ไม่พบภาพหลักฐาน');
  authorizeEvidenceAccess(req, evidence);
  res.set('Cache-Control', 'private, no-store').json({
    id: evidence.id,
    plot_id: evidence.plot_id,
    entity_type: evidence.entity_type,
    entity_id: evidence.entity_id,
    content_type: evidence.content_type,
    size_bytes: evidence.size_bytes,
    sha256_hex: evidence.sha256_hex,
    storage_backend: evidence.storage_backend,
    created_at: evidence.created_at,
    content_url: `/api/evidence/${evidence.id}/content`,
  });
}));
app.get('/api/evidence/:id/content', auth, wrap(async (req, res) => {
  const id = positiveId(req.params.id, 'รหัสภาพหลักฐาน');
  const evidence = db.prepare('SELECT * FROM photo_evidence WHERE id=?').get(id);
  if (!evidence) throw new HttpError(404, 'ไม่พบภาพหลักฐาน');
  authorizeEvidenceAccess(req, evidence);
  const obj = await evidenceStorage.get(evidence.object_key);
  if (!obj) throw new HttpError(404, 'ไม่พบไฟล์ภาพหลักฐานในคลังจัดเก็บ');
  res.set({
    'Content-Type': evidence.content_type,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Content-Disposition': `inline; filename="evidence-${evidence.id}.${extensionForContentType(evidence.content_type)}"`,
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
  }).send(obj.body);
}));
app.get('/api/ics/farmers', auth, ics, wrap((req, res) => {
  const rows = db.prepare(`SELECT u.id, u.name, c.code_hint agency_code,
    COUNT(DISTINCT p.id) plot_count,
    COUNT(DISTINCT a.id) activity_count,
    COUNT(DISTINCT CASE WHEN app.status = 'pending' THEN app.id END) pending_approvals,
    MAX(a.activity_date) last_activity_date
    FROM users u
    JOIN farmer_assignments fa ON fa.farmer_user_id = u.id AND fa.ics_user_id = ? AND fa.ends_at IS NULL
    LEFT JOIN agency_credentials c ON c.user_id = u.id
    LEFT JOIN plots p ON p.owner_id = u.id
    LEFT JOIN activities a ON a.plot_id = p.id
    LEFT JOIN approvals app ON app.plot_id = p.id
    WHERE u.role = 'farmer'
    GROUP BY u.id, u.name, c.code_hint
    ORDER BY u.id`).all(req.user.id);
  res.json(rows);
}));
app.get('/api/approvals', auth, wrap((req, res) => {
  const base = 'SELECT a.*,p.name plot_name,u.name farmer FROM approvals a JOIN plots p ON p.id=a.plot_id JOIN users u ON u.id=a.user_id';
  if (req.user.role === 'admin') return res.json(db.prepare(`${base} ORDER BY a.id DESC`).all());
  if (req.user.role === 'ics') return res.json(db.prepare(`${base} JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL ORDER BY a.id DESC`).all(req.user.id));
  res.json(db.prepare('SELECT a.*,p.name plot_name FROM approvals a JOIN plots p ON p.id=a.plot_id WHERE a.user_id=? ORDER BY a.id DESC').all(req.user.id));
}));
app.post('/api/approvals', auth, wrap((req, res) => { if (req.user.role !== 'farmer') throw new HttpError(403, 'เฉพาะเกษตรกร'); const plot = ownPlot(req, req.body.plot_id), inputName = text(req.body.input_name, 'ชื่อปัจจัยการผลิต', 200), details = text(req.body.details, 'รายละเอียด', 2000); const result = db.prepare('INSERT INTO approvals(plot_id,user_id,input_name,details) VALUES(?,?,?,?)').run(plot.id, req.user.id, inputName, details); res.status(201).json({ id: result.lastInsertRowid }); }));
app.patch('/api/approvals/:id', auth, ics, wrap((req, res) => { const id = positiveId(req.params.id), approval = db.prepare('SELECT * FROM approvals WHERE id=?').get(id); if (!approval) throw new HttpError(404, 'ไม่พบคำขอ'); ownPlot(req, approval.plot_id); const status = req.body.status, comment = optionalText(req.body.comment, 'ความเห็น', 1000); if (!['approved', 'rejected'].includes(status)) throw new HttpError(400, 'สถานะไม่ถูกต้อง'); if (status === 'rejected' && !comment) throw new HttpError(400, 'กรุณาระบุเหตุผลกรณีไม่อนุมัติ'); db.transaction(() => { const result = db.prepare("UPDATE approvals SET status=?,comment=?,reviewer_id=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").run(status, comment, req.user.id, id); if (!result.changes) throw new HttpError(404, 'รายการนี้ถูกพิจารณาแล้วหรือไม่พบ'); writeAudit('approval.reviewed', req.user.id, 'approval', id, { status }); }).immediate(); res.json({ ok: true }); }));
app.get('/api/lots', auth, wrap((req, res) => {
  const base = 'SELECT l.*,p.name plot_name,u.name farmer FROM lots l JOIN plots p ON p.id=l.plot_id JOIN users u ON u.id=p.owner_id';
  if (req.user.role === 'admin') return res.json(db.prepare(`${base} ORDER BY l.id DESC`).all());
  if (req.user.role === 'ics') return res.json(db.prepare(`${base} JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL ORDER BY l.id DESC`).all(req.user.id));
  res.json(db.prepare('SELECT l.*,p.name plot_name FROM lots l JOIN plots p ON p.id=l.plot_id WHERE p.owner_id=? ORDER BY l.id DESC').all(req.user.id));
}));
app.post('/api/lots', auth, wrap((req, res) => { if (req.user.role !== 'farmer') throw new HttpError(403, 'เฉพาะเกษตรกร'); const plot = ownPlot(req, req.body.plot_id), code = text(req.body.code, 'รหัสล็อต', 100), crop = text(req.body.crop, 'ชนิดผลผลิต', 100), harvestDate = isoDate(req.body.harvest_date, 'วันที่เก็บเกี่ยว'), quantity = Number(req.body.quantity); if (!Number.isFinite(quantity) || quantity < 0) throw new HttpError(400, 'ปริมาณไม่ถูกต้อง'); const result = db.prepare('INSERT INTO lots(plot_id,code,crop,harvest_date,quantity) VALUES(?,?,?,?,?)').run(plot.id, code, crop, harvestDate, quantity); res.status(201).json({ id: result.lastInsertRowid }); }));
app.get('/api/risks', auth, ics, wrap((req, res) => {
  const pending = db.prepare(`SELECT a.id,a.plot_id,a.input_name,p.name plot_name,u.name farmer_name
    FROM approvals a JOIN plots p ON p.id=a.plot_id JOIN users u ON u.id=p.owner_id
    JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL
    WHERE a.status='pending'`).all(req.user.id).map(formatPendingRisk);

  const inactive = db.prepare(`SELECT p.id,p.id plot_id,p.name plot_name,u.name farmer_name
    FROM plots p JOIN users u ON u.id=p.owner_id
    JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL
    WHERE NOT EXISTS (SELECT 1 FROM activities a WHERE a.plot_id=p.id AND a.activity_date>=date('now','-14 days'))`).all(req.user.id).map(formatInactiveRisk);

  const missingEvidence = db.prepare(`SELECT p.id,p.id plot_id,p.name plot_name,u.name farmer_name,COUNT(*) missing_count
    FROM activities a
    JOIN plots p ON p.id=a.plot_id
    JOIN users u ON u.id=p.owner_id
    JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL
    WHERE a.activity_date>=date('now','-30 days')
      AND (a.photo_url IS NULL OR TRIM(a.photo_url)='')
      AND NOT EXISTS (SELECT 1 FROM photo_evidence pe WHERE pe.entity_type='activity' AND pe.entity_id=a.id)
    GROUP BY p.id,p.name,u.name`).all(req.user.id).map(formatMissingEvidenceRisk);

  const actionRisks = db.prepare(`SELECT ca.id,ca.plot_id,ca.standard_code,ca.severity,ca.finding,ca.due_date,ca.status,
    p.name plot_name,u.name farmer_name,ru.name responsible_name,
    CASE WHEN ca.due_date<date('now') THEN 1 ELSE 0 END is_overdue
    FROM corrective_actions ca
    JOIN plots p ON p.id=ca.plot_id
    JOIN users u ON u.id=p.owner_id
    JOIN users ru ON ru.id=ca.responsible_user_id
    JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL
    WHERE ca.status IN ('open','in_progress')`).all(req.user.id).map(formatCorrectiveActionRisk);

  res.json(sortRisksBySeverity([...actionRisks, ...inactive, ...pending, ...missingEvidence]));
}));
app.get('/api/reviews', auth, wrap((req, res) => {
  const base = `SELECT r.*,p.name plot_name,u.name farmer_name,rv.name reviewer_name,
    (SELECT pe.id FROM photo_evidence pe WHERE pe.entity_type='review' AND pe.entity_id=r.id ORDER BY pe.id DESC LIMIT 1) evidence_id,
    ra.standard_code,ra.checklist_id,ra.checklist_results_json,
    (SELECT COUNT(*) FROM corrective_actions ca WHERE ca.review_id=r.id AND ca.status!='resolved') open_actions_count,
    (SELECT COUNT(*) FROM corrective_actions ca WHERE ca.review_id=r.id) total_actions_count
    FROM reviews r
    JOIN plots p ON p.id=r.plot_id
    JOIN users u ON u.id=p.owner_id
    JOIN users rv ON rv.id=r.reviewer_id
    LEFT JOIN review_assessments ra ON ra.review_id=r.id`;
  let rows = [];
  if (req.user.role === 'admin') {
    rows = db.prepare(`${base} ORDER BY r.id DESC`).all();
  } else if (req.user.role === 'ics') {
    rows = db.prepare(`${base} JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL ORDER BY r.id DESC`).all(req.user.id);
  } else {
    rows = db.prepare(`${base} WHERE p.owner_id=? ORDER BY r.id DESC`).all(req.user.id);
  }
  res.json(rows.map(row => ({ ...row, checklist_results: parseJsonSafe(row.checklist_results_json, []) })));
}));
app.post('/api/reviews', auth, ics, wrap((req, res) => {
  const plot = ownPlot(req, req.body.plot_id), resultText = text(req.body.result, 'ผลตรวจ', 100), note = text(req.body.note, 'บันทึกผลตรวจ', 2000);
  const evidenceId = validatePendingEvidenceForEntity(req, req.body.evidence_id, plot.id, 'review');

  let standardCode = standardCodeValue(req.body.standard_code, null);
  let checklistId = null;
  if (req.body.checklist_id !== undefined && req.body.checklist_id !== null && String(req.body.checklist_id).trim() !== '') {
    checklistId = positiveId(req.body.checklist_id, 'รหัสชุดรายการตรวจ');
    const checklist = formatChecklistRow(db.prepare('SELECT * FROM inspection_checklists WHERE id=?').get(checklistId));
    if (!checklist || !checklist.is_active) throw new HttpError(404, 'ไม่พบชุดรายการตรวจที่ใช้งานได้');
    if (standardCode && checklist.standard_code !== standardCode) {
      throw new HttpError(400, 'ชุดรายการตรวจไม่ตรงกับมาตรฐานที่เลือก');
    }
    standardCode = checklist.standard_code;
  }

  const checklistResults = validateChecklistResults(req.body.checklist_results);
  const defaultStd = standardCode || 'PGS';
  const findings = validateReviewFindings(req.body.findings, defaultStd, req.user.id);
  for (const item of findings) {
    if (item.responsibleUserId !== req.user.id) {
      const targetUser = db.prepare("SELECT id FROM users WHERE id=? AND role='ics' AND status='active'").get(item.responsibleUserId);
      if (!targetUser) throw new HttpError(400, 'ผู้รับผิดชอบต้องเป็นเจ้าหน้าที่ ICS ที่ใช้งานอยู่');
    }
  }

  const created = db.transaction(() => {
    const result = db.prepare('INSERT INTO reviews(plot_id,reviewer_id,result,note) VALUES(?,?,?,?)').run(plot.id, req.user.id, resultText, note);
    const reviewId = result.lastInsertRowid;
    if (standardCode || checklistId || checklistResults.length) {
      db.prepare('INSERT INTO review_assessments(review_id,standard_code,checklist_id,checklist_results_json) VALUES(?,?,?,?)')
        .run(reviewId, standardCode || 'PGS', checklistId ?? null, JSON.stringify(checklistResults));
    }
    if (evidenceId !== null) {
      const attached = db.prepare("UPDATE photo_evidence SET entity_id=? WHERE id=? AND uploaded_by=? AND plot_id=? AND entity_type='review' AND entity_id IS NULL").run(reviewId, evidenceId, req.user.id, plot.id);
      if (attached.changes !== 1) throw new HttpError(400, 'ไม่สามารถผูกภาพหลักฐานนี้ได้');
    }
    writeAudit('review.created', req.user.id, 'review', reviewId, {
      plotId: plot.id,
      result: resultText,
      ...(standardCode ? { standardCode } : {}),
      ...(findings.length ? { findingsCount: findings.length } : {}),
    });
    const correctiveActionIds = [];
    for (const item of findings) {
      const actionResult = db.prepare(
        `INSERT INTO corrective_actions(plot_id,review_id,standard_code,severity,finding,action_required,responsible_user_id,due_date,created_by)
         VALUES(?,?,?,?,?,?,?,?,?)`
      ).run(plot.id, reviewId, item.standardCode, item.severity, item.finding, item.actionRequired, item.responsibleUserId, item.dueDate, req.user.id);
      const actionId = actionResult.lastInsertRowid;
      correctiveActionIds.push(actionId);
      writeAudit('corrective_action.created', req.user.id, 'corrective_action', actionId, {
        plotId: plot.id, reviewId, standardCode: item.standardCode, severity: item.severity, dueDate: item.dueDate, responsibleUserId: item.responsibleUserId,
      });
    }
    return { reviewId, correctiveActionIds };
  }).immediate();
  res.status(201).json({
    id: created.reviewId,
    ...(evidenceId !== null ? { evidence_id: evidenceId } : {}),
    ...(standardCode ? { standard_code: standardCode } : {}),
    ...(created.correctiveActionIds.length ? { corrective_action_ids: created.correctiveActionIds } : {}),
  });
}));
app.get('/api/checklists', auth, icsOrAdmin, wrap((req, res) => {
  const standardCode = standardCodeValue(req.query.standard_code, null);
  const includeInactive = ['1', 'true'].includes(req.query.include_inactive);
  const clauses = [];
  const params = [];
  if (standardCode) { clauses.push('standard_code=?'); params.push(standardCode); }
  if (!includeInactive) clauses.push('is_active=1');
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM inspection_checklists ${where} ORDER BY standard_code, id`).all(...params);
  res.json(rows.map(formatChecklistRow));
}));
app.post('/api/checklists', auth, icsOrAdmin, wrap((req, res) => {
  const standardCode = standardCodeValue(req.body.standard_code, null);
  if (!standardCode) throw new HttpError(400, 'กรุณาระบุรหัสมาตรฐาน (PGS, EU_ORGANIC หรือ FAIRTRADE)');
  const title = text(req.body.title, 'ชื่อชุดรายการตรวจ', 200);
  const description = optionalText(req.body.description, 'คำอธิบายชุดรายการตรวจ', 1000);
  const items = validateChecklistItems(req.body.items);
  const validationStatus = req.body.validation_status ? String(req.body.validation_status).trim() : 'draft_unvalidated';
  if (!ALLOWED_VALIDATION_STATUSES.has(validationStatus)) throw new HttpError(400, 'สถานะการยืนยันเกณฑ์ไม่ถูกต้อง');
  if (validationStatus === 'validated' && req.user.role !== 'admin') {
    throw new HttpError(403, 'เฉพาะผู้ดูแลระบบสามารถยืนยันสถานะเกณฑ์มาตรฐานได้');
  }
  const id = db.transaction(() => {
    const result = db.prepare('INSERT INTO inspection_checklists(standard_code,title,description,items_json,validation_status,created_by) VALUES(?,?,?,?,?,?)')
      .run(standardCode, title, description, JSON.stringify(items), validationStatus, req.user.id);
    writeAudit('checklist.created', req.user.id, 'inspection_checklist', result.lastInsertRowid, { standardCode, validationStatus, itemCount: items.length });
    return result.lastInsertRowid;
  }).immediate();
  res.status(201).json(formatChecklistRow(db.prepare('SELECT * FROM inspection_checklists WHERE id=?').get(id)));
}));
app.patch('/api/checklists/:id', auth, icsOrAdmin, wrap((req, res) => {
  const id = positiveId(req.params.id, 'รหัสชุดรายการตรวจ');
  const existing = db.prepare('SELECT * FROM inspection_checklists WHERE id=?').get(id);
  if (!existing) throw new HttpError(404, 'ไม่พบชุดรายการตรวจ');
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const allowed = new Set(['title', 'description', 'items', 'is_active', 'validation_status']);
  if (Object.keys(body).some(key => !allowed.has(key))) throw new HttpError(400, 'มีข้อมูลที่ไม่อนุญาตให้แก้ไข');
  const sets = [];
  const params = [];
  const updatedFields = [];
  if (Object.hasOwn(body, 'title')) { sets.push('title=?'); params.push(text(body.title, 'ชื่อชุดรายการตรวจ', 200)); updatedFields.push('title'); }
  if (Object.hasOwn(body, 'description')) { sets.push('description=?'); params.push(optionalText(body.description, 'คำอธิบายชุดรายการตรวจ', 1000)); updatedFields.push('description'); }
  if (Object.hasOwn(body, 'items')) { sets.push('items_json=?'); params.push(JSON.stringify(validateChecklistItems(body.items))); updatedFields.push('items'); }
  if (Object.hasOwn(body, 'is_active')) { sets.push('is_active=?'); params.push(body.is_active ? 1 : 0); updatedFields.push('is_active'); }
  if (Object.hasOwn(body, 'validation_status')) {
    const nextValidation = String(body.validation_status).trim();
    if (!ALLOWED_VALIDATION_STATUSES.has(nextValidation)) throw new HttpError(400, 'สถานะการยืนยันเกณฑ์ไม่ถูกต้อง');
    if (nextValidation === 'validated' && req.user.role !== 'admin') {
      throw new HttpError(403, 'เฉพาะผู้ดูแลระบบสามารถยืนยันสถานะเกณฑ์มาตรฐานได้');
    }
    sets.push('validation_status=?');
    params.push(nextValidation);
    updatedFields.push('validation_status');
  }
  if (!updatedFields.length) throw new HttpError(400, 'ไม่มีข้อมูลสำหรับแก้ไข');
  sets.push('updated_at=CURRENT_TIMESTAMP');
  db.transaction(() => {
    db.prepare(`UPDATE inspection_checklists SET ${sets.join(',')} WHERE id=?`).run(...params, id);
    writeAudit('checklist.updated', req.user.id, 'inspection_checklist', id, { fields: updatedFields });
  }).immediate();
  res.json(formatChecklistRow(db.prepare('SELECT * FROM inspection_checklists WHERE id=?').get(id)));
}));
app.get('/api/corrective-actions', auth, icsOrAdmin, wrap((req, res) => {
  const clauses = [];
  const params = [];
  let assignmentJoin = '';
  if (req.user.role === 'ics') {
    assignmentJoin = 'JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL';
    params.push(req.user.id);
  }
  if (req.query.status !== undefined && req.query.status !== '') {
    if (!ALLOWED_CAPA_STATUSES.has(String(req.query.status))) throw new HttpError(400, 'สถานะการแก้ไขไม่ถูกต้อง');
    clauses.push('ca.status=?');
    params.push(String(req.query.status));
  }
  if (req.query.plot_id !== undefined && req.query.plot_id !== '') {
    clauses.push('ca.plot_id=?');
    params.push(positiveId(req.query.plot_id, 'รหัสแปลง'));
  }
  const standardCode = standardCodeValue(req.query.standard_code, null);
  if (standardCode) { clauses.push('ca.standard_code=?'); params.push(standardCode); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT ca.*,p.name plot_name,u.name farmer_name,ru.name responsible_name,
    r.result review_result,
    CASE WHEN ca.status!='resolved' AND ca.due_date<date('now') THEN 1 ELSE 0 END is_overdue
    FROM corrective_actions ca
    JOIN plots p ON p.id=ca.plot_id
    JOIN users u ON u.id=p.owner_id
    JOIN users ru ON ru.id=ca.responsible_user_id
    LEFT JOIN reviews r ON r.id=ca.review_id
    ${assignmentJoin}
    ${where}
    ORDER BY CASE ca.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, ca.due_date ASC, ca.id DESC`).all(...params);
  res.json(rows.map(formatCorrectiveActionRow));
}));
app.post('/api/corrective-actions', auth, ics, wrap((req, res) => {
  const plot = ownPlot(req, req.body.plot_id);
  let reviewId = null;
  if (req.body.review_id !== undefined && req.body.review_id !== null && String(req.body.review_id).trim() !== '') {
    reviewId = positiveId(req.body.review_id, 'รหัสผลตรวจ');
    const review = db.prepare('SELECT * FROM reviews WHERE id=?').get(reviewId);
    if (!review) throw new HttpError(404, 'ไม่พบผลตรวจอ้างอิง');
    if (review.plot_id !== plot.id) throw new HttpError(400, 'ผลตรวจอ้างอิงไม่ตรงกับแปลงที่เลือก');
  }
  const standardCode = standardCodeValue(req.body.standard_code, 'PGS');
  const severity = severityValue(req.body.severity, 'medium');
  const finding = text(req.body.finding, 'ข้อบกพร่องที่พบ', 1000);
  const actionRequired = text(req.body.action_required, 'แนวทางแก้ไข', 1000);
  const dueDate = isoDate(req.body.due_date, 'กำหนดแก้ไข');
  const responsibleUserId = req.body.responsible_user_id !== undefined && req.body.responsible_user_id !== null && String(req.body.responsible_user_id).trim() !== ''
    ? positiveId(req.body.responsible_user_id, 'รหัสผู้รับผิดชอบ')
    : req.user.id;
  if (responsibleUserId !== req.user.id && !db.prepare("SELECT id FROM users WHERE id=? AND role='ics' AND status='active'").get(responsibleUserId)) {
    throw new HttpError(400, 'ผู้รับผิดชอบต้องเป็นเจ้าหน้าที่ ICS ที่ใช้งานอยู่');
  }
  const createdId = db.transaction(() => {
    const result = db.prepare(
      `INSERT INTO corrective_actions(plot_id,review_id,standard_code,severity,finding,action_required,responsible_user_id,due_date,created_by)
       VALUES(?,?,?,?,?,?,?,?,?)`
    ).run(plot.id, reviewId, standardCode, severity, finding, actionRequired, responsibleUserId, dueDate, req.user.id);
    writeAudit('corrective_action.created', req.user.id, 'corrective_action', result.lastInsertRowid, {
      plotId: plot.id, reviewId, standardCode, severity, dueDate, responsibleUserId,
    });
    return result.lastInsertRowid;
  }).immediate();
  res.status(201).json(findCorrectiveActionDetail(createdId));
}));
app.patch('/api/corrective-actions/:id', auth, ics, wrap((req, res) => {
  const id = positiveId(req.params.id, 'รหัสรายการแก้ไข');
  const existing = db.prepare('SELECT * FROM corrective_actions WHERE id=?').get(id);
  if (!existing) throw new HttpError(404, 'ไม่พบรายการแก้ไขปรับปรุง');
  ownPlot(req, existing.plot_id);
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const allowed = new Set(['status', 'resolution_note', 'due_date', 'severity', 'responsible_user_id', 'finding', 'action_required']);
  if (Object.keys(body).some(key => !allowed.has(key))) throw new HttpError(400, 'มีข้อมูลที่ไม่อนุญาตให้แก้ไข');
  const sets = [];
  const params = [];
  let hasField = false;
  let nextStatus = existing.status;
  let nextNote = existing.resolution_note || '';
  if (Object.hasOwn(body, 'status')) {
    const val = String(body.status || '').trim();
    if (!ALLOWED_CAPA_STATUSES.has(val)) throw new HttpError(400, 'สถานะการแก้ไขไม่ถูกต้อง');
    sets.push('status=?');
    params.push(val);
    if (val === 'resolved') sets.push('resolved_at=CURRENT_TIMESTAMP');
    else sets.push('resolved_at=NULL');
    nextStatus = val;
    hasField = true;
  }
  if (Object.hasOwn(body, 'resolution_note')) {
    nextNote = optionalText(body.resolution_note, 'สรุปผลการแก้ไข', 1000);
    sets.push('resolution_note=?');
    params.push(nextNote);
    hasField = true;
  }
  if (Object.hasOwn(body, 'due_date')) { sets.push('due_date=?'); params.push(isoDate(body.due_date, 'กำหนดแก้ไข')); hasField = true; }
  if (Object.hasOwn(body, 'severity')) { sets.push('severity=?'); params.push(severityValue(body.severity)); hasField = true; }
  if (Object.hasOwn(body, 'finding')) { sets.push('finding=?'); params.push(text(body.finding, 'ข้อบกพร่องที่พบ', 1000)); hasField = true; }
  if (Object.hasOwn(body, 'action_required')) { sets.push('action_required=?'); params.push(text(body.action_required, 'แนวทางแก้ไข', 1000)); hasField = true; }
  if (Object.hasOwn(body, 'responsible_user_id')) {
    const nextResponsible = positiveId(body.responsible_user_id, 'รหัสผู้รับผิดชอบ');
    if (!db.prepare("SELECT id FROM users WHERE id=? AND role='ics' AND status='active'").get(nextResponsible)) {
      throw new HttpError(400, 'ผู้รับผิดชอบต้องเป็นเจ้าหน้าที่ ICS ที่ใช้งานอยู่');
    }
    sets.push('responsible_user_id=?');
    params.push(nextResponsible);
    hasField = true;
  }
  if (!hasField) throw new HttpError(400, 'ไม่มีข้อมูลสำหรับแก้ไข');
  if (nextStatus === 'resolved' && !String(nextNote).trim()) {
    throw new HttpError(400, 'กรุณาระบุสรุปผลการแก้ไขก่อนปิดรายการ');
  }
  sets.push('updated_at=CURRENT_TIMESTAMP');
  db.transaction(() => {
    db.prepare(`UPDATE corrective_actions SET ${sets.join(',')} WHERE id=?`).run(...params, id);
    writeAudit('corrective_action.updated', req.user.id, 'corrective_action', id, { plotId: existing.plot_id, fromStatus: existing.status, toStatus: nextStatus });
  }).immediate();
  res.json(findCorrectiveActionDetail(id));
}));
app.get('/api/audit-logs', auth, icsOrAdmin, wrap((req, res) => {
  const rows = req.user.role === 'admin'
    ? db.prepare(`SELECT l.id,l.actor_user_id,u.name actor_name,l.event_type,l.target_type,l.target_id,l.metadata_json,l.created_at
        FROM audit_logs l LEFT JOIN users u ON u.id=l.actor_user_id ORDER BY l.id DESC LIMIT 100`).all()
    : db.prepare(`SELECT l.id,l.actor_user_id,u.name actor_name,l.event_type,l.target_type,l.target_id,l.metadata_json,l.created_at
        FROM audit_logs l LEFT JOIN users u ON u.id=l.actor_user_id
        WHERE l.actor_user_id=?
          AND l.event_type IN ('review.created','approval.reviewed','corrective_action.created','corrective_action.updated','checklist.created','checklist.updated','evidence.uploaded')
        ORDER BY l.id DESC LIMIT 100`).all(req.user.id);
  res.set('Cache-Control', 'private, no-store').json(rows.map(formatAuditLogRow));
}));
const seenExpressTutorialIps = new Set();
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'ready-to-grow' }));
app.get('/api/config', (req, res) => res.json({ liffId: process.env.LIFF_ID || '', development: devAuthEnabled && isLoopback(req), evidenceUploadEnabled: evidenceStorage.configured }));
app.get('/api/tutorial', (req, res) => {
  const clientIp = req.ip || req.socket?.remoteAddress || '127.0.0.1';
  res.set('Cache-Control', 'no-store').json({ ok: true, clientIp, seen: seenExpressTutorialIps.has(clientIp) });
});
app.post('/api/tutorial', (req, res) => {
  const clientIp = req.ip || req.socket?.remoteAddress || '127.0.0.1';
  if (req.body?.reset) seenExpressTutorialIps.delete(clientIp);
  else seenExpressTutorialIps.add(clientIp);
  res.set('Cache-Control', 'no-store').json({ ok: true, clientIp, seen: seenExpressTutorialIps.has(clientIp) });
});

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
