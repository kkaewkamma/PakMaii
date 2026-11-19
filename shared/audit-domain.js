/**
 * Shared ICS audit domain mappers (checklists, corrective actions, risks, audit logs)
 * used identically by Express + SQLite and Cloudflare Workers + D1.
 */
import { parseJsonSafe } from './validation.js';

export const RISK_SEVERITY_RANK = Object.freeze({ high: 0, medium: 1, low: 2 });

/** Normalize an inspection_checklists DB row into the public API response shape. */
export function formatChecklistRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    standard_code: row.standard_code,
    title: row.title,
    description: row.description || '',
    items: parseJsonSafe(row.items_json, []),
    validation_status: row.validation_status,
    is_active: Boolean(row.is_active),
    created_by: row.created_by ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Normalize a corrective_actions query row into its JSON response shape. */
export function formatCorrectiveActionRow(row) {
  return row ? { ...row, is_overdue: Boolean(row.is_overdue) } : null;
}

/** Normalize an audit_logs query row into a public-safe audit entry object. */
export function formatAuditLogRow(row) {
  return {
    id: row.id,
    actor_user_id: row.actor_user_id,
    actor_name: row.actor_name || null,
    event_type: row.event_type,
    target_type: row.target_type,
    target_id: row.target_id,
    metadata: parseJsonSafe(row.metadata_json, {}),
    created_at: row.created_at,
  };
}

/** Map a pending input approval row into a structured ICS risk item. */
export function formatPendingRisk(row) {
  return {
    ...row,
    type: 'pending',
    severity: 'medium',
    title: 'คำขอใช้ปัจจัยการผลิตรอพิจารณา',
    explanation: `คำขอ "${row.input_name}" รอเจ้าหน้าที่ ICS พิจารณาก่อนนำไปใช้ในแปลง`,
    recommended_tab: 'approval',
  };
}

/** Map an inactive plot row (>14 days without activity) into a structured ICS risk item. */
export function formatInactiveRisk(row) {
  return {
    ...row,
    type: 'inactive',
    severity: 'high',
    title: 'ขาดบันทึกกิจกรรมเกิน 14 วัน',
    explanation: 'ไม่พบบันทึกกิจกรรมการดูแลแปลงติดต่อกันเกิน 14 วัน ควรติดตามหรือลงตรวจแปลง',
    recommended_tab: 'record',
  };
}

/** Map a plot with recent activities lacking photo evidence into a structured ICS risk item. */
export function formatMissingEvidenceRisk(row) {
  return {
    ...row,
    type: 'missing_evidence',
    severity: row.missing_count >= 3 ? 'medium' : 'low',
    title: 'กิจกรรมขาดภาพถ่ายหลักฐาน',
    explanation: `พบ ${row.missing_count} กิจกรรมในรอบ 30 วันล่าสุดที่ยังไม่มีภาพหลักฐานแนบประกอบ`,
    recommended_tab: 'record',
  };
}

/** Map an open or overdue corrective action row into a structured ICS risk item. */
export function formatCorrectiveActionRisk(row) {
  const overdue = Boolean(row.is_overdue);
  return {
    id: row.id,
    plot_id: row.plot_id,
    plot_name: row.plot_name,
    farmer_name: row.farmer_name,
    standard_code: row.standard_code,
    due_date: row.due_date,
    responsible_name: row.responsible_name,
    type: overdue ? 'overdue_action' : 'open_action',
    severity: overdue ? 'high' : (row.severity === 'high' ? 'high' : 'medium'),
    title: overdue ? 'เกินกำหนดแก้ไขปรับปรุง (CAPA)' : 'รายการแก้ไขปรับปรุงรอดำเนินการ',
    explanation: overdue
      ? `ข้อบกพร่อง "${row.finding}" เกินกำหนดวันที่ ${row.due_date} (มาตรฐาน ${row.standard_code})`
      : `ข้อบกพร่อง "${row.finding}" กำหนดแก้ไขภายในวันที่ ${row.due_date} (มาตรฐาน ${row.standard_code})`,
    recommended_tab: 'reviews',
  };
}

/** Sort risk items by severity rank: high -> medium -> low. */
export function sortRisksBySeverity(risks) {
  return [...risks].sort((a, b) => (RISK_SEVERITY_RANK[a.severity] ?? 3) - (RISK_SEVERITY_RANK[b.severity] ?? 3));
}
