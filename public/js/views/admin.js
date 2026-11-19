'use strict';

import { api } from '../core/api.js';
import { el, card, empty, inputField, selectField, dated, notify } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { roleLabels, statusLabels } from '../core/state.js';

let lastInvitation = null;

const refreshView = async () => {
  if (typeof window.__pakMaiiLoadTab === 'function') {
    await window.__pakMaiiLoadTab();
  }
};

export const AUDIT_STANDARD_LABELS = {
  PGS: 'PGS (ตรวจประเมินภายในกลุ่ม)',
  EU_ORGANIC: 'EU Organic (โครงสร้างแยกต่างหาก)',
  FAIRTRADE: 'Fairtrade (โครงสร้างแยกต่างหาก)'
};
export const AUDIT_SEVERITY_LABELS = { high: 'เร่งด่วน', medium: 'ปานกลาง', low: 'เฝ้าระวัง' };
export const AUDIT_CAPA_STATUS_LABELS = { open: 'รอดำเนินการ', in_progress: 'กำลังแก้ไข', resolved: 'ปิดรายการแล้ว' };
export const AUDIT_EVENT_LABELS = {
  'review.created': 'บันทึกผลตรวจแปลง',
  'approval.reviewed': 'พิจารณาคำขอปัจจัย',
  'corrective_action.created': 'สร้างรายการแก้ไข (CAPA)',
  'corrective_action.updated': 'อัปเดตสถานะ CAPA',
  'checklist.created': 'สร้างชุดรายการตรวจ',
  'checklist.updated': 'แก้ไขชุดรายการตรวจ',
  'evidence.uploaded': 'อัปโหลดภาพหลักฐาน',
  'user.created': 'สร้างบัญชีผู้ใช้',
  'user.status_changed': 'เปลี่ยนสถานะผู้ใช้',
  'assignment.created': 'มอบหมาย ICS-เกษตรกร',
  'assignment.ended': 'สิ้นสุดการมอบหมาย',
  'invitation.created': 'สร้างรหัสเชิญ',
  'invitation.revoked': 'เพิกถอนรหัสเชิญ',
  'account.linked': 'ผูกบัญชี LINE'
};

export function auditValidationBadge(status) {
  return status === 'validated'
    ? el('span', { className: 'pill success' }, icon('checkCircle', 12), ' ยืนยันเกณฑ์แล้ว')
    : el('span', { className: 'pill warn' }, icon('clock', 12), ' รอการยืนยันเกณฑ์');
}

export function buildAuditLogsSection(logs, title = 'บันทึกประวัติการตรวจสอบ (Audit Log)') {
  if (!logs.length) return empty('ยังไม่มีบันทึกประวัติการตรวจสอบในระบบ');
  return card(
    el('div', { className: 'row between' },
      el('h3', {}, icon('fileText', 16), ` ${title}`),
      el('span', { className: 'pill' }, `ล่าสุด ${logs.length} รายการ`)
    ),
    el('div', { className: 'watchlist-table-wrap mt-10' },
      el('table', { className: 'watchlist-table' },
        el('thead', {},
          el('tr', {},
            el('th', {}, 'วันเวลา'),
            el('th', {}, 'ผู้ดำเนินการ'),
            el('th', {}, 'เหตุการณ์'),
            el('th', {}, 'เป้าหมาย')
          )
        ),
        el('tbody', {},
          ...logs.slice(0, 30).map(log => el('tr', {},
            el('td', {}, dated(log.created_at)),
            el('td', {}, log.actor_name || `#${log.actor_user_id || '-'}`),
            el('td', {}, AUDIT_EVENT_LABELS[log.event_type] || log.event_type),
            el('td', {}, `${log.target_type || '-'} #${log.target_id || '-'}`)
          ))
        )
      )
    )
  );
}

export async function loadInvites() {
  const [targets, invites] = await Promise.all([api('/admin/unlinked-users'), api('/admin/invites')]);
  const nodes = [];
  if (lastInvitation) {
    const invitation = lastInvitation;
    nodes.push(el('div', { className: 'notice' },
      el('b', {}, 'คัดลอกรหัสนี้ทันที ระบบจะไม่แสดงย้อนหลัง'),
      el('p', { className: 'token' }, invitation.invitationToken),
      el('button', {
        type: 'button',
        onclick: async () => {
          try { await navigator.clipboard.writeText(invitation.invitationToken); notify('คัดลอกรหัสเชิญแล้ว'); }
          catch { notify('คัดลอกไม่สำเร็จ กรุณาเลือกข้อความด้วยตนเอง'); }
        }
      }, 'คัดลอกรหัสเชิญ'),
      ' ',
      el('button', { type: 'button', className: 'secondary', onclick: () => { lastInvitation = null; refreshView(); } }, 'ซ่อนรหัส'),
      el('p', {}, el('small', {}, `หมดอายุ ${dated(invitation.expiresAt)}`))
    ));
  }
  if (targets.length) {
    const form = el('form', { className: 'card' },
      el('h3', {}, 'สร้างคำเชิญ 24 ชั่วโมง'),
      selectField('targetUserId', 'บัญชี Farmer หรือ ICS', targets.map(user => ({ value: user.id, label: `${user.agency_code} — ${user.name} (${roleLabels[user.role]}) • ${statusLabels[user.status]}` }))),
      el('button', { type: 'submit' }, 'สร้างรหัสเชิญ')
    );
    form.addEventListener('submit', async event => {
      event.preventDefault();
      try {
        lastInvitation = await api('/admin/invites', 'POST', { targetUserId: Number(new FormData(form).get('targetUserId')) });
        notify('สร้างคำเชิญแล้ว');
        await refreshView();
      } catch (error) {
        if (!error.handled) notify(error.message);
      }
    });
    nodes.push(form);
  } else {
    nodes.push(empty('ไม่มี Farmer หรือ ICS ที่รอผูก LINE'));
  }
  for (const invite of invites) {
    const box = card(
      el('b', {}, `${invite.target_code || '-'} — ${invite.target_name}`),
      ' ',
      el('span', { className: 'pill' }, roleLabels[invite.target_role] || invite.target_role),
      ' ',
      el('span', { className: `pill ${invite.status === 'active' ? 'warn' : ''}` }, statusLabels[invite.status] || invite.status),
      el('p', {}, `สร้าง ${dated(invite.created_at)} • หมดอายุ ${dated(invite.expires_at)}`)
    );
    if (invite.status === 'active') {
      box.append(el('button', {
        type: 'button', className: 'secondary',
        onclick: async () => {
          try { await api(`/admin/invites/${invite.id}/revoke`, 'PATCH', {}); notify('เพิกถอนคำเชิญแล้ว'); await refreshView(); }
          catch (error) { if (!error.handled) notify(error.message); }
        }
      }, 'เพิกถอน'));
    }
    nodes.push(box);
  }
  return nodes;
}

export async function loadUsers() {
  const users = await api('/admin/users');
  const form = el('form', { className: 'card' },
    el('h3', {}, 'เพิ่ม Farmer หรือ ICS'),
    inputField('agencyCode', 'รหัสประจำตัว'),
    inputField('name', 'ชื่อ'),
    selectField('role', 'บทบาท', [{ value: 'farmer', label: 'Farmer' }, { value: 'ics', label: 'ICS Officer' }]),
    el('button', { type: 'submit' }, 'เพิ่มผู้ใช้')
  );
  form.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await api('/admin/users', 'POST', Object.fromEntries(new FormData(form)));
      notify('เพิ่มผู้ใช้แล้ว');
      await refreshView();
    } catch (error) {
      if (!error.handled) notify(error.message);
    }
  });
  return [form, ...users.map(user => {
    const box = card(
      el('b', {}, `${user.agency_code || '-'} — ${user.name}`),
      ' ',
      el('span', { className: 'pill' }, roleLabels[user.role] || user.role),
      el('p', {}, `สถานะ ${statusLabels[user.status] || user.status} • ${user.linked ? 'ผูก LINE แล้ว' : 'ยังไม่ผูก LINE'}`)
    );
    if (user.role !== 'admin') {
      box.append(el('button', {
        type: 'button', className: 'secondary',
        onclick: async () => {
          try { await api(`/admin/users/${user.id}/status`, 'PATCH', { status: user.status === 'disabled' ? 'active' : 'disabled' }); await refreshView(); }
          catch (error) { if (!error.handled) notify(error.message); }
        }
      }, user.status === 'disabled' ? 'เปิดใช้งาน' : 'ระงับบัญชี'));
    }
    return box;
  })];
}

export async function loadAssignments() {
  const [users, assignments] = await Promise.all([api('/admin/users'), api('/admin/assignments')]);
  const officers = users.filter(user => user.role === 'ics' && user.status === 'active');
  const farmers = users.filter(user => user.role === 'farmer' && user.status === 'active');
  const nodes = [];
  if (officers.length && farmers.length) {
    const form = el('form', { className: 'card' },
      el('h3', {}, 'มอบหมาย Farmer ให้ ICS'),
      selectField('icsUserId', 'ICS Officer', officers.map(user => ({ value: user.id, label: `${user.agency_code} — ${user.name}` }))),
      selectField('farmerUserId', 'Farmer', farmers.map(user => ({ value: user.id, label: `${user.agency_code} — ${user.name}` }))),
      el('button', { type: 'submit' }, 'บันทึก Assignment')
    );
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      try {
        await api('/admin/assignments', 'POST', { icsUserId: Number(values.icsUserId), farmerUserId: Number(values.farmerUserId) });
        await refreshView();
      } catch (error) {
        if (!error.handled) notify(error.message);
      }
    });
    nodes.push(form);
  }
  for (const item of assignments) {
    const box = card(
      el('b', {}, `${item.ics_name} → ${item.farmer_name}`),
      ' ',
      el('span', { className: 'pill' }, item.ends_at ? 'สิ้นสุดแล้ว' : 'active')
    );
    if (!item.ends_at) {
      box.append(el('p', {}, el('button', {
        type: 'button', className: 'secondary',
        onclick: async () => {
          try { await api(`/admin/assignments/${item.id}/end`, 'PATCH', {}); await refreshView(); }
          catch (error) { if (!error.handled) notify(error.message); }
        }
      }, 'สิ้นสุด Assignment')));
    }
    nodes.push(box);
  }
  return nodes.length ? nodes : [empty()];
}

export function dataForm(id, fields, label, path, onSuccess) {
  const submitBtn = el('button', { type: 'submit' }, icon('plus', 16), label);
  const form = el('form', { id, className: 'card' }, fields, submitBtn);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังบันทึก...';
    try {
      const values = Object.fromEntries(new FormData(form));
      await api(path, 'POST', values);
      notify('บันทึกสำเร็จ');
      form.reset();
      if (onSuccess) onSuccess();
      await refreshView();
    } catch (error) {
      if (!error.handled) notify(error.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.replaceChildren(icon('plus', 16), document.createTextNode(label));
    }
  });
  return form;
}

export async function loadAdminOverview() {
  const [users, assignments, checklists, auditLogs] = await Promise.all([
    api('/admin/users'),
    api('/admin/assignments'),
    api('/checklists?include_inactive=1').catch(() => []),
    api('/audit-logs').catch(() => [])
  ]);
  const activeUsers = users.filter(u => u.status === 'active').length;
  const unlinkedUsers = users.filter(u => !u.linked).length;
  const farmerCount = users.filter(u => u.role === 'farmer').length;
  const icsCount = users.filter(u => u.role === 'ics').length;
  const activeAssignments = assignments.filter(a => !a.ends_at).length;

  const kpis = el('div', { className: 'grid kpi-grid' },
    [
      ['ผู้ใช้งานทั้งหมด', `${users.length}`, 'คน', `เปิดใช้งาน ${activeUsers} • รอผูก LINE ${unlinkedUsers}`],
      ['เกษตรกร (Farmer)', `${farmerCount}`, 'ราย', 'บันทึกแปลงและขออนุมัติปัจจัย'],
      ['เจ้าหน้าที่ ICS', `${icsCount}`, 'คน', 'ตรวจแปลง พิจารณาคำขอ และจุดเสี่ยง'],
      ['การมอบหมายที่ใช้งานอยู่', `${activeAssignments}`, 'คู่', `ทั้งหมดในระบบ ${assignments.length} รายการ`]
    ].map(([label, val, unit, desc]) =>
      el('div', { className: 'card kpi-card' },
        el('div', { className: 'kpi-top' }, el('span', { className: 'kpi-tag' }, label)),
        el('div', { className: 'kpi-num' }, val, el('small', {}, ` ${unit}`)),
        el('div', { className: 'kpi-desc muted' }, desc)
      )
    )
  );

  const rbacRows = [
    ['สร้าง/แก้ไขแปลงปลูกและบันทึกกิจกรรมตนเอง', 'ได้', 'ดูในความดูแล', '—'],
    ['ยื่นคำขออนุมัติปัจจัยการผลิต (/approvals POST)', 'ได้', '—', '—'],
    ['พิจารณาคำขอปัจจัย (/approvals PATCH)', '—', 'ได้', '—'],
    ['ดูความเสี่ยง (/risks) และบันทึกผลตรวจ (/reviews)', '—', 'ได้', '—'],
    ['จัดการชุดรายการตรวจและยืนยันเกณฑ์ (/checklists)', '—', 'สร้าง/แก้ไขร่าง', 'ยืนยันเกณฑ์'],
    ['สร้างคำเชิญ จัดการผู้ใช้ และมอบหมาย (/admin/*)', '—', '—', 'ได้']
  ];

  const rbacTableCard = card(
    el('div', { className: 'row between' },
      el('h3', {}, icon('shield', 16), ' ตารางสิทธิ์ตามบทบาท (RBAC Read-Only)'),
      el('span', { className: 'pill' }, 'อ่านอย่างเดียว')
    ),
    el('p', { className: 'muted card-lead' }, 'สรุปขอบเขตสิทธิ์ที่เซิร์ฟเวอร์บังคับใช้จริงสำหรับแต่ละบทบาท'),
    el('div', { className: 'watchlist-table-wrap' },
      el('table', { className: 'watchlist-table' },
        el('thead', {},
          el('tr', {},
            el('th', {}, 'ความสามารถ / เส้นทาง API'),
            el('th', {}, 'Farmer'),
            el('th', {}, 'ICS'),
            el('th', {}, 'Admin')
          )
        ),
        el('tbody', {},
          ...rbacRows.map(r => el('tr', {}, ...r.map(cell => el('td', {}, cell))))
        )
      )
    )
  );

  const checklistAdminCard = card(
    el('div', { className: 'row between' },
      el('h3', {}, icon('clipboard', 16), ' ชุดรายการตรวจตามมาตรฐาน (ยืนยันเกณฑ์โดยผู้ดูแลระบบ)'),
      el('span', { className: 'pill' }, `${checklists.length} ชุดรายการ`)
    ),
    el('p', { className: 'muted card-lead' }, 'แยกเกณฑ์ PGS, EU Organic และ Fairtrade ออกจากกันอย่างชัดเจน'),
    ...(checklists.length
      ? checklists.map(cl => el('div', { className: 'summary-feed-item' },
          el('div', { className: 'row between' },
            el('div', {},
              el('span', { className: 'pill' }, AUDIT_STANDARD_LABELS[cl.standard_code] || cl.standard_code),
              ' ',
              el('b', {}, cl.title)
            ),
            el('div', { className: 'row' },
              auditValidationBadge(cl.validation_status),
              cl.validation_status !== 'validated'
                ? el('button', {
                    type: 'button',
                    className: 'btn-sm secondary',
                    onclick: async () => {
                      try {
                        await api(`/checklists/${cl.id}`, 'PATCH', { validation_status: 'validated' });
                        notify('ยืนยันสถานะชุดรายการตรวจเรียบร้อย');
                        await refreshView();
                      } catch (err) {
                        if (!err.handled) notify(err.message);
                      }
                    }
                  }, 'ยืนยันเกณฑ์')
                : null
            )
          ),
          el('small', { className: 'muted' }, `${cl.items?.length || 0} หัวข้อ • ${cl.description || '-'}`)
        ))
      : [el('p', { className: 'muted' }, 'ยังไม่มีชุดรายการตรวจในระบบ')])
  );

  return [kpis, rbacTableCard, checklistAdminCard, buildAuditLogsSection(auditLogs)];
}
