/**
 * PakMaii - Notification Dispatcher & Idempotency Manager
 *
 * Coordinates notification events, resolves role/assignment boundaries,
 * prevents duplicate notifications via UNIQUE idempotency_key, and dispatches
 * real LINE Messaging API push messages.
 */

import {
  LINE_EVENT_TYPES,
  buildInputSubmittedMessage,
  buildApprovalApprovedMessage,
  buildApprovalRejectedMessage,
  buildRhythmOverdueMessage,
  buildCapaDeadlineMessage,
  sendLinePushMessage,
  fetchChannelAccessToken
} from '../shared/line-messaging.js';

/**
 * Database abstraction helpers:
 * Universal adapter supporting Node.js SQLite (better-sqlite3, node:sqlite)
 * and Cloudflare D1 (raw D1Database or D1Repository wrapper).
 */
async function dbGet(db, sql, ...params) {
  if (!db) return null;
  if (typeof db.first === 'function') {
    return await db.first(sql, ...params);
  }
  if (typeof db.prepare === 'function') {
    const stmt = db.prepare(sql);
    if (typeof stmt.bind === 'function' && typeof stmt.first === 'function') {
      return await stmt.bind(...params).first();
    }
    return stmt.get(...params);
  }
  return null;
}

async function dbAll(db, sql, ...params) {
  if (!db) return [];
  if (typeof db.all === 'function') {
    const res = await db.all(sql, ...params);
    return Array.isArray(res) ? res : (res?.results ?? []);
  }
  if (typeof db.prepare === 'function') {
    const stmt = db.prepare(sql);
    if (typeof stmt.bind === 'function' && typeof stmt.all === 'function') {
      const res = await stmt.bind(...params).all();
      return res.results ?? [];
    }
    return stmt.all(...params);
  }
  return [];
}

async function dbRun(db, sql, ...params) {
  if (!db) return null;
  if (typeof db.run === 'function') {
    return await db.run(sql, ...params);
  }
  if (typeof db.prepare === 'function') {
    const stmt = db.prepare(sql);
    if (typeof stmt.bind === 'function' && typeof stmt.run === 'function') {
      return await stmt.bind(...params).run();
    }
    return stmt.run(...params);
  }
  return null;
}

export function initNotificationTable(db) {
  if (typeof db.exec === 'function') {
    db.exec(`
      CREATE TABLE IF NOT EXISTS line_notifications(
        id INTEGER PRIMARY KEY,
        idempotency_key TEXT UNIQUE NOT NULL,
        event_type TEXT NOT NULL,
        recipient_user_id INTEGER NOT NULL REFERENCES users(id),
        recipient_line_id TEXT NOT NULL,
        message_payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','skipped')),
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sent_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_line_notifications_recipient ON line_notifications(recipient_user_id, status);
      CREATE INDEX IF NOT EXISTS idx_line_notifications_created ON line_notifications(created_at);
    `);
  }
}

/**
 * Record an event and dispatch via LINE push message with idempotency check.
 * Supports Method 2: Dynamic OAuth v2.1 token resolution via channelId + channelSecret
 * if channelAccessToken is not explicitly supplied.
 */
export async function recordAndDispatchNotification({
  db,
  idempotencyKey,
  eventType,
  recipientUserId,
  recipientLineId,
  messages,
  channelAccessToken,
  channelId = (typeof process !== 'undefined' ? (process.env?.LINE_MESSAGING_CHANNEL_ID || process.env?.LINE_CHANNEL_ID) : null),
  channelSecret = (typeof process !== 'undefined' ? (process.env?.LINE_MESSAGING_CHANNEL_SECRET || process.env?.LINE_CHANNEL_SECRET) : null),
  fetchImpl = globalThis.fetch
}) {
  if (!idempotencyKey || !recipientUserId || !recipientLineId || !messages) {
    return { ok: false, error: 'INVALID_PARAMS' };
  }

  // 1. Check idempotency
  const existing = await dbGet(db, 'SELECT id, status FROM line_notifications WHERE idempotency_key = ?', idempotencyKey);
  if (existing) {
    return { ok: true, skipped: true, reason: 'DUPLICATE_IDEMPOTENCY_KEY', idempotencyKey };
  }

  // 2. Insert pending record
  const payloadStr = JSON.stringify(messages);
  try {
    await dbRun(
      db,
      `INSERT INTO line_notifications(idempotency_key, event_type, recipient_user_id, recipient_line_id, message_payload, status)
       VALUES(?, ?, ?, ?, ?, 'pending')`,
      idempotencyKey, eventType, recipientUserId, recipientLineId, payloadStr
    );
  } catch (err) {
    if (err.message && (err.message.includes('UNIQUE') || err.message.includes('unique'))) {
      return { ok: true, skipped: true, reason: 'RACE_IDEMPOTENCY_KEY', idempotencyKey };
    }
    throw err;
  }

  // Resolve access token (Method 1: Direct token, Method 2: Dynamic OAuth v2.1 via ID + Secret)
  let resolvedToken = channelAccessToken || (typeof process !== 'undefined' ? process.env?.LINE_CHANNEL_ACCESS_TOKEN : null);
  if (!resolvedToken && channelId && channelSecret) {
    resolvedToken = await fetchChannelAccessToken({ channelId, channelSecret, fetchImpl });
  }

  // 3. Dispatch to LINE Messaging API
  const sendResult = await sendLinePushMessage({
    channelAccessToken: resolvedToken,
    to: recipientLineId,
    messages,
    fetchImpl
  });

  // 4. Update status in DB by idempotency_key (universal across SQLite and D1)
  const nextStatus = sendResult.ok ? 'sent' : 'failed';
  const errText = sendResult.error ? String(sendResult.error) : null;
  await dbRun(
    db,
    `UPDATE line_notifications
     SET status = ?, error_message = ?, sent_at = CURRENT_TIMESTAMP
     WHERE idempotency_key = ?`,
    nextStatus, errText, idempotencyKey
  );

  return {
    ok: sendResult.ok,
    idempotencyKey,
    deliveryStatus: sendResult.status,
    recipientLineId,
    error: sendResult.error
  };
}

/**
 * Event 1: Farmer submits input approval request -> Notify assigned ICS officer
 */
export async function notifyInputApprovalSubmitted({
  db,
  approvalId,
  farmerId,
  plotId,
  inputName,
  details,
  liffId,
  channelAccessToken,
  channelId,
  channelSecret,
  fetchImpl
}) {
  if (!approvalId || !farmerId) return { ok: false, error: 'MISSING_DATA' };

  // Resolve assigned ICS officer
  const officer = await dbGet(db, `
    SELECT u.id, u.line_id, u.name, f.name as farmer_name, p.name as plot_name
    FROM farmer_assignments fa
    JOIN users u ON u.id = fa.ics_user_id
    JOIN users f ON f.id = fa.farmer_user_id
    LEFT JOIN plots p ON p.id = ?
    WHERE fa.farmer_user_id = ?
      AND fa.ends_at IS NULL
      AND u.role = 'ics'
      AND u.status = 'active'
      AND u.line_id IS NOT NULL
  `, plotId, farmerId);

  if (!officer || !officer.line_id) {
    return { ok: true, skipped: true, reason: 'NO_ASSIGNED_OFFICER_WITH_LINE_ID' };
  }

  const idempotencyKey = `approval:submit:${approvalId}`;
  const messages = buildInputSubmittedMessage({
    farmerName: officer.farmer_name,
    plotName: officer.plot_name,
    inputName,
    details,
    liffId
  });

  return await recordAndDispatchNotification({
    db,
    idempotencyKey,
    eventType: LINE_EVENT_TYPES.INPUT_SUBMITTED,
    recipientUserId: officer.id,
    recipientLineId: officer.line_id,
    messages,
    channelAccessToken,
    channelId,
    channelSecret,
    fetchImpl
  });
}

/**
 * Event 2 & 3: ICS reviews request -> Notify Farmer (approved or rejected with reason)
 */
export async function notifyApprovalDecided({
  db,
  approvalId,
  status,
  comment,
  reviewerId,
  liffId,
  channelAccessToken,
  channelId,
  channelSecret,
  fetchImpl
}) {
  if (!approvalId || !['approved', 'rejected'].includes(status)) {
    return { ok: false, error: 'INVALID_STATUS' };
  }

  const reqRow = await dbGet(db, `
    SELECT a.id, a.input_name, a.plot_id, p.name as plot_name, u.id as farmer_id, u.line_id, u.name as farmer_name
    FROM approvals a
    JOIN plots p ON p.id = a.plot_id
    JOIN users u ON u.id = a.user_id
    WHERE a.id = ? AND u.status = 'active' AND u.line_id IS NOT NULL
  `, approvalId);

  if (!reqRow || !reqRow.line_id) {
    return { ok: true, skipped: true, reason: 'NO_FARMER_WITH_LINE_ID' };
  }

  const idempotencyKey = `approval:review:${approvalId}:${status}`;
  let messages = null;
  let eventType = null;

  if (status === 'approved') {
    eventType = LINE_EVENT_TYPES.APPROVAL_APPROVED;
    messages = buildApprovalApprovedMessage({
      plotName: reqRow.plot_name,
      inputName: reqRow.input_name,
      comment,
      liffId
    });
  } else {
    eventType = LINE_EVENT_TYPES.APPROVAL_REJECTED;
    messages = buildApprovalRejectedMessage({
      plotName: reqRow.plot_name,
      inputName: reqRow.input_name,
      reason: comment,
      liffId
    });
  }

  return await recordAndDispatchNotification({
    db,
    idempotencyKey,
    eventType,
    recipientUserId: reqRow.farmer_id,
    recipientLineId: reqRow.line_id,
    messages,
    channelAccessToken,
    channelId,
    channelSecret,
    fetchImpl
  });
}

/**
 * Event 4: Scan for plots with no activity in > 14 days and send reminder to farmer
 */
export async function scanAndNotifyRhythmOverdue({
  db,
  liffId,
  channelAccessToken,
  channelId,
  channelSecret,
  fetchImpl,
  nowIso = new Date().toISOString().slice(0, 10)
}) {
  const overduePlots = await dbAll(db, `
    SELECT p.id as plot_id, p.name as plot_name, u.id as farmer_id, u.name as farmer_name, u.line_id,
      COALESCE(MAX(a.activity_date), 'ไม่มีบันทึก') as last_date
    FROM plots p
    JOIN users u ON u.id = p.owner_id
    LEFT JOIN activities a ON a.plot_id = p.id
    WHERE u.role = 'farmer'
      AND u.status = 'active'
      AND u.line_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM activities act
        WHERE act.plot_id = p.id AND act.activity_date >= date(?, '-14 days')
      )
    GROUP BY p.id, p.name, u.id, u.name, u.line_id
  `, nowIso);

  const results = [];
  for (const row of overduePlots) {
    // Idempotency key per plot per day (so farmer gets at most 1 reminder per day)
    const idempotencyKey = `rhythm:${row.plot_id}:${nowIso}`;
    const messages = buildRhythmOverdueMessage({
      farmerName: row.farmer_name,
      plotName: row.plot_name,
      daysInactive: 14,
      liffId
    });

    const res = await recordAndDispatchNotification({
      db,
      idempotencyKey,
      eventType: LINE_EVENT_TYPES.RHYTHM_OVERDUE,
      recipientUserId: row.farmer_id,
      recipientLineId: row.line_id,
      messages,
      channelAccessToken,
      channelId,
      channelSecret,
      fetchImpl
    });
    results.push(res);
  }
  return results;
}

/**
 * Event 5: Scan for CAPA corrective actions due within 3 days and send reminder
 */
export async function scanAndNotifyCapaDeadlines({
  db,
  liffId,
  channelAccessToken,
  channelId,
  channelSecret,
  fetchImpl,
  nowIso = new Date().toISOString().slice(0, 10)
}) {
  const approachingCapa = await dbAll(db, `
    SELECT ca.id as capa_id, ca.standard_code, ca.finding, ca.action_required, ca.due_date,
      p.name as plot_name, u.id as user_id, u.name as responsible_name, u.line_id
    FROM corrective_actions ca
    JOIN plots p ON p.id = ca.plot_id
    JOIN users u ON u.id = ca.responsible_user_id
    WHERE ca.status IN ('open', 'in_progress')
      AND u.status = 'active'
      AND u.line_id IS NOT NULL
      AND ca.due_date >= date(?)
      AND ca.due_date <= date(?, '+3 days')
  `, nowIso, nowIso);

  const results = [];
  for (const row of approachingCapa) {
    const idempotencyKey = `capa:${row.capa_id}:${row.due_date}`;
    const messages = buildCapaDeadlineMessage({
      responsibleName: row.responsible_name,
      plotName: row.plot_name,
      standardCode: row.standard_code,
      finding: row.finding,
      actionRequired: row.action_required,
      dueDate: row.due_date,
      liffId
    });

    const res = await recordAndDispatchNotification({
      db,
      idempotencyKey,
      eventType: LINE_EVENT_TYPES.CAPA_DEADLINE,
      recipientUserId: row.user_id,
      recipientLineId: row.line_id,
      messages,
      channelAccessToken,
      channelId,
      channelSecret,
      fetchImpl
    });
    results.push(res);
  }
  return results;
}
