/**
 * Runtime-agnostic request validation, HTTP error model, and shared domain constants
 * for both Express + SQLite and Cloudflare Workers + D1.
 */

export class HttpError extends Error {
  /** Create an HTTP error with status code and optional machine-readable error code. */
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}

export const ALLOWED_STANDARDS = new Set(['PGS', 'EU_ORGANIC', 'FAIRTRADE']);
export const ALLOWED_SEVERITIES = new Set(['low', 'medium', 'high']);
export const ALLOWED_CAPA_STATUSES = new Set(['open', 'in_progress', 'resolved']);
export const ALLOWED_CHECKLIST_RESULT_STATUSES = new Set(['pass', 'fail', 'na']);
export const ALLOWED_VALIDATION_STATUSES = new Set(['draft_unvalidated', 'validated']);
export const ICS_AUDIT_EVENT_TYPES = Object.freeze([
  'review.created',
  'approval.reviewed',
  'corrective_action.created',
  'corrective_action.updated',
  'checklist.created',
  'checklist.updated',
  'evidence.uploaded',
]);

/** Safely parse a JSON string, returning fallback when absent or malformed. */
export function parseJsonSafe(raw, fallback) {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Return the default landing tab for an authenticated user role. */
export function landingForRole(role) {
  return { farmer: 'home', ics: 'risks', admin: 'invites' }[role];
}

/** Validate a required non-empty trimmed string within the allowed length limit. */
export const text = (value, field, max = 500) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new HttpError(400, `กรุณากรอก ${field}`);
  }
  const clean = String(value).trim();
  if (clean.length > max) throw new HttpError(400, `${field} ยาวเกินกำหนด`);
  return clean;
};

/** Validate an optional trimmed string, returning '' when empty. */
export const optionalText = (value, field, max = 500) => (
  value === undefined || value === null || String(value).trim() === ''
    ? ''
    : text(value, field, max)
);

/** Validate a safe positive integer identifier. */
export const positiveId = (value, field = 'รหัส') => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, `${field} ไม่ถูกต้อง`);
  return id;
};

/** Validate a strict YYYY-MM-DD ISO calendar date string. */
export const isoDate = (value, field) => {
  const date = text(value, field, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new HttpError(400, `${field} ไม่ถูกต้อง`);
  }
  return date;
};

/** Validate an optional external evidence image URL requiring HTTPS. */
export const photoUrl = value => {
  if (!value) return null;
  let parsed;
  try {
    parsed = new URL(String(value));
  } catch {
    throw new HttpError(400, 'ลิงก์รูปภาพไม่ถูกต้อง');
  }
  if (parsed.protocol !== 'https:') throw new HttpError(400, 'ลิงก์รูปภาพต้องเป็น HTTPS');
  return parsed.toString();
};

/** Normalize and validate an organic/sustainability standard code (PGS, EU_ORGANIC, FAIRTRADE). */
export function standardCodeValue(raw, fallback = null) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const val = String(raw).trim().toUpperCase();
  if (!ALLOWED_STANDARDS.has(val)) {
    throw new HttpError(400, 'รหัสมาตรฐานไม่ถูกต้อง (รองรับเฉพาะ PGS, EU_ORGANIC, FAIRTRADE)');
  }
  return val;
}

/** Normalize and validate a finding/CAPA severity level (low, medium, high). */
export function severityValue(raw, fallback = 'medium') {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const val = String(raw).trim().toLowerCase();
  if (!ALLOWED_SEVERITIES.has(val)) throw new HttpError(400, 'ระดับความรุนแรงไม่ถูกต้อง');
  return val;
}

/** Validate configurable inspection checklist item definitions (1 to 30 items). */
export function validateChecklistItems(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 30) {
    throw new HttpError(400, 'รายการตรวจต้องมีอย่างน้อย 1 รายการ และไม่เกิน 30 รายการ');
  }
  return raw.map((item, idx) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new HttpError(400, `หัวข้อตรวจลำดับที่ ${idx + 1} ไม่ถูกต้อง`);
    }
    const label = text(item.label, `หัวข้อตรวจลำดับที่ ${idx + 1}`, 300);
    const rawKey = typeof item.key === 'string'
      ? item.key.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 64)
      : '';
    const key = /^[a-z0-9_-]{1,64}$/.test(rawKey) ? rawKey : `item_${idx + 1}`;
    return { key, label, required: Boolean(item.required) };
  });
}

/** Validate submitted inspection checklist item results (up to 30 items). */
export function validateChecklistResults(raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 30) {
    throw new HttpError(400, 'ผลตรวจตามรายการไม่ถูกต้อง');
  }
  return raw.map((item, idx) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new HttpError(400, `ผลตรวจตามรายการลำดับที่ ${idx + 1} ไม่ถูกต้อง`);
    }
    const rawStatus = String(item.status || 'na').trim().toLowerCase();
    if (!ALLOWED_CHECKLIST_RESULT_STATUSES.has(rawStatus)) {
      throw new HttpError(400, 'สถานะรายการตรวจต้องเป็น pass, fail หรือ na');
    }
    const label = optionalText(item.label, 'หัวข้อตรวจ', 300) || `รายการที่ ${idx + 1}`;
    const rawKey = typeof item.key === 'string'
      ? item.key.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 64)
      : '';
    const key = /^[a-z0-9_-]{1,64}$/.test(rawKey) ? rawKey : `item_${idx + 1}`;
    const note = optionalText(item.note, 'หมายเหตุรายการตรวจ', 500);
    return { key, label, status: rawStatus, ...(note ? { note } : {}) };
  });
}

/** Validate inline corrective action findings attached to an ICS review (up to 10 items). */
export function validateReviewFindings(raw, defaultStandard, defaultResponsibleUserId) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 10) {
    throw new HttpError(400, 'รายการข้อบกพร่องต้องมีไม่เกิน 10 รายการ');
  }
  return raw.map((item, idx) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new HttpError(400, `ข้อบกพร่องลำดับที่ ${idx + 1} ไม่ถูกต้อง`);
    }
    const std = standardCodeValue(item.standard_code, defaultStandard);
    const severity = severityValue(item.severity, 'medium');
    const finding = text(item.finding, `ข้อบกพร่องลำดับที่ ${idx + 1}`, 1000);
    const actionRequired = text(item.action_required, `แนวทางแก้ไขลำดับที่ ${idx + 1}`, 1000);
    const dueDate = isoDate(item.due_date, `กำหนดแก้ไขลำดับที่ ${idx + 1}`);
    const responsibleUserId = item.responsible_user_id !== undefined
      && item.responsible_user_id !== null
      && item.responsible_user_id !== ''
      ? positiveId(item.responsible_user_id, 'รหัสผู้รับผิดชอบ')
      : defaultResponsibleUserId;
    return { standardCode: std, severity, finding, actionRequired, dueDate, responsibleUserId };
  });
}
