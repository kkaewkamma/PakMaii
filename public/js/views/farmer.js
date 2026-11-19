'use strict';

import { api } from '../core/api.js';
import { el, card, empty, inputField, selectField, statusBadge, dated, notify, formatLocalIsoDate } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createPhotoUploader, openEvidenceViewer } from '../core/photo.js';
import { create14DayRhythmTrack } from '../core/rhythm.js';
import { AUDIT_STANDARD_LABELS } from './admin.js';

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

export function buildFarmerHomeView({ plots = [], activities = [], lots = [], pendingCount = 0, navigateTab }) {
  const myPlot = plots[0];
  const sortedActs = [...activities].sort((a, b) => String(b.activity_date || '').localeCompare(String(a.activity_date || '')));
  const latestAct = sortedActs[0];
  let daysSince = null;
  if (latestAct?.activity_date) {
    const actTime = new Date(latestAct.activity_date).getTime();
    if (!Number.isNaN(actTime)) {
      daysSince = Math.max(0, Math.floor((Date.now() - actTime) / 86_400_000));
    }
  }

  const isOverdue = daysSince === null || daysSince > 14;
  const isWarning = !isOverdue && daysSince >= 7;
  const hasPendingApp = pendingCount > 0;

  let statusTier = 'normal';
  let statusBadgeText = daysSince !== null
    ? `บันทึกล่าสุด ${daysSince === 0 ? 'วันนี้' : `${daysSince} วันก่อน`}`
    : 'แปลงใหม่ รอเริ่มบันทึก';
  let statusTitle = myPlot ? `แปลง ${myPlot.name}` : 'ภาพรวมแปลงปลูก';
  let statusDesc = daysSince !== null
    ? `บันทึกกิจกรรมล่าสุดเมื่อ ${daysSince === 0 ? 'วันนี้' : `${daysSince} วันก่อน`} • งานถัดไป: ตรวจสอบและบันทึกกิจกรรมการดูแลแปลงรอบถัดไป`
    : 'ยังไม่มีประวัติกิจกรรม • งานถัดไป: แตะ "บันทึกกิจกรรมแปลง" เพื่อเริ่มต้นบันทึกข้อมูล';
  let alertAdvice = null;

  if (isOverdue) {
    statusTier = 'risk';
    statusBadgeText = `ขาดบันทึกเกิน 14 วัน (${daysSince !== null ? `${daysSince} วันก่อน` : 'ยังไม่มีประวัติ'})`;
    statusTitle = `แจ้งเตือน: แปลง ${myPlot?.name || ''} ขาดการบันทึกกิจกรรม`;
    statusDesc = `บันทึกกิจกรรมล่าสุดเกิน 14 วัน • งานถัดไป: แตะ "บันทึกกิจกรรมแปลงด่วน" เพื่ออัปเดตการทำงานในแปลง`;
    alertAdvice = 'คำแนะนำ: บันทึกกิจกรรมเพื่อรักษาความต่อเนื่องของข้อมูลและแจ้งความคืบหน้าให้เจ้าหน้าที่ ICS ทราบ';
  } else if (isWarning) {
    statusTier = 'warn';
    statusBadgeText = `บันทึกล่าสุด ${daysSince} วันก่อน`;
    statusTitle = `เตือนล่วงหน้า: แปลง ${myPlot?.name || ''} ใกล้ครบ 14 วัน`;
    statusDesc = `บันทึกกิจกรรมล่าสุด ${daysSince} วันก่อน • งานถัดไป: บันทึกกิจกรรมการดูแลแปลงก่อนครบกำหนด 14 วัน`;
    alertAdvice = 'คำแนะนำ: บันทึกกิจกรรมการให้น้ำ ใส่ปุ๋ย หรือตรวจแปลงเพื่ออัปเดตข้อมูล';
  } else if (hasPendingApp) {
    statusTier = 'warn';
    statusBadgeText = `รอผลพิจารณาคำขอ (${pendingCount} รายการ)`;
    statusTitle = `สถานะแปลง ${myPlot?.name || ''}: มีคำขอรอพิจารณา`;
    statusDesc = `มีคำขอปัจจัยการผลิตรอการพิจารณาจากเจ้าหน้าที่ ICS ${pendingCount} รายการ • งานถัดไป: รอการอนุมัติก่อนนำปัจจัยไปใช้ในแปลงจริง`;
  }

  const farmerRhythmSection = plots.length === 0
    ? empty('ยังไม่มีแปลงปลูกในระบบ', 'เพิ่มแปลงปลูกแรกของคุณ', () => navigateTab('plots'))
    : plots.length === 1
    ? create14DayRhythmTrack(plots[0].id, activities, { title: `ความต่อเนื่องการบันทึกแปลง ${plots[0].name} (14 วันล่าสุด)` })
    : el('div', { className: 'farmer-rhythm-list' },
        ...plots.map(p => create14DayRhythmTrack(p.id, activities, { title: `จังหวะบันทึกแปลง ${p.name} (14 วันล่าสุด)` }))
      );

  const farmerHeroCard = el('div', { className: `farmer-hero-graphic-card ${statusTier}` },
    el('div', { className: 'farmer-hero-top' },
      el('div', { className: 'farmer-hero-info' },
        el('div', { className: 'status-badge-row' },
          el('span', { className: 'pill' }, 'สิ่งที่ต้องทำวันนี้'),
          statusBadge(statusTier, statusBadgeText),
          myPlot?.conversion_year ? el('span', { className: 'pill' }, myPlot.conversion_year) : null,
          myPlot?.plot_code ? el('span', { className: 'pill' }, `รหัสแปลง: ${myPlot.plot_code}`) : null
        ),
        el('h3', { className: 'farmer-status-title' }, statusTitle),
        el('p', { className: 'farmer-status-desc' }, statusDesc)
      )
    ),
    farmerRhythmSection,
    alertAdvice ? el('div', { className: `farmer-advice-box advice-${statusTier} mt-12` },
      icon('alert', 15),
      el('span', {}, alertAdvice)
    ) : null,
    el('div', { className: 'row farmer-actions-row mt-12' },
      el('button', {
        type: 'button',
        id: 'farmerPrimaryRecordBtn',
        className: isOverdue ? 'pulse' : '',
        onclick: () => navigateTab('record')
      }, icon('calendar', 16), ' บันทึกกิจกรรม'),
      el('button', {
        type: 'button',
        className: 'secondary',
        onclick: () => navigateTab('approval')
      }, icon('clipboard', 16), ' ขออนุมัติปัจจัย')
    )
  );

  const pgsCriteriaCard = el('div', { className: 'card pgs-criteria-card' },
    el('div', { className: 'row between' },
      el('h4', { className: 'milestone-header' }, icon('shield', 16), ' ข้อกำหนดมาตรฐานเกษตรอินทรีย์ PGS (วิสาหกิจชุมชนผักไหม)'),
      el('span', { className: 'pill success' }, 'เกณฑ์รับรองกลุ่ม')
    ),
    el('p', { className: 'muted card-lead' }, 'แนวทางปฏิบัติ 4 ข้อสำคัญเพื่อรักษามาตรฐานอินทรีย์และเตรียมความพร้อมก่อนการตรวจประเมิน'),
    el('div', { className: 'grid pgs-criteria-grid mt-12' },
      el('div', { className: 'criteria-item' },
        el('b', { className: 'criteria-title' }, icon('calendar', 14), ' 1. บันทึกแปลงต่อเนื่อง'),
        el('p', { className: 'criteria-desc muted' }, 'บันทึกการดูแลแปลงอย่างน้อยทุก 14 วัน เพื่อให้ตรวจสอบย้อนกลับได้')
      ),
      el('div', { className: 'criteria-item' },
        el('b', { className: 'criteria-title' }, icon('clipboard', 14), ' 2. ขออนุมัติปัจจัยการผลิต'),
        el('p', { className: 'criteria-desc muted' }, 'ยื่นขออนุมัติปุ๋ยอินทรีย์และชีวภัณฑ์กับเจ้าหน้าที่ ICS ก่อนใช้ในแปลงจริง')
      ),
      el('div', { className: 'criteria-item' },
        el('b', { className: 'criteria-title' }, icon('mapPin', 14), ' 3. แนวกันชนปลอดภัย'),
        el('p', { className: 'criteria-desc muted' }, 'ดูแลแนวกันชนรอบแปลงเพื่อป้องกันสารเคมีจากภายนอกพัดพาเข้ามา')
      ),
      el('div', { className: 'criteria-item' },
        el('b', { className: 'criteria-title' }, icon('shield', 14), ' 4. ตรวจประเมินแปลง'),
        el('p', { className: 'criteria-desc muted' }, 'พร้อมรับการตรวจประเมินแปลงประจำฤดูกาลโดยคณะกรรมการกลุ่ม PGS')
      )
    )
  );

  const farmerStatMeta = {
    'แปลงปลูก': { icon: 'mapPin', color: 'kpi-emerald', unit: ' แปลง' },
    'กิจกรรม': { icon: 'calendar', color: 'kpi-forest', unit: ' รายการ' },
    'คำขอรอพิจารณา': { icon: 'clock', color: 'kpi-amber', unit: ' คำขอ' },
    'ล็อตผลผลิต': { icon: 'package', color: 'kpi-forest', unit: ' ล็อต' }
  };

  const farmerKpiGrid = el('div', { className: 'grid kpi-grid' },
    [['แปลงปลูก', plots.length],
     ['กิจกรรม', activities.length],
     ['คำขอรอพิจารณา', pendingCount],
     ['ล็อตผลผลิต', lots.length]].map(([label, count]) => {
      const meta = farmerStatMeta[label] || { icon: 'sprout', color: 'kpi-forest', unit: '' };
      return el('div', { className: 'card kpi-card' },
        el('div', { className: 'kpi-top' },
          el('div', { className: `kpi-icon-badge ${meta.color}` }, icon(meta.icon, 16)),
          el('span', { className: 'kpi-tag' }, label)
        ),
        el('div', { className: 'kpi-num' }, `${count}`, el('small', {}, meta.unit)),
        el('div', { className: `kpi-bar ${meta.color.replace('kpi-', 'kpi-bar-')}` })
      );
    })
  );

  return [
    farmerHeroCard,
    pgsCriteriaCard,
    farmerKpiGrid
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
  const kindSel = selectField('kind', 'ประเภทกิจกรรม', ['ปลูก', 'ให้น้ำ', 'ใส่ปุ๋ย', 'กำจัดวัชพืช', 'ป้องกันกำจัดศัตรูพืช', 'เก็บเกี่ยว', 'อื่นๆ'].map(value => ({ value, label: value })));
  const dateField = inputField('activity_date', 'วันที่ทำกิจกรรม', 'date', true, todayIso);
  const inputUsedField = el('input', { name: 'input_used', type: 'text', maxlength: 120, placeholder: 'เช่น ปุ๋ยหมักอินทรีย์, แหนแดง, น้ำส้มควันไม้ (ถ้ามี)' });
  const amountField = el('input', { name: 'amount_qty', type: 'text', maxlength: 60, placeholder: 'เช่น 20 กก., 5 ลิตร (ถ้ามี)' });
  const detailsArea = el('textarea', { name: 'details', required: true, placeholder: 'ระบุการปฏิบัติงาน สภาพแปลง หรือสิ่งที่สังเกตเห็น' });
  const detailsError = el('small', { className: 'field-error hide' }, 'กรุณาระบุรายละเอียดกิจกรรมอย่างน้อยสั้น ๆ เพื่อให้ตรวจสอบย้อนกลับได้');
  const photoInput = el('input', { name: 'photo_url', type: 'url', placeholder: 'https://...' });
  const evidenceIdInput = el('input', { name: 'evidence_id', type: 'hidden', value: '' });

  const quickPresets = [
    { kindTag: 'ปลูก', label: 'ปลูกข้าวหอมมะลิ 105', kind: 'ปลูก', inputUsed: 'เมล็ดพันธุ์ข้าวหอมมะลิ 105 อินทรีย์', details: 'ปลูกข้าวหอมมะลิ 105 อินทรีย์ ตามมาตรฐานกลุ่มวิสาหกิจชุมชนผักไหม' },
    { kindTag: 'ให้น้ำ', label: 'สูบน้ำเข้าแปลงนา', kind: 'ให้น้ำ', inputUsed: '', details: 'สูบน้ำเข้าแปลงนาอินทรีย์ ตรวจคันนาและแนวกันชนรอบแปลงเรียบร้อย' },
    { kindTag: 'ใส่ปุ๋ย', label: 'ปล่อยแหนแดงบำรุงดิน', kind: 'ใส่ปุ๋ย', inputUsed: 'แหนแดงสด', details: 'ปล่อยแหนแดงในแปลงนาเพื่อบำรุงดินตามธรรมชาติ' },
    { kindTag: 'ใส่ปุ๋ย', label: 'พ่นน้ำหมักชีวภาพ', kind: 'ใส่ปุ๋ย', inputUsed: 'น้ำหมักชีวภาพสูตรกลุ่ม', details: 'ฉีดพ่นปุ๋ยหมักอินทรีย์และจุลินทรีย์หน่อกล้วยตามสูตรที่ได้รับอนุมัติจาก ICS' },
    { kindTag: 'ถอนหญ้า', label: 'ดายหญ้ารอบแปลง', kind: 'กำจัดวัชพืช', inputUsed: '', details: 'กำจัดวัชพืชด้วยแรงงานคนและตัดหญ้าแนวกันชนรอบแปลง ไม่ใช้สารเคมี' },
    { kindTag: 'ป้องกันแมลง', label: 'พ่นน้ำส้มควันไม้', kind: 'ป้องกันกำจัดศัตรูพืช', inputUsed: 'น้ำส้มควันไม้', details: 'ฉีดพ่นน้ำส้มควันไม้เจือจางเพื่อไล่แมลงและเพลี้ย' },
    { kindTag: 'บำรุงดิน', label: 'ไถกลบตอซังไม่เผาฟาง', kind: 'อื่นๆ', inputUsed: 'ปอเทืองบำรุงดิน', details: 'ไถกลบตอซังข้าวและหว่านปอเทืองบำรุงดิน ไม่เผาฟาง' },
    { kindTag: 'เก็บเกี่ยว', label: 'เก็บเกี่ยวผลผลิต', kind: 'เก็บเกี่ยว', inputUsed: '', details: 'เก็บเกี่ยวผลผลิตอินทรีย์ ทำความสะอาดเครื่องมือก่อนเก็บเกี่ยว' }
  ];

  const chipsGrid = el('div', { className: 'quick-chips-grid' });
  quickPresets.forEach(preset => {
    const btn = el('button', {
      type: 'button',
      className: 'chip-btn',
      onclick: () => {
        const kindSelect = kindSel.querySelector('select[name="kind"]');
        if (kindSelect) kindSelect.value = preset.kind;
        inputUsedField.value = preset.inputUsed;
        detailsArea.value = preset.details;
        detailsError.classList.add('hide');
        chipsGrid.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        notify(`เลือกกิจกรรม: "${preset.label}"`);
      }
    },
      el('span', { className: 'chip-tag' }, preset.kindTag),
      el('span', { className: 'chip-text' }, preset.label)
    );
    chipsGrid.append(btn);
  });

  let wizardStep = 1;
  const stepTabs = [
    el('div', { className: 'wizard-step-pill active' }, '1. แปลงและประเภท'),
    el('div', { className: 'wizard-step-pill' }, '2. รายละเอียดและปริมาณ'),
    el('div', { className: 'wizard-step-pill' }, '3. ทบทวนแล้วบันทึก')
  ];
  const reviewBox = el('div', { className: 'wizard-review-box' });
  const submitBtn = el('button', { type: 'submit', id: 'recordSubmitBtn' }, icon('checkCircle', 16), ' บันทึกกิจกรรม');

  const step1Panel = el('div', { className: 'wizard-panel' },
    el('div', { className: 'senior-step-guide' },
      icon('info', 15),
      el('span', {}, 'ขั้นตอนที่ 1 จาก 3: เลือกแปลงปลูก แล้วแตะปุ่มลัดด้านล่างเพื่อเลือกงานที่ทำวันนี้ได้ทันทีโดยไม่ต้องพิมพ์เอง')
    ),
    plotSel,
    el('small', { className: 'muted helper-label' }, 'เลือกงานที่ใช้บ่อยจากปุ่มลัด หรือเลือกประเภทด้านล่าง:'),
    chipsGrid,
    kindSel,
    dateField,
    el('div', { className: 'row mt-12' },
      el('button', {
        type: 'button',
        id: 'wizardNext1Btn',
        onclick: () => setWizardStep(2)
      }, 'ถัดไป: ระบุรายละเอียด')
    )
  );

  const step2Panel = el('div', { className: 'wizard-panel hide' },
    el('div', { className: 'senior-step-guide' },
      icon('info', 15),
      el('span', {}, 'ขั้นตอนที่ 2 จาก 3: ตรวจสอบหรือพิมพ์รายละเอียดเพิ่มเติม (สามารถกดปุ่ม "บันทึกด้วยเสียง" เพื่อพูดแทนการพิมพ์) และถ่ายรูปแปลงหากมี')
    ),
    el('label', {}, 'ปัจจัยที่ใช้ (ถ้ามี)', inputUsedField),
    el('label', {}, 'ปริมาณและหน่วย (ถ้ามี)', amountField),
    el('label', {},
      'รายละเอียดกิจกรรม',
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
    el('div', { className: 'row between mt-12' },
      el('button', { type: 'button', className: 'secondary', onclick: () => setWizardStep(1) }, 'ย้อนกลับ'),
      el('button', {
        type: 'button',
        id: 'wizardNext2Btn',
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
    el('div', { className: 'senior-step-guide' },
      icon('checkCircle', 15),
      el('span', {}, 'ขั้นตอนสุดท้าย (3 จาก 3): ตรวจสอบข้อมูลในกรอบด้านล่าง หากถูกต้องแล้วให้กดปุ่มสีเขียว "บันทึกกิจกรรม"')
    ),
    reviewBox,
    el('div', { className: 'row between mt-12' },
      el('button', { type: 'button', className: 'secondary', onclick: () => setWizardStep(2) }, 'แก้ไขข้อมูล'),
      submitBtn
    )
  );

  const renderReviewBox = () => {
    const plotSelectEl = plotSel.querySelector('select[name="plot_id"]');
    const kindSelectEl = kindSel.querySelector('select[name="kind"]');
    const dateInputEl = dateField.querySelector('input[name="activity_date"]');
    const plotLabel = plotSelectEl?.selectedOptions?.[0]?.textContent || '-';
    const inputText = [inputUsedField.value.trim(), amountField.value.trim()].filter(Boolean).join(' • ');
    reviewBox.replaceChildren(
      el('div', { className: 'passport-row' }, el('b', {}, 'แปลงปลูก:'), el('span', {}, plotLabel)),
      el('div', { className: 'passport-row' }, el('b', {}, 'ประเภทกิจกรรม:'), el('span', {}, kindSelectEl?.value || '-')),
      el('div', { className: 'passport-row' }, el('b', {}, 'วันที่ทำกิจกรรม:'), el('span', {}, dateInputEl?.value || '-')),
      inputText ? el('div', { className: 'passport-row' }, el('b', {}, 'ปัจจัยและปริมาณ:'), el('span', {}, inputText)) : null,
      el('div', { className: 'passport-row' }, el('b', {}, 'รายละเอียด:'), el('span', {}, detailsArea.value.trim() || '-')),
      evidenceIdInput.value
        ? el('div', { className: 'passport-row' }, el('b', {}, 'ภาพหลักฐาน:'), el('span', { className: 'pill success' }, `อัปโหลดแล้ว (#${evidenceIdInput.value})`))
        : (photoInput.value.startsWith('data:')
            ? el('div', { className: 'passport-row' }, el('b', {}, 'ภาพตัวอย่าง (Demo):'), el('span', { className: 'pill warn' }, 'เก็บในเครื่องนี้'))
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

  const recordForm = el('form', { id: 'recordForm', className: 'card' },
    el('h3', {}, icon('calendar', 16), ' บันทึกกิจกรรมแปลง'),
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

    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังบันทึก...';
    try {
      await api('/activities', 'POST', {
        plot_id: formData.get('plot_id'),
        kind: formData.get('kind'),
        activity_date: formData.get('activity_date'),
        details: finalDetails,
        photo_url: formData.get('photo_url') || '',
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

export async function buildFarmerReviewsView() {
  const rows = await api('/reviews').catch(() => []);
  const nodes = [
    el('div', { className: 'notice' },
      el('b', {}, icon('shield', 15), ' ประวัติผลการตรวจประเมินแปลง'),
      el('p', { className: 'muted' }, rows.length
        ? `พบประวัติการตรวจประเมินภายในกลุ่ม (ICS) ทั้งหมด ${rows.length} รายการ`
        : 'ผลตรวจจะแสดงที่นี่เมื่อระบบเปิดให้เกษตรกรดูได้ โดยปัจจุบันเจ้าหน้าที่ ICS เป็นผู้บันทึกผลการตรวจประเมินภายในกลุ่ม')
    )
  ];

  if (!rows.length) {
    nodes.push(empty('ผลตรวจจะแสดงที่นี่เมื่อระบบเปิดให้เกษตรกรดูได้ หากมีข้อสงสัยเกี่ยวกับผลการตรวจแปลง กรุณาติดต่อเจ้าหน้าที่ ICS ผู้รับผิดชอบของคุณ'));
    return nodes;
  }

  for (const item of rows) {
    const isPass = item.result === 'ผ่าน';
    const isWarn = item.result === 'ต้องแก้ไข';
    const pillClass = isPass ? 'pill success' : isWarn ? 'pill warn' : 'pill danger';
    const statusIcon = isPass ? icon('checkCircle', 12) : isWarn ? icon('clock', 12) : icon('xCircle', 12);
    const stdLabel = item.standard_code ? (AUDIT_STANDARD_LABELS[item.standard_code] || item.standard_code) : null;

    const box = card(
      el('div', { className: 'row between' },
        el('b', {}, item.plot_name || '-'),
        el('div', { className: 'pill-list-row' },
          stdLabel ? el('span', { className: 'pill' }, stdLabel) : null,
          el('span', { className: pillClass }, statusIcon, item.result)
        )
      ),
      el('p', {}, item.note || '-'),
      el('small', { className: 'muted' }, `ตรวจประเมินเมื่อ ${dated(item.reviewed_at || item.created_at)}`)
    );

    if (item.evidence_id) {
      box.append(el('button', {
        type: 'button',
        className: 'link-btn mt-8',
        onclick: () => openEvidenceViewer(item.evidence_id)
      }, icon('camera', 13), ' ดูภาพหลักฐานจากการตรวจแปลง'));
    }

    nodes.push(box);
  }

  return nodes;
}
