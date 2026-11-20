'use strict';

import { api } from '../core/api.js';
import { el, card, empty, inputField, selectField, statusBadge, dated, notify, formatLocalIsoDate } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createFarmerAvatarSvg } from '../core/graphics.js';
import { createPhotoUploader, openEvidenceViewer, openPhotoPreviewModal } from '../core/photo.js';
import { create14DayRhythmTrack } from '../core/rhythm.js';
import { AUDIT_STANDARD_LABELS } from './admin.js';
import { pushLineNotification } from './line-oa.js';

export function createVoiceInput(textarea) {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    return el('div', { className: 'voice-mic-bar hide' });
  }

  const voiceBtn = el('button', {
    type: 'button',
    className: 'voice-btn',
    title: 'กดเพื่อพูดภาษาไทย'
  }, icon('mic', 14), ' บันทึกด้วยเสียง');

  let recognition = null;
  try {
    recognition = new SpeechRec();
    recognition.lang = 'th-TH';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      voiceBtn.classList.add('recording');
      voiceBtn.textContent = 'กำลังรับฟังเสียง...';
    };

    recognition.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript || '';
      if (transcript) {
        textarea.value = (textarea.value ? textarea.value + ' ' : '') + transcript;
        notify(`แปลงเสียงสำเร็จ: "${transcript}"`);
      }
    };

    recognition.onerror = () => {
      voiceBtn.classList.remove('recording');
      voiceBtn.replaceChildren(icon('mic', 14), document.createTextNode(' บันทึกด้วยเสียง'));
      notify('อุปกรณ์นี้ยังใช้การพิมพ์ด้วยเสียงไม่ได้ กรุณาพิมพ์แทน');
    };

    recognition.onend = () => {
      voiceBtn.classList.remove('recording');
      voiceBtn.replaceChildren(icon('mic', 14), document.createTextNode(' บันทึกด้วยเสียง'));
    };
  } catch {
    return el('div', { className: 'voice-mic-bar hide' });
  }

  voiceBtn.onclick = () => {
    if (recognition) {
      try {
        recognition.start();
      } catch {
        notify('อุปกรณ์นี้ยังใช้การพิมพ์ด้วยเสียงไม่ได้ กรุณาพิมพ์แทน');
      }
    } else {
      notify('อุปกรณ์นี้ยังใช้การพิมพ์ด้วยเสียงไม่ได้ กรุณาพิมพ์แทน');
    }
  };

  return el('div', { className: 'voice-mic-bar' }, voiceBtn);
}

function sortApprovalsNewest(list = []) {
  return [...list].sort((a, b) => {
    const idDiff = Number(b.id || 0) - Number(a.id || 0);
    if (idDiff !== 0) return idDiff;
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
}

function getLatestApproval(list = []) {
  return sortApprovalsNewest(list)[0] || null;
}

export function buildFarmerHomeView({ me = null, plots = [], activities = [], approvals = [], lots = [], pendingCount = 0, navigateTab }) {
  const myPlot = plots[0] || null;
  const sortedActs = [...activities].sort((a, b) => String(b.activity_date || '').localeCompare(String(a.activity_date || '')));
  const latestAct = sortedActs[0] || null;

  let daysSince = null;
  if (latestAct?.activity_date) {
    const actTime = new Date(latestAct.activity_date).getTime();
    if (!Number.isNaN(actTime)) {
      daysSince = Math.max(0, Math.floor((Date.now() - actTime) / 86_400_000));
    }
  }

  const isOverdue = plots.length > 0 && (daysSince === null || daysSince > 14);
  const isWarning = plots.length > 0 && !isOverdue && daysSince >= 7;

  const rejectedApprovals = approvals.filter(a => a.status === 'rejected');
  const pendingApprovals = approvals.filter(a => a.status === 'pending');
  const effectivePending = pendingApprovals.length || pendingCount;
  const featuredApproval = getLatestApproval(approvals);

  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'สวัสดีตอนเช้า' : (hour < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น');
  const farmerDisplayName = me?.thai_name || me?.name || 'เกษตรกร';
  const heroIdentityMeta = plots.length > 0
    ? `เกษตรกร • ${plots.length} แปลงปลูก`
    : 'เกษตรกร • ยังไม่มีแปลงปลูก';

  // 1. User Greeting & Identity (deep forest green banking-app hero banner)
  const greetingActions = el('div', { className: 'farmer-greeting-actions' },
    el('button', {
      type: 'button',
      className: 'farmer-line-btn',
      'aria-label': 'แชท LINE OA ถามสถานะด่วน',
      onclick: () => {
        const lineBtn = document.getElementById('lineOaBtn');
        if (lineBtn) lineBtn.click();
      }
    }, '💬 LINE OA'),
    el('button', {
      type: 'button',
      className: 'farmer-bell-btn',
      'aria-label': 'การแจ้งเตือน LINE',
      onclick: () => {
        const bellBtn = document.getElementById('notifBellBtn');
        if (bellBtn) bellBtn.click();
      }
    }, icon('bell', 18))
  );

  const greetingSection = el('section', {
    className: 'farmer-home-greeting farmer-home-hero-banner',
    'aria-label': 'ข้อมูลเกษตรกร'
  },
    el('div', { className: 'farmer-greeting-avatar' }, createFarmerAvatarSvg(50)),
    el('div', { className: 'farmer-greeting-body' },
      el('span', { className: 'farmer-greeting-time' }, timeGreeting),
      el('h2', { className: 'farmer-greeting-name' }, farmerDisplayName),
      el('p', { className: 'farmer-greeting-meta' }, heroIdentityMeta)
    ),
    greetingActions
  );

  // 2. One Recommended Primary Task Card
  let statusTier = 'normal';
  let statusBadgeText = 'พร้อมบันทึก';
  let taskTitle = 'บันทึกกิจกรรมแปลงวันนี้';
  let taskDesc = 'ช่วยให้ประวัติการดูแลแปลงครบถ้วน';

  if (plots.length === 0) {
    statusTier = 'warn';
    statusBadgeText = 'ยังไม่มีแปลง';
    taskTitle = 'เพิ่มแปลงปลูกแรกของคุณ';
    taskDesc = 'สร้างข้อมูลแปลงก่อนเริ่มบันทึกกิจกรรม';
  } else if (isOverdue) {
    statusTier = 'risk';
    statusBadgeText = daysSince !== null ? `ขาดบันทึก ${daysSince} วัน` : 'ยังไม่เคยบันทึก';
    taskTitle = 'บันทึกกิจกรรมแปลงด่วน';
    taskDesc = daysSince !== null
      ? `${myPlot.name} • บันทึกล่าสุด ${daysSince} วันก่อน`
      : 'ยังไม่มีบันทึกในรอบ 14 วัน';
  } else if (isWarning) {
    statusTier = 'warn';
    statusBadgeText = `ล่าสุด ${daysSince} วันก่อน`;
    taskTitle = 'บันทึกกิจกรรมประจำรอบ';
    taskDesc = `${myPlot.name} • ใกล้ครบกำหนด 14 วัน`;
  } else {
    statusTier = 'normal';
    statusBadgeText = daysSince === 0 ? 'บันทึกแล้ววันนี้' : `ล่าสุด ${daysSince} วันก่อน`;
    taskTitle = daysSince === 0 ? 'บันทึกกิจกรรมต่อเนื่องแล้ว' : 'บันทึกกิจกรรมแปลงวันนี้';
    taskDesc = 'ช่วยให้ประวัติการดูแลแปลงครบถ้วน';
  }

  const primaryTaskCard = el('section', {
    className: `farmer-primary-task-card tier-${statusTier}`,
    'aria-label': 'งานสำคัญวันนี้'
  },
    el('div', { className: 'farmer-task-top' },
      el('span', { className: 'farmer-task-eyebrow' }, 'สิ่งที่ต้องทำวันนี้'),
      statusBadge(statusTier, statusBadgeText)
    ),
    el('h3', { className: 'farmer-task-title' }, taskTitle),
    el('p', { className: 'farmer-task-desc' }, taskDesc),
    el('button', {
      type: 'button',
      id: 'farmerPrimaryRecordBtn',
      className: 'farmer-primary-cta',
      onclick: () => navigateTab(plots.length === 0 ? 'plots' : 'record')
    },
      icon(plots.length === 0 ? 'plus' : 'sprout', 20),
      el('span', {}, plots.length === 0 ? 'เพิ่มแปลงปลูกแรก' : 'บันทึกกิจกรรมวันนี้')
    )
  );

  // 3. Four Main Service Shortcuts in a clean 2x2 grid
  const shortcutItems = [
    { tabId: 'plots', label: 'แปลงปลูก', iconName: 'sprout' },
    { tabId: 'approval', label: 'ขอใช้ปัจจัย', iconName: 'clipboard' },
    { tabId: 'reviews', label: 'ผลการตรวจ', iconName: 'shield' },
    { tabId: 'lots', label: 'ล็อตผลผลิต', iconName: 'package' }
  ];

  const shortcutsSection = el('section', { className: 'farmer-shortcuts-section', 'aria-label': 'บริการของฉัน' },
    el('h3', { className: 'farmer-section-heading' }, 'บริการของฉัน'),
    el('div', { className: 'farmer-shortcuts-grid' },
      ...shortcutItems.map(item => el('button', {
        type: 'button',
        className: 'farmer-shortcut-btn',
        onclick: () => navigateTab(item.tabId)
      },
        el('div', { className: 'farmer-shortcut-icon' }, icon(item.iconName, 20)),
        el('span', { className: 'farmer-shortcut-label' }, item.label)
      ))
    )
  );

  // 4. One Compact Important Status Banner (no 14-day track on Home)
  let bannerTone = 'success';
  let bannerIcon = 'checkCircle';
  let bannerTitle = 'สถานะแปลงและคำขอเรียบร้อยดี';
  let bannerSub = lots.length > 0
    ? `มีล็อตผลผลิต ${lots.length} ล็อต • แตะเพื่อจัดการคำขอ`
    : 'พร้อมบันทึกกิจกรรมหรือสร้างล็อตผลผลิต';
  let bannerTarget = 'approval';

  if (featuredApproval?.status === 'rejected') {
    bannerTone = 'danger';
    bannerIcon = 'xCircle';
    bannerTitle = `คำขอใช้ปัจจัยไม่ผ่าน ${rejectedApprovals.length} รายการ`;
    bannerSub = `${featuredApproval.input_name || 'แผนปัจจัยการผลิต'} • แตะดูเหตุผลและส่งคำขอใหม่`;
    bannerTarget = 'approval';
  } else if (featuredApproval?.status === 'approved') {
    bannerTone = 'success';
    bannerIcon = 'checkCircle';
    bannerTitle = 'คำขอใช้ปัจจัยผ่านการอนุมัติแล้ว';
    bannerSub = `${featuredApproval.input_name || 'แผนปัจจัยการผลิต'} • พร้อมใช้งานในแปลง`;
    bannerTarget = 'approval';
  } else if (featuredApproval?.status === 'pending' || effectivePending > 0) {
    bannerTone = 'warn';
    bannerIcon = 'clock';
    bannerTitle = `มีคำขอรอพิจารณา ${effectivePending || 1} รายการ`;
    bannerSub = featuredApproval?.input_name
      ? `${featuredApproval.input_name} • ติดตามสถานะคำขอของคุณได้ที่นี่`
      : 'ติดตามสถานะคำขอของคุณได้ที่นี่';
    bannerTarget = 'approval';
  } else if (isOverdue) {
    bannerTone = 'warn';
    bannerIcon = 'clock';
    bannerTitle = 'ครบกำหนดบันทึกกิจกรรมแปลง';
    bannerSub = daysSince !== null
      ? `ขาดบันทึกมาแล้ว ${daysSince} วัน แตะเพื่อบันทึก`
      : 'ยังไม่มีประวัติบันทึกในรอบ 14 วัน';
    bannerTarget = 'record';
  } else if (plots.length === 0) {
    bannerTone = 'warn';
    bannerIcon = 'mapPin';
    bannerTitle = 'ยังไม่ได้ลงทะเบียนแปลงปลูก';
    bannerSub = 'แตะเพื่อเพิ่มแปลงปลูกแรกของคุณ';
    bannerTarget = 'plots';
  }

  const statusBanner = el('button', {
    type: 'button',
    className: `farmer-status-banner farmer-status-summary-card tone-${bannerTone}`,
    'aria-label': 'สถานะสำคัญ',
    onclick: () => navigateTab(bannerTarget)
  },
    el('div', { className: `farmer-status-icon tone-${bannerTone}` }, icon(bannerIcon, 19)),
    el('div', { className: 'farmer-status-texts' },
      el('strong', {}, bannerTitle),
      el('span', {}, bannerSub)
    ),
    icon('chevronRight', 18)
  );

  return [
    greetingSection,
    primaryTaskCard,
    shortcutsSection,
    statusBanner
  ];
}

export function buildFarmerActivityWizard({ plots = [], plotSelect, reloadTab, navigateTab }) {
  if (!plots.length) {
    return empty('กรุณาเพิ่มแปลงปลูกก่อน จึงจะสามารถบันทึกกิจกรรมได้', 'ไปหน้าแปลงปลูก', () => navigateTab('plots'));
  }

  const todayIso = formatLocalIsoDate(new Date());
  const plotSel = typeof plotSelect === 'function'
    ? plotSelect()
    : selectField('plot_id', 'แปลงปลูก', plots.map(p => ({ value: p.id, label: `${p.name} — ${p.crop}` })));
  const kindInput = el('input', { name: 'kind', type: 'hidden', value: 'ปลูก' });
  const dateField = inputField('activity_date', 'วันที่ทำกิจกรรม', 'date', true, todayIso);
  const inputUsedField = el('input', { name: 'input_used', type: 'text', maxlength: 120, placeholder: 'เช่น ปุ๋ยหมักอินทรีย์, แหนแดง (ถ้ามี)' });
  const amountField = el('input', { name: 'amount_qty', type: 'text', maxlength: 60, placeholder: 'เช่น 20 กก., 5 ลิตร (ถ้ามี)' });
  const detailsArea = el('textarea', { name: 'details', required: true, placeholder: 'ระบุสิ่งที่ทำในแปลงหรือสิ่งที่สังเกตเห็น' });
  const detailsError = el('small', { className: 'field-error hide' }, 'กรุณาระบุรายละเอียดกิจกรรมอย่างน้อยสั้น ๆ เพื่อให้ตรวจสอบย้อนกลับได้');
  const photoInput = el('input', { name: 'photo_url', type: 'url', placeholder: 'https://...' });
  const evidenceIdInput = el('input', { name: 'evidence_id', type: 'hidden', value: '' });

  const kindCategories = [
    { kind: 'ปลูก', label: 'ปลูกพืช', iconName: 'sprout' },
    { kind: 'ให้น้ำ', label: 'ให้น้ำ', iconName: 'twoLeaves' },
    { kind: 'ใส่ปุ๋ย', label: 'ใส่ปุ๋ย', iconName: 'fertilizerBag' },
    { kind: 'กำจัดวัชพืช', label: 'ดูแล / กำจัดวัชพืช', iconName: 'shield' },
    { kind: 'เก็บเกี่ยว', label: 'เก็บเกี่ยว', iconName: 'package' },
    { kind: 'อื่นๆ', label: 'อื่นๆ', iconName: 'moreHorizontal' }
  ];

  const kindChoiceGrid = el('div', { className: 'activity-kind-choice-grid' },
    ...kindCategories.map(cat => {
      const isInitial = cat.kind === 'ปลูก';
      const cardBtn = el('button', {
        type: 'button',
        className: `kind-choice-card ${isInitial ? 'selected' : ''}`,
        onclick: () => {
          kindInput.value = cat.kind;
          kindChoiceGrid.querySelectorAll('.kind-choice-card').forEach(c => c.classList.remove('selected'));
          cardBtn.classList.add('selected');
        }
      },
        icon(cat.iconName, 22),
        el('span', { className: 'kind-choice-label' }, cat.label)
      );
      return cardBtn;
    })
  );

  let wizardStep = 1;
  const stepTabs = [
    el('div', { className: 'wizard-step-pill active' }, '1. แปลงและประเภท'),
    el('div', { className: 'wizard-step-pill' }, '2. รายละเอียดและปริมาณ'),
    el('div', { className: 'wizard-step-pill' }, '3. ทบทวนแล้วบันทึก')
  ];
  const reviewBox = el('div', { className: 'wizard-review-box' });
  const submitBtn = el('button', { type: 'submit', id: 'recordSubmitBtn', className: 'approval-btn-primary' }, icon('checkCircle', 16), ' บันทึกกิจกรรม');

  const step1Panel = el('div', { className: 'wizard-panel' },
    plotSel,
    el('label', { className: 'form-section-heading mt-10 mb-6' }, 'ประเภทกิจกรรม *'),
    kindChoiceGrid,
    kindInput,
    dateField,
    el('div', { className: 'wizard-actions-row mt-14' },
      el('button', {
        type: 'button',
        id: 'wizardNext1Btn',
        className: 'approval-btn-primary',
        onclick: () => setWizardStep(2)
      }, 'ถัดไป: ระบุรายละเอียด')
    )
  );

  const step2Panel = el('div', { className: 'wizard-panel hide' },
    el('label', {}, 'ปัจจัยที่ใช้ (ถ้ามี)', inputUsedField),
    el('label', {}, 'ปริมาณและหน่วย (ถ้ามี)', amountField),
    el('label', {},
      'รายละเอียดกิจกรรม *',
      detailsArea,
      detailsError,
      createVoiceInput(detailsArea)
    ),
    el('label', {},
      'ภาพหลักฐาน / ลิงก์รูปภาพ (ถ้ามี)',
      photoInput,
      evidenceIdInput,
      createPhotoUploader(photoInput, {
        entityType: 'activity',
        getPlotId: () => plotSel.querySelector('select[name="plot_id"]')?.value,
        evidenceIdInput,
      })
    ),
    el('div', { className: 'wizard-actions-split mt-12' },
      el('button', { type: 'button', className: 'secondary wizard-back-btn', onclick: () => setWizardStep(1) }, 'ย้อนกลับ'),
      el('button', {
        type: 'button',
        id: 'wizardNext2Btn',
        className: 'approval-btn-primary',
        onclick: () => {
          if (!detailsArea.value.trim()) {
            detailsError.classList.remove('hide');
            detailsArea.focus();
            return;
          }
          detailsError.classList.add('hide');
          setWizardStep(3);
        }
      }, 'ถัดไป: ทบทวนข้อมูล')
    )
  );

  const step3Panel = el('div', { className: 'wizard-panel hide' },
    reviewBox,
    el('div', { className: 'wizard-actions-split mt-12' },
      el('button', { type: 'button', className: 'secondary wizard-back-btn', onclick: () => setWizardStep(2) }, 'แก้ไขข้อมูล'),
      submitBtn
    )
  );

  const renderReviewBox = () => {
    const plotSelectEl = plotSel.querySelector('select[name="plot_id"]');
    const dateInputEl = dateField.querySelector('input[name="activity_date"]');
    const plotLabel = plotSelectEl?.selectedOptions?.[0]?.textContent || '-';
    const inputText = [inputUsedField.value.trim(), amountField.value.trim()].filter(Boolean).join(' • ');
    const attachedPhoto = photoInput.dataset.uploadedDataUrl || photoInput.value.trim();
    reviewBox.replaceChildren(
      el('div', { className: 'passport-row' }, el('b', {}, 'แปลงปลูก:'), el('span', {}, plotLabel)),
      el('div', { className: 'passport-row' }, el('b', {}, 'ประเภทกิจกรรม:'), el('span', {}, kindInput.value || '-')),
      el('div', { className: 'passport-row' }, el('b', {}, 'วันที่ทำกิจกรรม:'), el('span', {}, dateInputEl?.value || '-')),
      inputText ? el('div', { className: 'passport-row' }, el('b', {}, 'ปัจจัยและปริมาณ:'), el('span', {}, inputText)) : null,
      el('div', { className: 'passport-row' }, el('b', {}, 'รายละเอียด:'), el('span', {}, detailsArea.value.trim() || '-')),
      evidenceIdInput.value
        ? el('div', { className: 'passport-row' }, el('b', {}, 'ภาพหลักฐาน:'), el('span', { className: 'pill success' }, `อัปโหลดแล้ว (#${evidenceIdInput.value})`))
        : (attachedPhoto.startsWith('data:')
          ? el('div', { className: 'passport-row' },
            el('b', {}, 'ภาพถ่ายแนบ:'),
            el('img', {
              src: attachedPhoto,
              className: 'activity-photo-thumb',
              alt: 'ตัวอย่างภาพถ่ายที่แนบ',
              onclick: () => openPhotoPreviewModal(attachedPhoto, 'ตัวอย่างภาพถ่ายที่แนบ')
            })
          )
          : null)
    );
  };

  const setWizardStep = (nextStep) => {
    wizardStep = nextStep;
    stepTabs.forEach((pill, idx) => {
      pill.classList.toggle('active', idx + 1 === wizardStep);
      pill.classList.toggle('done', idx + 1 < wizardStep);
    });
    step1Panel.classList.toggle('hide', wizardStep !== 1);
    step2Panel.classList.toggle('hide', wizardStep !== 2);
    step3Panel.classList.toggle('hide', wizardStep !== 3);
    if (wizardStep === 3) renderReviewBox();
  };

  const recordForm = el('form', { id: 'recordForm', className: 'card approval-form-card', novalidate: true },
    el('h3', { className: 'approval-form-title' }, icon('calendar', 18), ' บันทึกกิจกรรมแปลง'),
    el('div', { className: 'wizard-steps' }, ...stepTabs),
    step1Panel,
    step2Panel,
    step3Panel
  );

  recordForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitBtn.disabled) return;
    const formData = new FormData(recordForm);
    const rawDetails = String(formData.get('details') || '').trim();
    const used = String(formData.get('input_used') || '').trim();
    const qty = String(formData.get('amount_qty') || '').trim();
    const prefix = [used ? `ปัจจัย: ${used}` : '', qty ? `ปริมาณ: ${qty}` : ''].filter(Boolean).join(' | ');
    const finalDetails = prefix ? `${prefix} — ${rawDetails}` : rawDetails;
    const resolvedPhotoUrl = photoInput.dataset.uploadedDataUrl || String(formData.get('photo_url') || '').trim();

    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังบันทึก...';
    try {
      await api('/activities', 'POST', {
        plot_id: formData.get('plot_id'),
        kind: formData.get('kind'),
        activity_date: formData.get('activity_date'),
        details: finalDetails,
        photo_url: resolvedPhotoUrl,
        evidence_id: formData.get('evidence_id') || ''
      });
      notify('บันทึกกิจกรรมสำเร็จ');
      if (typeof reloadTab === 'function') await reloadTab();
    } catch (error) {
      if (!error.handled) notify(error.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.replaceChildren(icon('checkCircle', 16), document.createTextNode(' บันทึกกิจกรรม'));
    }
  });

  return recordForm;
}

export function buildFarmerActivityHistorySection({ plots = [], activities = [], navigateTab }) {
  const nodes = [];

  const rhythmContent = plots.length === 0
    ? empty('ยังไม่มีแปลงปลูกในระบบ', 'เพิ่มแปลงปลูกแรกของคุณ', () => navigateTab('plots'))
    : plots.length === 1
      ? create14DayRhythmTrack(plots[0].id, activities, { compact: true })
      : el('div', { className: 'farmer-rhythm-list' },
        ...plots.map(p => create14DayRhythmTrack(p.id, activities, { compact: true }))
      );

  nodes.push(
    el('section', { className: 'card activity-rhythm-card', 'aria-label': 'ความต่อเนื่อง 14 วันล่าสุด' },
      el('div', { className: 'farmer-continuity-header' },
        el('span', {}, 'ความต่อเนื่องการบันทึก (14 วันล่าสุด)'),
        plots.length === 1 ? el('small', { className: 'muted' }, plots[0].name) : null
      ),
      rhythmContent
    )
  );

  nodes.push(el('h3', { className: 'farmer-section-heading mt-10' }, `ประวัติกิจกรรม (${activities.length})`));

  if (!activities.length) {
    nodes.push(empty('ยังไม่มีการบันทึกกิจกรรม'));
    return nodes;
  }

  for (const item of activities) {
    const box = card(
      el('div', { className: 'row between' },
        el('b', {}, item.kind),
        el('span', { className: 'pill' }, icon('calendar', 11), ' ', item.activity_date)
      ),
      el('p', { className: 'farmer-card-meta' }, item.plot_name || '-'),
      el('p', { className: 'farmer-card-body' }, item.details)
    );
    box.classList.add('farmer-list-card');

    if (item.evidence_id) {
      box.append(el('button', {
        type: 'button',
        className: 'link-btn',
        onclick: () => openEvidenceViewer(item.evidence_id)
      }, icon('camera', 13), ' ดูภาพหลักฐานที่อัปโหลด'));
    }

    if (item.photo_url) {
      const appendDataThumb = () => {
        box.append(
          el('div', { className: 'activity-photo-row mt-8' },
            el('img', {
              src: item.photo_url,
              className: 'activity-photo-thumb',
              alt: `ภาพกิจกรรม ${item.kind || ''}`.trim(),
              onclick: () => openPhotoPreviewModal(item.photo_url, `${item.kind || 'กิจกรรม'} • ${item.plot_name || ''}`.trim())
            }),
            el('button', {
              type: 'button',
              className: 'link-btn',
              onclick: () => openPhotoPreviewModal(item.photo_url, `${item.kind || 'กิจกรรม'} • ${item.plot_name || ''}`.trim())
            }, icon('camera', 13), ' ดูภาพตัวอย่าง (ในเครื่อง Demo)')
          )
        );
      };

      try {
        const parsed = new URL(item.photo_url);
        if (parsed.protocol === 'https:') {
          box.append(el('a', { href: item.photo_url, target: '_blank', rel: 'noopener noreferrer', className: 'link-btn' }, icon('camera', 13), ' ดูลิงก์ภาพภายนอก'));
        } else if (item.photo_url.startsWith('data:')) {
          appendDataThumb();
        }
      } catch {
        if (item.photo_url.startsWith('data:')) appendDataThumb();
      }
    }

    nodes.push(box);
  }

  return nodes;
}

export function buildFarmerPlotsView({ plots = [], reloadTab, navigateTab }) {
  const root = el('div', { className: 'farmer-screen-root' });
  let mode = 'list';
  let editingPlot = null;
  let queryText = '';

  const buildPlotCard = (plot) => {
    const conversionYear = plot.conversion_year || '';
    const box = el('div', { className: 'card farmer-list-card' },
      el('div', { className: 'row between' },
        el('b', { className: 'farmer-card-title' }, `${plot.plot_code ? `[${plot.plot_code}] ` : ''}${plot.name}`),
        el('span', { className: 'pill success' }, icon('leaf', 11), ' ', plot.crop)
      ),
      conversionYear ? el('div', { className: 'plot-badges-row' },
        el('span', { className: 'pill' }, `ระยะปรับเปลี่ยน: ${conversionYear}`)
      ) : null,
      el('p', { className: 'farmer-card-meta' }, `ขนาดพื้นที่: ${plot.area || 'ไม่ระบุ'} • สร้างเมื่อ ${dated(plot.created_at)}`),
      el('div', { className: 'farmer-card-actions' },
        el('button', {
          type: 'button',
          className: 'secondary btn-sm',
          onclick: () => { editingPlot = plot; mode = 'edit'; render(); }
        }, icon('edit', 14), ' แก้ไข'),
        el('button', {
          type: 'button',
          className: 'secondary btn-sm',
          onclick: () => navigateTab?.('record')
        }, icon('calendar', 14), ' บันทึกกิจกรรม')
      )
    );
    return box;
  };

  const renderFormMode = (isEdit) => {
    const backBtn = el('button', {
      type: 'button',
      id: isEdit ? 'cancelEditPlotBtn' : 'cancelAddPlotBtn',
      className: 'screen-inline-back',
      onclick: () => { mode = 'list'; editingPlot = null; render(); }
    }, icon('chevronLeft', 16), ' กลับรายการแปลง');

    const submitBtn = el('button', { type: 'submit', className: 'approval-btn-primary' },
      icon('checkCircle', 17), isEdit ? 'บันทึกการแก้ไข' : 'บันทึกแปลงปลูก'
    );
    const cancelBtn = el('button', {
      type: 'button',
      className: 'approval-btn-secondary',
      onclick: () => { mode = 'list'; editingPlot = null; render(); }
    }, 'ยกเลิก');

    const form = el('form', {
      id: isEdit ? 'editPlotForm' : 'plotForm',
      className: 'approval-form-stack'
    },
      inputField('name', 'ชื่อแปลง (เช่น แปลง A-03 ข้าวหอมมะลิ 105)', 'text', true, isEdit ? editingPlot?.name || '' : ''),
      inputField('crop', 'พืชที่ปลูก (เช่น ข้าวหอมมะลิ 105, ถั่วเหลืองอินทรีย์)', 'text', true, isEdit ? editingPlot?.crop || '' : ''),
      inputField('area', 'ขนาดพื้นที่ / รายละเอียด (เช่น 2 ไร่, แปลงโซน A)', 'text', false, isEdit ? editingPlot?.area || '' : ''),
      el('div', { className: 'approval-form-actions' }, submitBtn, cancelBtn)
    );

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (submitBtn.disabled) return;
      const values = Object.fromEntries(new FormData(form));
      submitBtn.disabled = true;
      submitBtn.textContent = 'กำลังบันทึก...';
      try {
        if (isEdit && editingPlot) {
          await api(`/plots/${editingPlot.id}`, 'PATCH', values);
          notify('แก้ไขแปลงสำเร็จ');
        } else {
          await api('/plots', 'POST', values);
          notify('เพิ่มแปลงปลูกสำเร็จ');
        }
        if (typeof reloadTab === 'function') await reloadTab();
      } catch (err) {
        if (!err.handled) notify(err.message);
      } finally {
        submitBtn.disabled = false;
      }
    });

    const formCard = el('section', { className: 'card approval-form-card' },
      el('h3', { className: 'approval-form-title' },
        icon(isEdit ? 'edit' : 'mapPin', 18),
        isEdit ? ` แก้ไขข้อมูล: ${editingPlot?.name || ''}` : ' เพิ่มแปลงปลูกใหม่'
      ),
      form
    );

    root.replaceChildren(backBtn, formCard);
  };

  const renderListMode = () => {
    const viewChildren = [
      el('div', { className: 'farmer-screen-header-row' },
        el('h3', { className: 'farmer-screen-heading' }, `แปลงปลูกของฉัน (${plots.length})`),
        el('button', {
          type: 'button',
          id: 'openAddPlotBtn',
          className: 'farmer-add-pill-btn',
          onclick: () => { mode = 'add'; render(); }
        }, icon('plus', 15), ' เพิ่มแปลง')
      )
    ];

    if (!plots.length) {
      viewChildren.push(empty('ยังไม่มีแปลงปลูกในระบบ กดปุ่ม "+ เพิ่มแปลง" ด้านบนเพื่อสร้างแปลงแรก'));
      root.replaceChildren(...viewChildren);
      return;
    }

    const cardsList = el('div', { className: 'cards-list' }, ...plots.map(buildPlotCard));
    if (plots.length > 2) {
      const searchInput = el('input', {
        type: 'search',
        value: queryText,
        placeholder: 'ค้นหาชื่อแปลง หรือพืชที่ปลูก...',
        oninput: (e) => {
          queryText = e.target.value.trim().toLowerCase();
          const filtered = plots.filter(p =>
            !queryText ||
            String(p.name || '').toLowerCase().includes(queryText) ||
            String(p.crop || '').toLowerCase().includes(queryText) ||
            String(p.plot_code || '').toLowerCase().includes(queryText)
          );
          cardsList.replaceChildren(...(!filtered.length ? [empty('ไม่พบแปลงที่ตรงกับคำค้นหา')] : filtered.map(buildPlotCard)));
        }
      });
      viewChildren.push(el('div', { className: 'search-filter-box' }, icon('search', 15), searchInput));
    }

    viewChildren.push(cardsList);
    root.replaceChildren(...viewChildren);
  };

  const render = () => {
    if (mode === 'add') renderFormMode(false);
    else if (mode === 'edit') renderFormMode(true);
    else renderListMode();
  };

  render();
  return [root];
}

export function buildFarmerLotsView({ plots = [], rows = [], plotSelect, reloadTab, navigateTab, onOpenPassport }) {
  const root = el('div', { className: 'farmer-screen-root' });
  let mode = 'list';

  const renderListMode = () => {
    const viewChildren = [
      el('div', { className: 'farmer-screen-header-row' },
        el('h3', { className: 'farmer-screen-heading' }, `ล็อตผลผลิต (${rows.length})`),
        plots.length > 0 ? el('button', {
          type: 'button',
          id: 'openAddLotBtn',
          className: 'farmer-add-pill-btn',
          onclick: () => { mode = 'add'; render(); }
        }, icon('plus', 15), ' สร้างล็อตใหม่') : null
      )
    ];

    if (!plots.length && !rows.length) {
      viewChildren.push(empty('ยังไม่มีแปลงปลูก กรุณาเพิ่มแปลงปลูกก่อนสร้างล็อตผลผลิต', 'ไปหน้าแปลงปลูก', () => navigateTab?.('plots')));
      root.replaceChildren(...viewChildren);
      return;
    }

    if (!rows.length) {
      viewChildren.push(empty('ยังไม่มีล็อตผลผลิต กดปุ่ม "+ สร้างล็อตใหม่" ด้านบนเพื่อสร้างล็อต'));
      root.replaceChildren(...viewChildren);
      return;
    }

    for (const item of rows) {
      const lotStatusBadge = item.ics_review_status === 'approved'
        ? statusBadge('normal', 'ผ่านการตรวจ ICS (ตัวอย่าง)')
        : statusBadge('warn', 'รอเชื่อมผลตรวจ');

      const box = el('div', { className: 'card farmer-list-card' },
        el('div', { className: 'row between' },
          el('b', { className: 'lot-title-text farmer-card-title' }, `ล็อต ${item.code || item.lot_code}`),
          lotStatusBadge
        ),
        el('p', { className: 'farmer-card-body' }, `ชนิดผลผลิต: ${item.crop || '-'}`),
        el('p', { className: 'farmer-card-meta' }, `แปลง: ${item.linked_plots || item.plot_name || '-'}`),
        el('p', { className: 'farmer-card-meta' }, `ปริมาณ: ${item.total_bags_or_kg || `${item.quantity} กก.`} • เก็บเกี่ยว: ${dated(item.harvest_date)}`),
        el('div', { className: 'mt-10' },
          el('button', {
            type: 'button',
            className: 'approval-btn-secondary passport-trigger-btn',
            onclick: () => onOpenPassport?.(item)
          }, icon('fileText', 15), ' เปิดดูใบรับรองข้อมูลย้อนกลับ')
        )
      );
      viewChildren.push(box);
    }

    root.replaceChildren(...viewChildren);
  };

  const renderAddMode = () => {
    const backBtn = el('button', {
      type: 'button',
      id: 'cancelAddLotBtn',
      className: 'screen-inline-back',
      onclick: () => { mode = 'list'; render(); }
    }, icon('chevronLeft', 16), ' กลับรายการล็อต');

    const submitBtn = el('button', { type: 'submit', className: 'approval-btn-primary' },
      icon('checkCircle', 17), 'บันทึกล็อตผลผลิต'
    );
    const cancelBtn = el('button', {
      type: 'button',
      className: 'approval-btn-secondary',
      onclick: () => { mode = 'list'; render(); }
    }, 'ยกเลิก');

    const plotSel = typeof plotSelect === 'function'
      ? plotSelect()
      : selectField('plot_id', 'แปลงปลูก', plots.map(p => ({ value: p.id, label: `${p.name} — ${p.crop}` })));
    const todayIso = formatLocalIsoDate(new Date());

    const lotForm = el('form', { id: 'lotForm', className: 'approval-form-stack' },
      plotSel,
      inputField('code', 'รหัสล็อต (เช่น L-12, LOT-2026-001)'),
      inputField('crop', 'ชนิดผลผลิต (เช่น ข้าวหอมมะลิ 105, ถั่วเหลืองอินทรีย์)'),
      inputField('harvest_date', 'วันที่เก็บเกี่ยว', 'date', true, todayIso),
      inputField('quantity', 'ปริมาณผลผลิต (กิโลกรัม)', 'number'),
      el('div', { className: 'approval-form-actions' }, submitBtn, cancelBtn)
    );

    lotForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (submitBtn.disabled) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'กำลังบันทึก...';
      try {
        await api('/lots', 'POST', Object.fromEntries(new FormData(lotForm)));
        notify('สร้างล็อตผลผลิตสำเร็จ');
        if (typeof reloadTab === 'function') await reloadTab();
      } catch (err) {
        if (!err.handled) notify(err.message);
      } finally {
        submitBtn.disabled = false;
      }
    });

    root.replaceChildren(
      backBtn,
      el('section', { className: 'card approval-form-card' },
        el('h3', { className: 'approval-form-title' }, icon('package', 18), ' สร้างล็อตผลผลิตใหม่'),
        lotForm
      )
    );
  };

  const render = () => {
    if (mode === 'add') renderAddMode();
    else renderListMode();
  };

  render();
  return [root];
}

export function openContactIcsDialog(me = null) {
  const previousFocus = document.activeElement;
  const overlay = el('div', {
    className: 'passport-overlay',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'ติดต่อเจ้าหน้าที่ ICS'
  });
  const closeDialog = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKeyDown);
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
  };
  const onKeyDown = (e) => { if (e.key === 'Escape') closeDialog(); };
  document.addEventListener('keydown', onKeyDown);

  const closeBtn = el('button', { type: 'button', className: 'passport-close-btn', onclick: closeDialog }, 'ปิดหน้าต่าง');
  const lineShareBtn = el('button', {
    type: 'button',
    className: 'btn-send-review',
    onclick: () => {
      const text = `[ขอคำปรึกษาปรับปรุงสูตรปุ๋ย/ปัจจัยการผลิต]\nเกษตรกร: ${me?.name || '-'} (${me?.agency_code || '-'})\nต้องการสอบถามคำแนะนำการปรับสูตรปุ๋ยให้สอดคล้องกับมาตรฐานกลุ่มวิสาหกิจชุมชนผักไหม`;
      window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    }
  }, icon('message', 16), ' ส่งข้อความปรึกษาเจ้าหน้าที่ผ่าน LINE');

  const cardNode = el('div', { className: 'passport-card' },
    el('div', { className: 'passport-header' },
      el('span', { className: 'pill success' }, icon('headset', 13), ' ศูนย์ให้คำปรึกษาเกษตรกร (ICS Support)'),
      el('h3', { className: 'passport-title mt-8' }, 'ติดต่อเจ้าหน้าที่ตรวจสอบแปลง (ICS)'),
      el('small', { className: 'passport-subtitle' }, 'วิสาหกิจชุมชนเกษตรอินทรีย์ตำบลผักไหม จ.ศรีสะเกษ')
    ),
    el('div', { className: 'passport-body' },
      el('div', { className: 'passport-row' }, el('b', {}, 'เจ้าหน้าที่ผู้ดูแล:'), el('span', {}, 'ฝ่ายควบคุมมาตรฐานภายใน (ICS Officer)')),
      el('div', { className: 'passport-row' }, el('b', {}, 'เวลาทำการกลุ่ม:'), el('span', {}, 'จันทร์ - เสาร์ (08:30 - 16:30 น.)')),
      el('div', { className: 'notice mt-12' },
        el('b', {}, 'คำแนะนำเบื้องต้นในการปรับสูตรปุ๋ย:'),
        el('p', { className: 'muted' }, '• ใช้วัตถุดิบอินทรีย์ในชุมชน เช่น มูลวัวนมอินทรีย์ แกลบดำ รำอ่อน และจุลินทรีย์หน่อกล้วย หมักครบ 30 วัน\n• ระบุอัตราการใช้ต่อไร่และระยะการเจริญเติบโตของข้าวให้ชัดเจนก่อนส่งพิจารณาใหม่')
      ),
      el('div', { className: 'mt-12' }, lineShareBtn),
      el('div', { className: 'passport-actions row between mt-12' }, closeBtn)
    )
  );
  overlay.append(cardNode);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDialog(); });
  document.body.append(overlay);
  closeBtn.focus();
}

export function buildFarmerApprovalView({ plots = [], rows = [], me = null, plotSelect, reloadTab, navigateTab }) {
  if (!plots.length) {
    return [empty('กรุณาเพิ่มแปลงปลูกก่อน จึงจะสามารถส่งคำขออนุมัติปัจจัยการผลิตได้', 'ไปหน้าแปลงปลูก', () => navigateTab('plots'))];
  }

  const root = el('div', { className: 'approval-screen-root' });
  let mode = 'status'; // 'status' | 'form'

  const renderFormView = () => {
    const plotSel = typeof plotSelect === 'function'
      ? plotSelect()
      : selectField('plot_id', 'แปลงปลูก', plots.map(p => ({ value: p.id, label: `${p.name} — ${p.crop}` })));
    const inputNameField = el('input', {
      name: 'input_name',
      type: 'text',
      required: true,
      placeholder: 'เช่น ปุ๋ยหมักอินทรีย์บำรุงดิน (สูตรปรับปรุง), น้ำหมักสมุนไพร'
    });
    const detailsField = el('textarea', {
      name: 'details',
      required: true,
      maxlength: 500,
      rows: 4,
      placeholder: 'ระบุส่วนผสม วิธีทำ และอัตราการใช้ต่อไร่...'
    });
    const charCounter = el('div', { className: 'voice-char-counter' }, '0 / 500');
    detailsField.addEventListener('input', () => {
      charCounter.textContent = `${detailsField.value.length} / 500`;
    });

    const openVoicePresetSelector = () => {
      const previousFocus = document.activeElement;
      const overlay = el('div', {
        className: 'voice-dialog-overlay',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'ระบบบันทึกเสียงพูดภาษาไทย'
      });

      const closeDialog = () => {
        overlay.remove();
        document.removeEventListener('keydown', onKeyDown);
        if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
      };
      const onKeyDown = (e) => {
        if (e.key === 'Escape') closeDialog();
      };
      document.addEventListener('keydown', onKeyDown);

      const applyText = (text) => {
        detailsField.value = text.slice(0, 500);
        charCounter.textContent = `${detailsField.value.length} / 500`;
        closeDialog();
        detailsField.focus();
        notify(`กรอกรายละเอียดจากเสียงสำเร็จ`);
      };

      const sampleChoices = [
        {
          author: 'สูตรน้ำหมักสมุนไพร (ใบสะเดา + พริก)',
          text: 'สูตรปรับปรุง: ใช้น้ำหมักชีวภาพสูตรใบสะเดาและพริกแกง เจือจาง 1 ต่อ 500 ฉีดพ่นขับไล่เพลี้ยช่วงเย็นสัปดาห์ละครั้ง'
        },
        {
          author: 'สูตรปุ๋ยหมักมูลวัวนม 30 วัน',
          text: 'สูตรปรับปรุง: ปุ๋ยหมักมูลวัวนมในฟาร์มอินทรีย์ผสมแกลบดำและรำละเอียด หมักกลับกองครบ 30 วัน อัตรา 40 กิโลกรัมต่อไร่'
        },
        {
          author: 'สูตรน้ำส้มควันไม้เจือจาง',
          text: 'สูตรปรับปรุง: ใช้น้ำส้มควันไม้เจือจาง 1 ต่อ 200 ฉีดพ่นทางใบช่วงเช้าตรู่ทุก 10 วัน'
        }
      ];

      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

      const modalCard = el('div', { className: 'voice-dialog-card' },
        el('div', { className: 'voice-dialog-header' },
          el('h4', { className: 'voice-dialog-title' }, icon('mic', 18), ' ระบบบันทึกด้วยเสียงภาษาไทย'),
          el('button', {
            type: 'button',
            className: 'voice-dialog-close-btn',
            'aria-label': 'ปิดหน้าต่าง',
            onclick: closeDialog
          }, icon('x', 16))
        ),
        el('p', { className: 'muted text-sm' }, 'เลือกสูตรตัวอย่างสำหรับสาธิต หรือแตะพูดสดผ่านไมค์:'),
        el('div', { className: 'voice-choices-list mt-12' },
          ...sampleChoices.map(sc => el('button', {
            type: 'button',
            className: 'voice-choice-btn',
            onclick: () => applyText(sc.text)
          },
            el('strong', { className: 'voice-choice-author' }, sc.author),
            el('span', { className: 'voice-choice-quote' }, `"${sc.text}"`)
          ))
        ),
        SpeechRec ? el('button', {
          type: 'button',
          className: 'btn-record-live mt-12',
          onclick: () => {
            closeDialog();
            try {
              const rec = new SpeechRec();
              rec.lang = 'th-TH';
              rec.continuous = false;
              rec.interimResults = false;
              notify('กำลังรับฟังเสียงพูดภาษาไทย...');
              rec.onresult = (e) => {
                const transcript = e.results[0]?.[0]?.transcript || '';
                if (transcript) {
                  detailsField.value = ((detailsField.value ? detailsField.value + ' ' : '') + transcript).slice(0, 500);
                  charCounter.textContent = `${detailsField.value.length} / 500`;
                  notify(`แปลงเสียงสำเร็จ: "${transcript}"`);
                }
              };
              rec.onerror = () => notify('ไม่สามารถรับเสียงได้ กรุณาพิมพ์ข้อความหรือเลือกสูตร');
              rec.start();
            } catch {
              notify('ไม่สามารถเปิดไมโครโฟนได้');
            }
          }
        }, icon('mic', 16), ' กดเพื่อพูดสดด้วยไมค์ภาษาไทย') : null
      );

      overlay.append(modalCard);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDialog(); });
      document.body.append(overlay);
    };

    const embeddedMicBtn = el('button', {
      type: 'button',
      className: 'embedded-mic-btn',
      title: 'พูดรายละเอียดสูตรปุ๋ยด้วยเสียง',
      'aria-label': 'พูดรายละเอียดสูตรปุ๋ยด้วยเสียง',
      onclick: openVoicePresetSelector
    }, icon('mic', 18));

    const presetFormulas = [
      {
        label: 'ปุ๋ยหมักมูลวัว + แกลบดำ (30 วัน)',
        name: 'ปุ๋ยหมักอินทรีย์บำรุงดิน (ทำเอง)',
        details: 'สูตร: มูลวัวในฟาร์มอินทรีย์ + แกลบดำ + รำอ่อน + จุลินทรีย์หน่อกล้วย หมักกลับกองครบ 30 วัน อัตรา 40 กก./ไร่'
      },
      {
        label: 'น้ำหมักสมุนไพรไล่แมลง (7 วัน)',
        name: 'น้ำหมักสมุนไพรไล่แมลง (ทำเอง)',
        details: 'สูตร: ใบสะเดา + พริก + กากน้ำตาล หมัก 7 วัน ใช้ป้องกันหนอนและเพลี้ยไฟ ตามเกณฑ์มาตรฐานเกษตรอินทรีย์ PGS'
      }
    ];

    const formulaBtns = el('div', { className: 'formula-presets-box' },
      el('small', { className: 'muted helper-label' }, 'เลือกสูตรมาตรฐานกลุ่ม (เติมข้อมูลอัตโนมัติ):'),
      ...presetFormulas.map(f =>
        el('button', {
          type: 'button',
          className: 'chip-btn chip-amber',
          onclick: () => {
            inputNameField.value = f.name;
            detailsField.value = f.details;
            charCounter.textContent = `${detailsField.value.length} / 500`;
            notify(`เลือกสูตร: ${f.name}`);
          }
        }, f.label)
      )
    );

    const submitApprovalBtn = el('button', {
      type: 'submit',
      className: 'approval-btn-primary'
    }, icon('send', 16), ' ส่งคำขอเพื่อพิจารณา');

    const cancelFormBtn = el('button', {
      type: 'button',
      className: 'approval-btn-secondary',
      onclick: () => {
        mode = 'status';
        render();
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    }, 'ยกเลิก');

    const approvalForm = el('form', { id: 'approvalForm', className: 'approval-form-stack', novalidate: true },
      formulaBtns,
      plotSel,
      el('label', {}, 'ชื่อปุ๋ย / ปัจจัยการผลิต', inputNameField),
      el('div', { className: 'voice-field-group' },
        el('label', {}, 'รายละเอียดสูตรและอัตราการใช้'),
        el('div', { className: 'voice-textarea-wrap' },
          detailsField,
          embeddedMicBtn
        ),
        charCounter
      ),
      el('div', { className: 'approval-form-actions' },
        submitApprovalBtn,
        cancelFormBtn
      )
    );

    approvalForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submitApprovalBtn.disabled) return;
      const plotIdVal = approvalForm.querySelector('select[name="plot_id"]')?.value;
      const nameVal = inputNameField.value.trim() || 'แผนการใส่ปุ๋ยอินทรีย์ (สูตรปรับปรุง)';
      const detailsVal = detailsField.value.trim();
      if (!detailsVal) {
        notify('กรุณาพิมพ์รายละเอียดสูตรปุ๋ย หรือแตะเลือกสูตรมาตรฐานด้านบน');
        detailsField.focus();
        return;
      }
      submitApprovalBtn.disabled = true;
      submitApprovalBtn.textContent = 'กำลังส่งพิจารณา...';
      try {
        await api('/approvals', 'POST', {
          plot_id: Number(plotIdVal),
          input_name: nameVal,
          details: detailsVal
        });
        notify('ส่งคำขอให้เจ้าหน้าที่ ICS พิจารณาเรียบร้อย');
        pushLineNotification({
          title: 'ส่งคำขอใช้ปัจจัยใหม่แล้ว 📋',
          body: `คำขอ "${nameVal}" ถูกส่งให้เจ้าหน้าที่ ICS ตรวจสอบแล้ว ระบบจะแจ้งเตือนเมื่อมีผลการพิจารณา`,
          type: 'pending',
          targetTab: 'approval',
          user: me
        });
        if (typeof reloadTab === 'function') await reloadTab();
      } catch (err) {
        if (!err.handled) notify(err.message);
      } finally {
        submitApprovalBtn.disabled = false;
        submitApprovalBtn.replaceChildren(icon('send', 16), document.createTextNode(' ส่งคำขอเพื่อพิจารณา'));
      }
    });

    const backToStatusBtn = el('button', {
      type: 'button',
      id: 'cancelNewApprovalBtn',
      className: 'screen-inline-back',
      onclick: () => {
        mode = 'status';
        render();
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    }, icon('chevronLeft', 16), ' กลับไปดูสถานะคำขอ');

    const formCard = el('div', { className: 'card approval-form-card' },
      el('h3', { className: 'approval-form-title' }, icon('fertilizerBag', 20), ' ส่งคำขอใช้ปัจจัยการผลิตใหม่'),
      approvalForm
    );

    root.replaceChildren(backToStatusBtn, formCard);
  };

  const renderStatusView = () => {
    const viewChildren = [];
    const sortedRows = sortApprovalsNewest(rows);
    const featured = sortedRows[0] || null;

    const openFormBtn = el('button', {
      type: 'button',
      id: 'openNewApprovalFormBtn',
      className: 'approval-btn-primary',
      onclick: () => {
        mode = 'form';
        render();
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    }, 'ส่งคำขอใหม่');

    const contactOfficerBtn = el('button', {
      type: 'button',
      id: 'approvalContactBtn',
      className: 'approval-btn-secondary',
      onclick: () => openContactIcsDialog(me)
    }, 'ติดต่อเจ้าหน้าที่');

    if (featured) {
      const isRejected = featured.status === 'rejected';
      const isApproved = featured.status === 'approved';
      const cardTone = isRejected ? 'rejected' : isApproved ? 'approved' : 'pending';
      const badgeLabel = isRejected ? 'ไม่ผ่านการอนุมัติ' : isApproved ? 'ผ่านการอนุมัติ' : 'รอการพิจารณา';
      const docIconName = isRejected ? 'xCircle' : isApproved ? 'checkCircle' : 'clock';
      const evalDateText = dated(featured.reviewed_at || featured.created_at);

      const reasonText = featured.comment || featured.details || '';
      const bulletItems = reasonText
        .split(/\r?\n|\|/)
        .map(s => s.trim())
        .filter(Boolean);

      const adviceTitle = isRejected
        ? 'คำแนะนำจากเจ้าหน้าที่'
        : isApproved
          ? 'พร้อมใช้งาน'
          : 'ขั้นตอนถัดไป';
      const adviceDesc = isRejected
        ? 'ปรับสูตรและปริมาณให้เหมาะสมก่อนส่งพิจารณาอีกครั้ง'
        : isApproved
          ? 'สามารถนำปัจจัยนี้ไปใช้ในแปลงและบันทึกกิจกรรมได้ทันที'
          : 'เจ้าหน้าที่จะตรวจสอบความสอดคล้องกับมาตรฐานอินทรีย์ก่อนใช้งานจริง';

      const statusCard = el('div', { className: `approval-hero-alert tone-${cardTone}` },
        el('div', { className: 'approval-status-top' },
          el('div', { className: `approval-doc-circle tone-${cardTone}` },
            icon(docIconName, 22)
          ),
          el('div', { className: 'approval-status-meta' },
            el('span', { className: `approval-status-pill tone-${cardTone}` }, badgeLabel),
            el('h3', { className: 'approval-main-title' }, featured.input_name || 'คำขอใช้ปัจจัยการผลิต'),
            el('p', { className: 'approval-date-sub' }, `${featured.plot_name || '-'} • ${evalDateText}`)
          )
        ),
        el('div', { className: 'approval-divider' }),
        el('div', { className: 'approval-reason-section' },
          el('b', { className: 'approval-reason-title' },
            isRejected
              ? 'เหตุผลที่ไม่อนุมัติ'
              : isApproved
                ? 'ความเห็นจากเจ้าหน้าที่ ICS'
                : 'รายละเอียดคำขอที่ส่งตรวจ'
          ),
          bulletItems.length > 1
            ? el('ul', { className: 'approval-reason-bullets' },
              ...bulletItems.map(line => el('li', {}, line))
            )
            : el('p', { className: 'approval-reason-text' },
              bulletItems[0] || 'รอเจ้าหน้าที่ ICS ตรวจสอบความสอดคล้องตามมาตรฐานอินทรีย์'
            )
        ),
        el('div', { className: 'approval-advice-box' },
          el('strong', { className: 'approval-advice-title' }, adviceTitle),
          el('p', { className: 'approval-advice-desc' }, adviceDesc)
        ),
        el('div', { className: 'approval-actions-stack' },
          openFormBtn,
          contactOfficerBtn
        )
      );

      viewChildren.push(statusCard);
    } else {
      const emptyStatusCard = el('div', { className: 'card approval-empty-card' },
        el('div', { className: 'approval-doc-circle tone-pending' }, icon('clipboard', 22)),
        el('h3', { className: 'approval-main-title mt-10' }, 'ยังไม่มีคำขอใช้ปัจจัยการผลิต'),
        el('p', { className: 'muted text-sm' }, 'ยื่นขออนุญาตใช้ปุ๋ยอินทรีย์หรือสารชีวภัณฑ์ก่อนนำไปใช้จริงในแปลง'),
        el('div', { className: 'approval-actions-stack mt-12' },
          openFormBtn,
          contactOfficerBtn
        )
      );
      viewChildren.push(emptyStatusCard);
    }

    if (sortedRows.length > 0) {
      const historyItems = sortedRows.map(item => {
        const isPending = item.status === 'pending';
        const isApproved = item.status === 'approved';
        const pillClass = isPending ? 'pill warn' : isApproved ? 'pill success' : 'pill danger';
        const statusLabel = isPending ? 'รอพิจารณา' : isApproved ? 'อนุมัติแล้ว' : 'ไม่ผ่านการอนุมัติ';
        return el('div', { className: 'card approval-history-card' },
          el('div', { className: 'row between align-center' },
            el('b', { className: 'approval-hist-title' }, item.input_name),
            el('span', { className: pillClass }, statusLabel)
          ),
          el('p', { className: 'muted text-xs mt-4' }, `${item.plot_name || '-'} • ${dated(item.reviewed_at || item.created_at)}`),
          item.details ? el('p', { className: 'text-sm mt-6' }, item.details) : null,
          item.comment ? el('p', { className: 'approval-hist-comment mt-6' }, `ความเห็นเจ้าหน้าที่: ${item.comment}`) : null
        );
      });

      viewChildren.push(
        el('section', { className: 'approval-history-section', 'aria-label': 'ประวัติคำขอทั้งหมด' },
          el('h4', { className: 'farmer-section-heading' }, `ประวัติคำขอทั้งหมด (${rows.length})`),
          el('div', { className: 'approval-history-list' }, ...historyItems)
        )
      );
    }

    root.replaceChildren(...viewChildren);
  };

  const render = () => {
    if (mode === 'form') renderFormView();
    else renderStatusView();
  };

  render();
  return [root];
}

export async function buildFarmerReviewsView() {
  const rows = await api('/reviews').catch(() => []);
  const nodes = [];

  if (!rows.length) {
    nodes.push(empty('ยังไม่มีผลการตรวจแปลงในระบบ ผลตรวจจะแสดงที่นี่เมื่อเจ้าหน้าที่ ICS บันทึกผลประเมินแล้ว'));
    return nodes;
  }

  nodes.push(el('h3', { className: 'farmer-screen-heading' }, `ผลการตรวจแปลง (${rows.length})`));

  for (const item of rows) {
    const isPass = item.result === 'ผ่าน';
    const isWarn = item.result === 'ต้องแก้ไข';
    const pillClass = isPass ? 'pill success' : isWarn ? 'pill warn' : 'pill danger';
    const statusIcon = isPass ? icon('checkCircle', 12) : isWarn ? icon('clock', 12) : icon('xCircle', 12);
    const stdLabel = item.standard_code ? (AUDIT_STANDARD_LABELS[item.standard_code] || item.standard_code) : null;

    const detailsChildren = [];
    if (stdLabel) {
      detailsChildren.push(el('span', { className: 'pill' }, stdLabel));
    }
    if (item.evidence_id) {
      detailsChildren.push(el('button', {
        type: 'button',
        className: 'link-btn',
        onclick: () => openEvidenceViewer(item.evidence_id)
      }, icon('camera', 13), ' ดูภาพหลักฐานจากการตรวจแปลง'));
    } else if (item.photo_url) {
      detailsChildren.push(
        el('div', { className: 'mt-8' },
          el('img', {
            src: item.photo_url,
            className: 'activity-photo-thumb',
            alt: 'ภาพหลักฐานการตรวจแปลง',
            onclick: () => openPhotoPreviewModal(item.photo_url, `ภาพหลักฐานการตรวจแปลง ${item.plot_name || ''}`.trim())
          })
        )
      );
    }

    const box = el('div', { className: 'card farmer-list-card' },
      el('div', { className: 'row between' },
        el('span', { className: pillClass }, statusIcon, ' ', item.result),
        el('small', { className: 'muted' }, dated(item.reviewed_at || item.created_at))
      ),
      el('b', { className: 'farmer-card-title mt-8' }, item.plot_name || '-'),
      el('p', { className: 'farmer-card-body' }, item.note || '-')
    );

    if (detailsChildren.length) {
      box.append(
        el('details', { className: 'review-details-toggle mt-8' },
          el('summary', {}, 'รายละเอียดเกณฑ์และภาพหลักฐาน'),
          el('div', { className: 'review-details-body' }, ...detailsChildren)
        )
      );
    }

    nodes.push(box);
  }

  return nodes;
}
