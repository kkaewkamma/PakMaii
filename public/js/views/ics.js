'use strict';

import { api, exportCsv } from '../core/api.js';
import { el, card, empty, selectField, dated, notify, formatLocalIsoDate } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { openEvidenceViewer, openPhotoPreviewModal, createPhotoUploader } from '../core/photo.js';
import {
  AUDIT_STANDARD_LABELS,
  AUDIT_SEVERITY_LABELS,
  AUDIT_CAPA_STATUS_LABELS,
  auditValidationBadge,
  buildAuditLogsSection
} from './admin.js';

const refreshView = async () => {
  if (typeof window.__pakMaiiLoadTab === 'function') {
    await window.__pakMaiiLoadTab();
  }
};

const navigateTab = async (targetTab) => {
  if (typeof window.__pakMaiiNavigateTab === 'function') {
    await window.__pakMaiiNavigateTab(targetTab);
  }
};

export async function buildIcsReviewsView({ plots = [], plotSelect = null } = {}) {
  const [rows, checklists, actions, auditLogs] = await Promise.all([
    api('/reviews'),
    api('/checklists').catch(() => []),
    api('/corrective-actions').catch(() => []),
    api('/audit-logs').catch(() => [])
  ]);
  const nodes = [];
  const defaultDueIso = formatLocalIsoDate(new Date(Date.now() + 7 * 86_400_000));

  nodes.push(el('div', { className: 'notice audit-disclaimer' },
    el('b', {}, icon('shield', 15), ' ระบบช่วยตรวจประเมินภายใน (ICS Audit Assistant)'),
    el('p', {}, 'หมายเหตุ: การตรวจของ ICS เป็นการตรวจประเมินภายในกลุ่ม ไม่ใช่การรับรองมาตรฐานเกษตรอินทรีย์อย่างเป็นทางการ และแยกเกณฑ์ PGS, EU Organic และ Fairtrade ออกจากกันอย่างชัดเจน')
  ));

  const availablePlots = plots.length ? plots : (typeof window.__pakMaiiGetPlots === 'function' ? window.__pakMaiiGetPlots() : []);

  if (availablePlots.length) {
    const reviewPlotSel = typeof plotSelect === 'function'
      ? plotSelect()
      : selectField('plot_id', 'แปลงปลูก', availablePlots.map(p => ({ value: p.id, label: `${p.name} — ${p.crop}` })));

    const standardSelect = el('select', { name: 'standard_code', required: true },
      ['PGS', 'EU_ORGANIC', 'FAIRTRADE'].map(code =>
        el('option', { value: code }, AUDIT_STANDARD_LABELS[code] || code)
      )
    );
    const checklistSelect = el('select', { name: 'checklist_id' });
    const checklistMetaRow = el('div', { className: 'pill-list-row mt-8' });
    const checklistItemsHost = el('div', {});
    let checklistRowInputs = [];

    const renderChecklistForStandard = () => {
      const std = standardSelect.value || 'PGS';
      const matching = checklists.filter(c => c.standard_code === std);
      checklistSelect.replaceChildren(
        ...(matching.length
          ? matching.map(c => el('option', { value: c.id }, c.title))
          : [el('option', { value: '' }, 'ไม่มีชุดรายการตรวจในมาตรฐานนี้')])
      );
      renderChecklistItems();
    };

    const renderChecklistItems = () => {
      const selectedId = Number(checklistSelect.value);
      const activeChecklist = checklists.find(c => c.id === selectedId) || null;
      checklistRowInputs = [];
      if (!activeChecklist) {
        checklistMetaRow.replaceChildren(
          el('span', { className: 'pill warn' }, 'ยังไม่เลือกชุดรายการตรวจ (บันทึกเฉพาะบันทึกข้อความได้)')
        );
        checklistItemsHost.replaceChildren();
        return;
      }
      checklistMetaRow.replaceChildren(
        auditValidationBadge(activeChecklist.validation_status),
        activeChecklist.description ? el('small', { className: 'muted' }, activeChecklist.description) : null
      );
      const itemNodes = (activeChecklist.items || []).map(item => {
        const statusSel = el('select', { 'aria-label': `ผลตรวจ ${item.label}` },
          el('option', { value: 'na' }, 'ยังไม่ประเมิน / ไม่เกี่ยวข้อง'),
          el('option', { value: 'pass' }, 'ผ่าน'),
          el('option', { value: 'fail' }, 'พบประเด็น')
        );
        const noteInp = el('input', { type: 'text', placeholder: 'หมายเหตุเฉพาะข้อ (ถ้ามี)', maxlength: 300 });
        statusSel.addEventListener('change', () => {
          if (statusSel.value === 'fail' && !capaToggle.checked) {
            capaToggle.checked = true;
            capaFieldsBox.classList.remove('hide');
            if (!inlineFindingInput.value) inlineFindingInput.value = item.label;
          }
        });
        checklistRowInputs.push({ key: item.key, label: item.label, statusSel, noteInp });
        return el('div', { className: 'audit-checklist-item' },
          el('span', { className: 'audit-checklist-label' }, item.label, item.required ? ' *' : ''),
          el('div', { className: 'audit-checklist-controls' }, statusSel, noteInp)
        );
      });
      checklistItemsHost.replaceChildren(...itemNodes);
    };

    standardSelect.addEventListener('change', renderChecklistForStandard);
    checklistSelect.addEventListener('change', renderChecklistItems);

    const noteArea = el('textarea', { name: 'note', required: true, placeholder: 'บันทึกรายละเอียดการตรวจแปลง ข้อสังเกต หรือข้อเสนอแนะสำหรับเกษตรกร' });
    const reviewEvidenceInput = el('input', { name: 'evidence_id', type: 'hidden', value: '' });

    const capaToggle = el('input', { type: 'checkbox' });
    const inlineSeveritySel = el('select', { name: 'capa_severity' },
      el('option', { value: 'medium' }, 'ปานกลาง (Medium)'),
      el('option', { value: 'high' }, 'เร่งด่วน (High)'),
      el('option', { value: 'low' }, 'เฝ้าระวัง (Low)')
    );
    const inlineDueInput = el('input', { type: 'date', name: 'capa_due_date', value: defaultDueIso });
    const inlineFindingInput = el('input', { type: 'text', name: 'capa_finding', maxlength: 500, placeholder: 'ระบุข้อบกพร่องที่พบ เช่น แนวกันชนไม่ชัดเจน' });
    const inlineActionInput = el('input', { type: 'text', name: 'capa_action_required', maxlength: 500, placeholder: 'ระบุแนวทางแก้ไขที่ต้องการ เช่น ปลูกแนวกันชนเพิ่ม' });

    const capaFieldsBox = el('div', { className: 'audit-capa-box hide' },
      el('div', { className: 'audit-subform-grid' },
        el('label', {}, 'ระดับความรุนแรง', inlineSeveritySel),
        el('label', {}, 'กำหนดแก้ไขภายในวันที่', inlineDueInput)
      ),
      el('label', {}, 'ข้อบกพร่องที่พบ (Finding)', inlineFindingInput),
      el('label', {}, 'แนวทางแก้ไขที่กำหนด (Corrective Action)', inlineActionInput)
    );
    capaToggle.addEventListener('change', () => {
      capaFieldsBox.classList.toggle('hide', !capaToggle.checked);
    });

    const submitReviewBtn = el('button', { type: 'submit' }, icon('shield', 16), ' บันทึกผลตรวจประเมินภายใน');
    const reviewForm = el('form', { id: 'reviewForm', className: 'card' },
      el('h3', {}, icon('shield', 16), ' บันทึกผลการตรวจประเมินแปลงภายใน (ICS Inspection)'),
      reviewPlotSel,
      el('div', { className: 'audit-subform-grid' },
        el('label', {}, 'มาตรฐานที่ตรวจประเมิน (แยกอิสระ)', standardSelect),
        el('label', {}, 'ชุดรายการตรวจ (Configurable Checklist)', checklistSelect)
      ),
      el('div', { className: 'audit-checklist-panel' },
        el('b', {}, 'หัวข้อการตรวจตามชุดรายการ'),
        checklistMetaRow,
        checklistItemsHost
      ),
      selectField('result', 'ผลการตรวจประเมินภายใน', [
        { value: 'ผ่าน', label: 'ผ่านเกณฑ์ตรวจประเมินภายใน (ICS)' },
        { value: 'ต้องแก้ไข', label: 'ต้องแก้ไขปรับปรุง' },
        { value: 'ติดตามเพิ่มเติม', label: 'ต้องติดตามเพิ่มเติม' },
      ]),
      el('label', {}, 'บันทึกผลตรวจและข้อเสนอแนะ', noteArea),
      el('div', { className: 'form-group' },
        el('label', {}, 'แนบภาพหลักฐานการตรวจแปลง (ถ้ามี)'),
        reviewEvidenceInput,
        createPhotoUploader(null, {
          entityType: 'review',
          getPlotId: () => reviewPlotSel.querySelector('select[name="plot_id"]')?.value,
          evidenceIdInput: reviewEvidenceInput,
        })
      ),
      el('div', { className: 'mt-10' },
        el('label', { className: 'audit-inline-toggle' }, capaToggle, 'เปิดรายการข้อบกพร่องและการแก้ไข (CAPA) พร้อมผลตรวจนี้'),
        capaFieldsBox
      ),
      el('div', { className: 'mt-12' }, submitReviewBtn)
    );

    renderChecklistForStandard();

    reviewForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (submitReviewBtn.disabled) return;
      const fd = new FormData(reviewForm);
      const findings = [];
      if (capaToggle.checked) {
        const findingText = inlineFindingInput.value.trim();
        const actionText = inlineActionInput.value.trim();
        const dueDateText = inlineDueInput.value.trim();
        if (!findingText || !actionText || !dueDateText) {
          notify('กรุณากรอกข้อบกพร่อง แนวทางแก้ไข และกำหนดวันให้ครบถ้วน');
          return;
        }
        findings.push({
          standard_code: standardSelect.value,
          severity: inlineSeveritySel.value,
          finding: findingText,
          action_required: actionText,
          due_date: dueDateText,
        });
      }
      submitReviewBtn.disabled = true;
      submitReviewBtn.textContent = 'กำลังบันทึก...';
      try {
        await api('/reviews', 'POST', {
          plot_id: Number(fd.get('plot_id')),
          result: String(fd.get('result') || ''),
          note: String(fd.get('note') || ''),
          standard_code: standardSelect.value,
          checklist_id: checklistSelect.value ? Number(checklistSelect.value) : undefined,
          checklist_results: checklistRowInputs.map(row => ({
            key: row.key,
            label: row.label,
            status: row.statusSel.value,
            note: row.noteInp.value.trim(),
          })),
          evidence_id: reviewEvidenceInput.value ? Number(reviewEvidenceInput.value) : undefined,
          photo_url: reviewEvidenceInput.dataset.uploadedDataUrl || undefined,
          ...(findings.length ? { findings } : {}),
        });
        notify('บันทึกผลตรวจประเมินภายในเรียบร้อย');
        await refreshView();
      } catch (err) {
        if (!err.handled) notify(err.message);
      } finally {
        submitReviewBtn.disabled = false;
        submitReviewBtn.replaceChildren(icon('shield', 16), document.createTextNode(' บันทึกผลตรวจประเมินภายใน'));
      }
    });
    nodes.push(reviewForm);
  } else {
    nodes.push(el('div', { className: 'notice' }, 'ไม่พบแปลงปลูกที่สามารถตรวจได้'));
  }

  // Configurable Checklists section
  const newClStd = el('select', { name: 'standard_code', required: true },
    ['PGS', 'EU_ORGANIC', 'FAIRTRADE'].map(code => el('option', { value: code }, AUDIT_STANDARD_LABELS[code] || code))
  );
  const newClTitle = el('input', { name: 'title', type: 'text', required: true, maxlength: 200, placeholder: 'เช่น รายการตรวจแปลงช่วงหลังเก็บเกี่ยว' });
  const newClDesc = el('input', { name: 'description', type: 'text', maxlength: 500, placeholder: 'ระบุขอบเขตและวัตถุประสงค์ (ไม่บังคับ)' });
  const newClItems = el('textarea', { name: 'items_lines', required: true, placeholder: 'ระบุหัวข้อตรวจบรรทัดละ 1 ข้อ เช่น\nตรวจจุดล้างเครื่องมือ\nตรวจบันทึกการใช้น้ำ' });
  const checklistSubmitBtn = el('button', { type: 'submit', className: 'secondary btn-sm' }, icon('plus', 14), ' สร้างชุดรายการตรวจใหม่');
  const checklistForm = el('form', { id: 'checklistForm', className: 'card' },
    el('div', { className: 'row between' },
      el('h3', {}, icon('clipboard', 16), ' จัดการชุดรายการตรวจ (Configurable Checklists)'),
      el('span', { className: 'pill warn' }, 'รายการใหม่เริ่มที่สถานะ รอการยืนยันเกณฑ์')
    ),
    el('p', { className: 'muted card-lead' }, 'แยกเกณฑ์ PGS, EU Organic และ Fairtrade ออกจากกัน เจ้าหน้าที่ ICS สร้างร่างรายการได้และรอ Admin ยืนยันเกณฑ์'),
    el('div', { className: 'checklist-summary-list mb-12' },
      ...(checklists.length
        ? checklists.map(c => el('div', { className: 'summary-feed-item' },
            el('div', { className: 'row between' },
              el('b', {}, c.title),
              el('div', { className: 'row' },
                el('span', { className: 'pill' }, c.standard_code),
                auditValidationBadge(c.validation_status)
              )
            ),
            el('small', { className: 'muted' }, `${c.items?.length || 0} หัวข้อ • ${c.description || '-'}`)
          ))
        : [el('small', { className: 'muted' }, 'ยังไม่มีชุดรายการตรวจ')])
    ),
    el('div', { className: 'audit-subform-grid' },
      el('label', {}, 'มาตรฐาน', newClStd),
      el('label', {}, 'ชื่อชุดรายการตรวจ', newClTitle)
    ),
    el('label', {}, 'คำอธิบาย', newClDesc),
    el('label', {}, 'รายการตรวจ (บรรทัดละ 1 หัวข้อ)', newClItems),
    checklistSubmitBtn
  );
  checklistForm.addEventListener('submit', async e => {
    e.preventDefault();
    const lines = newClItems.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) { notify('กรุณาระบุหัวข้อตรวจอย่างน้อย 1 ข้อ'); return; }
    checklistSubmitBtn.disabled = true;
    try {
      await api('/checklists', 'POST', {
        standard_code: newClStd.value,
        title: newClTitle.value.trim(),
        description: newClDesc.value.trim(),
        items: lines.map((label, idx) => ({ key: `custom_${idx + 1}`, label, required: true })),
      });
      notify('สร้างชุดรายการตรวจใหม่แล้ว (สถานะ: รอการยืนยันเกณฑ์)');
      await refreshView();
    } catch (err) {
      if (!err.handled) notify(err.message);
    } finally {
      checklistSubmitBtn.disabled = false;
    }
  });
  nodes.push(checklistForm);

  // Corrective Actions (CAPA) section
  const openActionsCount = actions.filter(a => a.status !== 'resolved').length;
  const overdueActionsCount = actions.filter(a => a.is_overdue).length;
  const resolvedActionsCount = actions.filter(a => a.status === 'resolved').length;

  nodes.push(el('div', { className: 'notice' },
    el('b', {}, icon('alert', 15), ' ติดตามข้อบกพร่องและการแก้ไขปรับปรุง (Corrective Actions / CAPA)'),
    el('p', { className: 'muted' }, `ทั้งหมด ${actions.length} • ค้างดำเนินการ ${openActionsCount} • เกินกำหนด ${overdueActionsCount} • ปิดรายการแล้ว ${resolvedActionsCount}`)
  ));

  if (availablePlots.length) {
    const capaPlotSel = typeof plotSelect === 'function'
      ? plotSelect()
      : selectField('plot_id', 'แปลงปลูก', availablePlots.map(p => ({ value: p.id, label: `${p.name} — ${p.crop}` })));
    const capaStdSel = el('select', { name: 'standard_code', required: true },
      ['PGS', 'EU_ORGANIC', 'FAIRTRADE'].map(code => el('option', { value: code }, AUDIT_STANDARD_LABELS[code] || code))
    );
    const capaSevSel = el('select', { name: 'severity', required: true },
      el('option', { value: 'high' }, 'เร่งด่วน (High)'),
      el('option', { value: 'medium', selected: true }, 'ปานกลาง (Medium)'),
      el('option', { value: 'low' }, 'เฝ้าระวัง (Low)')
    );
    const capaDueField = el('input', { name: 'due_date', type: 'date', required: true, value: defaultDueIso });
    const capaFindingField = el('input', { name: 'finding', type: 'text', required: true, maxlength: 500, placeholder: 'ข้อบกพร่องที่ตรวจพบ' });
    const capaActionField = el('input', { name: 'action_required', type: 'text', required: true, maxlength: 500, placeholder: 'แนวทางการแก้ไขที่กำหนด' });
    const capaSubmitBtn = el('button', { type: 'submit', className: 'btn-sm' }, icon('plus', 14), ' บันทึกรายการแก้ไข (CAPA)');

    const capaForm = el('form', { id: 'capaForm', className: 'card' },
      el('h4', {}, icon('edit', 15), ' สร้างรายการแก้ไขปรับปรุงเพิ่มเติม'),
      capaPlotSel,
      el('div', { className: 'audit-subform-grid' },
        el('label', {}, 'มาตรฐานที่เกี่ยวข้อง', capaStdSel),
        el('label', {}, 'ระดับความรุนแรง', capaSevSel),
        el('label', {}, 'กำหนดแก้ไขภายในวันที่', capaDueField)
      ),
      el('label', {}, 'ข้อบกพร่องที่พบ', capaFindingField),
      el('label', {}, 'แนวทางแก้ไขที่กำหนด', capaActionField),
      capaSubmitBtn
    );
    capaForm.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(capaForm);
      capaSubmitBtn.disabled = true;
      try {
        await api('/corrective-actions', 'POST', {
          plot_id: Number(fd.get('plot_id')),
          standard_code: fd.get('standard_code'),
          severity: fd.get('severity'),
          due_date: fd.get('due_date'),
          finding: String(fd.get('finding') || ''),
          action_required: String(fd.get('action_required') || ''),
        });
        notify('สร้างรายการแก้ไขปรับปรุงเรียบร้อย');
        await refreshView();
      } catch (err) {
        if (!err.handled) notify(err.message);
      } finally {
        capaSubmitBtn.disabled = false;
      }
    });
    nodes.push(capaForm);
  }

  if (actions.length) {
    let capaFilter = 'all';
    const capaHost = el('div', { className: 'cards-list' });
    const renderCapaList = () => {
      const filtered = actions.filter(a => {
        if (capaFilter === 'overdue') return a.is_overdue;
        if (capaFilter === 'all') return true;
        return a.status === capaFilter;
      });
      if (!filtered.length) {
        capaHost.replaceChildren(empty('ไม่พบรายการแก้ไขปรับปรุงตามตัวกรอง'));
        return;
      }
      capaHost.replaceChildren(...filtered.map(item => {
        const statusSel = el('select', { name: 'status' },
          ['open', 'in_progress', 'resolved'].map(st => el('option', { value: st, selected: item.status === st }, AUDIT_CAPA_STATUS_LABELS[st] || st))
        );
        const resNoteInp = el('input', { type: 'text', value: item.resolution_note || '', maxlength: 500, placeholder: 'สรุปผลการแก้ไข (จำเป็นเมื่อปิดรายการเป็นแก้ไขแล้ว)' });
        const updBtn = el('button', { type: 'submit', className: 'secondary btn-sm' }, 'อัปเดตสถานะ');
        const updForm = el('form', { className: 'capa-update-form' },
          el('div', { className: 'audit-subform-grid' },
            el('label', {}, 'สถานะการแก้ไข', statusSel),
            el('label', {}, 'บันทึกผลการแก้ไข', resNoteInp)
          ),
          updBtn
        );
        updForm.addEventListener('submit', async e => {
          e.preventDefault();
          if (statusSel.value === 'resolved' && !resNoteInp.value.trim()) {
            notify('กรุณาระบุสรุปผลการแก้ไขก่อนปิดรายการ');
            resNoteInp.focus();
            return;
          }
          updBtn.disabled = true;
          try {
            await api(`/corrective-actions/${item.id}`, 'PATCH', {
              status: statusSel.value,
              resolution_note: resNoteInp.value.trim(),
            });
            notify('อัปเดตสถานะการแก้ไขเรียบร้อย');
            await refreshView();
          } catch (err) {
            if (!err.handled) notify(err.message);
          } finally {
            updBtn.disabled = false;
          }
        });

        return el('div', { className: `card capa-card ${item.is_overdue ? 'capa-overdue' : ''} ${item.status === 'resolved' ? 'capa-resolved' : ''}` },
          el('div', { className: 'row between' },
            el('b', {}, `${item.plot_name} • ${item.finding}`),
            el('div', { className: 'pill-list-row' },
              el('span', { className: 'pill' }, item.standard_code),
              el('span', { className: `pill ${item.severity === 'high' ? 'danger' : item.severity === 'medium' ? 'warn' : ''}` }, AUDIT_SEVERITY_LABELS[item.severity] || item.severity),
              item.is_overdue ? el('span', { className: 'pill danger' }, 'เกินกำหนด') : null,
              el('span', { className: `pill ${item.status === 'resolved' ? 'success' : 'warn'}` }, AUDIT_CAPA_STATUS_LABELS[item.status] || item.status)
            )
          ),
          el('p', {}, `แนวทางแก้ไข: ${item.action_required}`),
          el('small', { className: 'muted' }, `เกษตรกร: ${item.farmer_name || '-'} • ผู้รับผิดชอบ: ${item.responsible_name || 'ICS'} • กำหนดส่ง: ${item.due_date}`),
          item.resolution_note ? el('p', { className: 'muted mt-8' }, `สรุปผลแก้ไข: ${item.resolution_note}${item.resolved_at ? ` (${dated(item.resolved_at)})` : ''}`) : null,
          updForm
        );
      }));
    };

    const capaFilterBar = el('div', { className: 'ics-filter-bar' },
      el('div', { className: 'filter-chips-row' },
        ...[['all', 'ทั้งหมด'], ['open', 'รอดำเนินการ'], ['in_progress', 'กำลังแก้ไข'], ['overdue', 'เกินกำหนด'], ['resolved', 'ปิดรายการแล้ว']].map(([k, lbl]) => {
          const btn = el('button', {
            type: 'button',
            className: `chip ${k === 'all' ? 'active' : ''}`,
            onclick: () => {
              capaFilter = k;
              capaFilterBar.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
              btn.classList.add('active');
              renderCapaList();
            }
          }, lbl);
          return btn;
        })
      )
    );
    renderCapaList();
    nodes.push(capaFilterBar, capaHost);
  } else {
    nodes.push(empty('ยังไม่มีรายการแก้ไขปรับปรุง (CAPA)'));
  }

  // Inspection History
  nodes.push(el('div', { className: 'notice' },
    el('b', {}, icon('shield', 15), ' ประวัติการตรวจประเมินแปลงทั้งหมด'),
    el('p', { className: 'muted' }, `บันทึกแล้วทั้งหมด ${rows.length} ครั้ง`)
  ));

  if (rows.length) {
    nodes.push(
      el('div', { className: 'row between search-actions-row' },
        el('small', { className: 'muted' }, 'ประวัติการตรวจภายในกลุ่ม แยกตามมาตรฐานที่ประเมิน'),
        el('button', {
          type: 'button',
          className: 'btn-sm secondary',
          onclick: () => {
            const headers = ['ลำดับ', 'ชื่อแปลง', 'มาตรฐาน', 'ผลตรวจ', 'บันทึกและข้อเสนอแนะ', 'วันที่ตรวจ'];
            const dataRows = rows.map(r => [r.id, r.plot_name || '-', r.standard_code || '-', r.result || '-', r.note || '-', dated(r.created_at)]);
            exportCsv(`pakmaii-inspections-${new Date().toISOString().slice(0, 10)}.csv`, headers, dataRows);
          }
        }, icon('fileText', 13), ' ส่งออกผลตรวจ (CSV/Excel)')
      )
    );

    let resultFilter = 'all';
    let reviewQuery = '';
    const reviewsHost = el('div', { className: 'cards-list' });
    const renderReviewsList = () => {
      const q = reviewQuery.trim().toLowerCase();
      const filtered = rows.filter(item => {
        const matchResult = resultFilter === 'all' || item.result === resultFilter;
        const matchQ = !q ||
          String(item.plot_name || '').toLowerCase().includes(q) ||
          String(item.farmer_name || '').toLowerCase().includes(q) ||
          String(item.standard_code || '').toLowerCase().includes(q) ||
          String(item.note || '').toLowerCase().includes(q);
        return matchResult && matchQ;
      });
      if (!filtered.length) {
        reviewsHost.replaceChildren(empty('ไม่พบผลตรวจที่ตรงกับตัวกรอง'));
        return;
      }
      reviewsHost.replaceChildren(...filtered.map(item => {
        const isPass = item.result === 'ผ่าน';
        const pillClass = isPass ? 'pill success' : 'pill warn';
        const resultIcon = isPass ? icon('checkCircle', 12) : icon('alert', 12);
        const resultsArr = Array.isArray(item.checklist_results) ? item.checklist_results : [];
        const passCnt = resultsArr.filter(x => x.status === 'pass').length;
        const failCnt = resultsArr.filter(x => x.status === 'fail').length;
        return card(
          el('div', { className: 'row between' },
            el('b', {}, item.plot_name),
            el('div', { className: 'pill-list-row' },
              item.standard_code ? el('span', { className: 'pill' }, item.standard_code) : null,
              Number(item.open_actions_count) > 0 ? el('span', { className: 'pill danger' }, `CAPA ค้าง ${item.open_actions_count}`) : null,
              el('span', { className: pillClass }, resultIcon, item.result)
            )
          ),
          item.farmer_name ? el('p', { className: 'muted' }, `เกษตรกร: ${item.farmer_name}`) : null,
          el('p', { className: 'pre-line-text' }, item.note),
          resultsArr.length ? el('small', { className: 'muted block-meta' }, `รายการตรวจ: ผ่าน ${passCnt} • พบประเด็น ${failCnt} (จาก ${resultsArr.length} ข้อ)`) : null,
          item.evidence_id ? el('button', {
            type: 'button',
            className: 'link-btn',
            onclick: () => openEvidenceViewer(item.evidence_id)
          }, icon('camera', 13), ' ดูภาพหลักฐานที่อัปโหลด') : null,
          item.photo_url ? el('div', { className: 'mt-8' },
            el('img', {
              src: item.photo_url,
              className: 'activity-photo-thumb',
              alt: 'ภาพหลักฐานการตรวจแปลง',
              onclick: () => openPhotoPreviewModal(item.photo_url, `ภาพหลักฐานการตรวจแปลง ${item.plot_name || ''}`.trim())
            })
          ) : null,
          el('small', { className: 'muted' }, `ผู้ตรวจ: ${item.reviewer_name || 'เจ้าหน้าที่ ICS'} • ${dated(item.created_at)}`)
        );
      }));
    };

    const reviewFilterBar = el('div', { className: 'ics-filter-bar' },
      el('div', { className: 'search-filter-box' },
        icon('search', 15),
        el('input', {
          type: 'search',
          placeholder: 'ค้นหาชื่อแปลง, เกษตรกร, มาตรฐาน หรือบันทึกผลตรวจ...',
          oninput: (e) => { reviewQuery = e.target.value; renderReviewsList(); }
        })
      ),
      el('div', { className: 'filter-chips-row' },
        ...[['all', 'ทั้งหมด'], ['ผ่าน', 'ผ่าน'], ['ต้องแก้ไข', 'ต้องแก้ไข'], ['ติดตามเพิ่มเติม', 'ติดตามเพิ่มเติม']].map(([key, label]) => {
          const btn = el('button', {
            type: 'button',
            className: `chip ${key === 'all' ? 'active' : ''}`,
            onclick: () => {
              resultFilter = key;
              reviewFilterBar.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
              btn.classList.add('active');
              renderReviewsList();
            }
          }, label);
          return btn;
        })
      )
    );
    renderReviewsList();
    nodes.push(reviewFilterBar, reviewsHost);
  } else {
    nodes.push(empty('ยังไม่มีบันทึกผลตรวจแปลง'));
  }

  nodes.push(buildAuditLogsSection(auditLogs));
  return nodes;
}

export async function buildIcsRisksView() {
  const rows = await api('/risks');
  const highCount = rows.filter(r => r.severity === 'high').length;
  const nodes = [
    el('div', { className: 'notice' },
      el('b', {}, icon('alert', 15), ' สัญญาณความเสี่ยงและจุดติดตามแปลง (ICS Risk Assistant)'),
      el('p', {}, `ตรวจพบ ${rows.length} รายการ (ระดับเร่งด่วน ${highCount} รายการ) • ครอบคลุมการขาดบันทึก ขาดภาพหลักฐาน คำขอรออนุมัติ และรายการแก้ไขเกินกำหนด`)
    )
  ];
  if (!rows.length) {
    nodes.push(empty('ไม่พบสัญญาณความเสี่ยงในแปลงของเกษตรกรที่คุณดูแล'));
    return nodes;
  }

  let sevFilter = 'all';
  const listHost = el('div', { className: 'cards-list' });
  const renderList = () => {
    const filtered = rows.filter(item => sevFilter === 'all' || (item.severity || 'high') === sevFilter);
    if (!filtered.length) {
      listHost.replaceChildren(empty('ไม่พบความเสี่ยงในระดับที่เลือก'));
      return;
    }
    listHost.replaceChildren(...filtered.map(item => {
      const sev = item.severity || (item.type === 'pending' ? 'medium' : 'high');
      const pillClass = sev === 'high' ? 'pill danger' : sev === 'medium' ? 'pill warn' : 'pill';
      const targetTab = item.recommended_tab || (item.type === 'pending' ? 'approval' : 'reviews');
      const actionLabel = targetTab === 'approval' ? 'ไปที่คำขออนุมัติ' : targetTab === 'record' ? 'ดูกิจกรรมแปลง' : 'จัดการในหน้าตรวจแปลง';
      return card(
        el('div', { className: 'row between' },
          el('b', {}, item.plot_name || '-'),
          el('div', { className: 'pill-list-row' },
            item.standard_code ? el('span', { className: 'pill' }, item.standard_code) : null,
            el('span', { className: pillClass }, icon(sev === 'high' ? 'alert' : 'clock', 12), ` ${AUDIT_SEVERITY_LABELS[sev] || sev} • ${item.title || item.type}`)
          )
        ),
        item.farmer_name ? el('p', { className: 'muted' }, `เกษตรกร: ${item.farmer_name}${item.responsible_name ? ` • ผู้รับผิดชอบ: ${item.responsible_name}` : ''}`) : null,
        el('p', {}, item.explanation || (item.type === 'pending'
          ? `มีคำขอปัจจัยการผลิต "${item.input_name || '-'}" รอการพิจารณาตรวจสอบ`
          : 'ไม่พบบันทึกกิจกรรมการเกษตรในแปลงนี้ติดต่อกันเกิน 14 วัน')),
        el('div', { className: 'row mt-8' },
          el('button', {
            type: 'button',
            className: 'secondary btn-sm',
            onclick: async () => { await navigateTab(targetTab); }
          }, icon(targetTab === 'approval' ? 'clipboard' : targetTab === 'record' ? 'calendar' : 'shield', 13), ` ${actionLabel}`)
        )
      );
    }));
  };

  const filterBar = el('div', { className: 'ics-filter-bar' },
    el('div', { className: 'filter-chips-row' },
      ...[['all', 'ทั้งหมด'], ['high', 'เร่งด่วน (High)'], ['medium', 'ปานกลาง (Medium)'], ['low', 'เฝ้าระวัง (Low)']].map(([key, lbl]) => {
        const btn = el('button', {
          type: 'button',
          className: `chip ${key === 'all' ? 'active' : ''}`,
          onclick: () => {
            sevFilter = key;
            filterBar.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderList();
          }
        }, lbl);
        return btn;
      })
    )
  );
  renderList();
  nodes.push(filterBar, listHost);
  return nodes;
}
