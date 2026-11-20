'use strict';

import { api } from '../core/api.js';
import { el, card, empty, inputField, selectField, statusBadge, dated, notify, formatLocalIsoDate } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createPhotoUploader, openEvidenceViewer, openPhotoPreviewModal } from '../core/photo.js';
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

  const serviceGrid = el('div', { className: 'service-grid-section mb-16' },
    el('div', { className: 'section-title-row' },
      el('span', { className: 'section-title-text' }, 'บริการสำหรับเกษตรกร'),
      el('span', { className: 'section-sub-text' }, 'แตะเลือกรายการเพื่อเข้าใช้งานด่วน')
    ),
    el('div', { className: 'service-grid' },
      el('button', {
        type: 'button',
        className: 'service-item',
        onclick: () => navigateTab('plots')
      },
        el('div', { className: 'service-icon-box icon-green' }, icon('sprout', 24)),
        el('span', { className: 'service-label' }, 'แปลงของฉัน'),
        el('span', { className: 'service-badge' }, `${plots.length} แปลง`)
      ),
      el('button', {
        type: 'button',
        className: 'service-item',
        onclick: () => navigateTab('record')
      },
        el('div', { className: 'service-icon-box icon-orange' }, icon('calendar', 24)),
        el('span', { className: 'service-label' }, 'บันทึกงาน'),
        el('span', { className: 'service-badge' }, 'จดวันนี้')
      ),
      el('button', {
        type: 'button',
        className: 'service-item',
        onclick: () => navigateTab('approval')
      },
        el('div', { className: 'service-icon-box icon-blue' }, icon('clipboard', 24)),
        el('span', { className: 'service-label' }, 'ขออนุมัติ'),
        el('span', { className: 'service-badge' }, pendingCount > 0 ? `รอตรวจ ${pendingCount}` : 'ยื่นสูตรปุ๋ย')
      ),
      el('button', {
        type: 'button',
        className: 'service-item',
        onclick: () => navigateTab('inspections')
      },
        el('div', { className: 'service-icon-box icon-purple' }, icon('shield', 24)),
        el('span', { className: 'service-label' }, 'ผลตรวจแปลง'),
        el('span', { className: 'service-badge' }, 'มาตรฐาน PGS')
      )
    )
  );

  const farmerHeroCard = el('div', { className: `primary-action-card farmer-hero-graphic-card ${statusTier}` },
    el('div', { className: 'task-header' },
      el('div', { className: 'task-tag-group' },
        el('span', { className: 'task-tag' }, 'สิ่งที่ต้องทำวันนี้'),
        statusBadge(statusTier, statusBadgeText)
      ),
      el('span', { className: 'task-time' }, formatLocalIsoDate(new Date()))
    ),
    el('h3', { className: 'task-title farmer-status-title' }, statusTitle),
    el('p', { className: 'task-desc farmer-status-desc' }, statusDesc),
    farmerRhythmSection,
    alertAdvice ? el('div', { className: 'alert-banner mt-12' },
      el('div', { className: 'alert-icon' }, '⚠️'),
      el('div', { className: 'alert-content' },
        el('div', { className: 'alert-title' }, 'คำแนะนำจากเจ้าหน้าที่ ICS'),
        el('div', { className: 'alert-msg' }, alertAdvice)
      )
    ) : null,
    el('div', { className: 'row farmer-actions-row mt-14' },
      el('button', {
        type: 'button',
        id: 'farmerPrimaryRecordBtn',
        className: 'btn-hero-primary',
        onclick: () => navigateTab('record')
      }, el('span', { className: 'btn-hero-icon' }, '✍️'), ' แตะเพื่อเริ่มบันทึกกิจกรรม'),
      el('button', {
        type: 'button',
        className: 'secondary',
        onclick: () => navigateTab('approval')
      }, icon('clipboard', 16), ' ขออนุมัติปัจจัย')
    )
  );

  const recentMiniList = activities.length > 0 ? el('div', { className: 'card recent-activities-mini-card mb-16' },
    el('div', { className: 'row between align-center mb-8' },
      el('b', { className: 'recent-mini-title' }, icon('clock', 14), ' บันทึกล่าสุดในแปลง'),
      el('button', {
        type: 'button',
        className: 'link-btn text-sm',
        onclick: () => navigateTab('record')
      }, `ดูทั้งหมด (${activities.length}) >`)
    ),
    el('div', { className: 'recent-mini-items-list' },
      ...sortedActs.slice(0, 2).map(act => el('div', { className: 'recent-mini-row' },
        el('div', { className: 'recent-mini-main' },
          el('strong', {}, `${act.kind || act.activity_type || 'กิจกรรมแปลง'}`),
          el('p', { className: 'muted text-xs' }, `${act.plot_name || myPlot?.name || 'แปลงปลูก'} • ${dated(act.activity_date)}`)
        ),
        el('span', { className: 'pill success' }, 'บันทึกแล้ว')
      ))
    )
  ) : null;

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

  const agroClimateWidget = el('div', { className: 'card agro-climate-card' },
    el('div', { className: 'agro-climate-header' },
      el('div', { className: 'agro-location-row' },
        icon('mapPin', 15),
        el('strong', {}, 'ต.ผักไหม อ.ห้วยทับทัน จ.ศรีสะเกษ'),
        el('span', { className: 'agro-subtext' }, 'ดินแดนข้าวหอมมะลิทุ่งกุลาร้องไห้')
      ),
      el('span', { className: 'agro-weather-status' }, '☀️ แดดจัด • ลม ตอ./น. 12 กม./ชม.')
    ),
    el('div', { className: 'grid agro-metrics-grid mt-12' },
      el('div', { className: 'agro-metric-item' },
        el('span', { className: 'agro-metric-label' }, 'อุณหภูมิ'),
        el('div', { className: 'agro-metric-value' }, '32°C'),
        el('span', { className: 'agro-metric-sub muted' }, 'สูงสุด 34° / ต่ำสุด 23°')
      ),
      el('div', { className: 'agro-metric-item' },
        el('span', { className: 'agro-metric-label' }, 'ความชื้นสัมพัทธ์'),
        el('div', { className: 'agro-metric-value' }, '62%'),
        el('span', { className: 'agro-metric-sub muted' }, 'ระดับปกติ ปลอดเชื้อรา')
      ),
      el('div', { className: 'agro-metric-item' },
        el('span', { className: 'agro-metric-label' }, 'ความชื้นผิวดิน'),
        el('div', { className: 'agro-metric-value' }, '48%'),
        el('span', { className: 'agro-metric-sub muted' }, 'เหมาะเตรียมดิน & ปุ๋ยหมัก')
      )
    ),
    el('div', { className: 'agro-seasonal-tip mt-12' },
      icon('sprout', 15),
      el('span', {}, el('strong', {}, 'ปฏิทินอินทรีย์ ต.ผักไหม: '), 'ระยะเตรียมแปลงปลูกข้าวหอมมะลิ 105 — ไถกลบตอซัง ไม่เผาฟาง หว่านปอเทืองปรับปรุงดิน และตรวจเช็กคันดินแนวกันชนตามเกณฑ์ PGS')
    )
  );

  const upcomingInspectionAlert = el('div', { className: 'alert-banner mb-16' },
    el('div', { className: 'alert-icon' }, '📅'),
    el('div', { className: 'alert-content' },
      el('div', { className: 'alert-title' }, 'นัดหมายตรวจแปลงรอบที่ 2/2569'),
      el('div', { className: 'alert-msg' }, 'สารวัตรเกษตร ICS จะเข้าสุ่มตรวจสารตกค้างในแปลงตามรอบมาตรฐาน PGS ผักไหม กรุณาเตรียมสมุดบันทึกแปลง')
    )
  );

  return [
    farmerHeroCard,
    serviceGrid,
    recentMiniList,
    upcomingInspectionAlert,
    agroClimateWidget,
    pgsCriteriaCard,
    farmerKpiGrid
  ].filter(Boolean);
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
    const attachedPhoto = photoInput.dataset.uploadedDataUrl || photoInput.value.trim();
    reviewBox.replaceChildren(
      el('div', { className: 'passport-row' }, el('b', {}, 'แปลงปลูก:'), el('span', {}, plotLabel)),
      el('div', { className: 'passport-row' }, el('b', {}, 'ประเภทกิจกรรม:'), el('span', {}, kindSelectEl?.value || '-')),
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

  const recordForm = el('form', { id: 'recordForm', className: 'card', novalidate: true },
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
  const nodes = [];

  if (!plots.length) {
    nodes.push(empty('กรุณาเพิ่มแปลงปลูกก่อน จึงจะสามารถส่งคำขออนุมัติปัจจัยการผลิตได้', 'ไปหน้าแปลงปลูก', () => navigateTab('plots')));
    return nodes;
  }

  // 1. Featured Status Alert Card (matches the reference design: แผนการใส่ปุ๋ย [ไม่ผ่านการอนุมัติ])
  const featured = rows.find(r => r.status === 'rejected') || rows.find(r => r.status === 'pending') || rows[0];
  if (featured) {
    const isRejected = featured.status === 'rejected';
    const isApproved = featured.status === 'approved';
    const cardTone = isRejected ? 'rejected' : isApproved ? 'approved' : 'pending';
    const badgeLabel = isRejected ? 'ไม่ผ่านการอนุมัติ' : isApproved ? 'ผ่านการอนุมัติ' : 'รอการพิจารณา';
    const docIconName = isRejected ? 'docReject' : isApproved ? 'checkCircle' : 'clipboard';
    const evalDateText = dated(featured.reviewed_at || featured.created_at);

    const reasonText = featured.comment || featured.details || '';
    const bulletItems = reasonText
      .split(/\r?\n|\|/)
      .map(s => s.trim())
      .filter(Boolean);

    const featuredCard = el('div', { className: `approval-hero-alert tone-${cardTone}` },
      el('div', { className: 'approval-hero-top' },
        el('div', { className: `approval-doc-circle tone-${cardTone}` },
          icon(docIconName, 28)
        ),
        el('div', { className: 'approval-hero-heading' },
          el('div', { className: 'approval-title-line' },
            el('h3', { className: 'approval-main-title' }, featured.input_name || 'แผนการใส่ปุ๋ย'),
            el('span', { className: `approval-status-pill tone-${cardTone}` }, badgeLabel)
          ),
          el('div', { className: 'approval-date-sub' }, `วันที่ประเมิน : ${evalDateText} • แปลง: ${featured.plot_name || '-'}`)
        )
      ),
      el('div', { className: `approval-reason-card tone-${cardTone}` },
        el('b', { className: 'approval-reason-title' },
          isRejected
            ? 'เหตุผลในการไม่อนุมัติ'
            : isApproved
            ? 'ความเห็นการอนุมัติจากเจ้าหน้าที่ ICS'
            : 'รายละเอียดสูตรที่ส่งให้เจ้าหน้าที่ ICS ตรวจสอบ'
        ),
        el('ul', { className: 'approval-reason-bullets' },
          ...(bulletItems.length
            ? bulletItems.map(line => el('li', {}, line))
            : [el('li', {}, 'รอเจ้าหน้าที่ ICS ตรวจสอบความสอดคล้องตามมาตรฐานอินทรีย์')])
        )
      )
    );
    nodes.push(featuredCard);
  }

  // 2. "กรุณาดำเนินการต่อ" Action Section (2-column layout: ส่งปุ๋ยสูตรใหม่ + ติดต่อเจ้าหน้าที่)
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
    rows: 3,
    placeholder: 'พิมพ์รายละเอียดสูตรปุ๋ยที่ปรับปรุง...'
  });
  const charCounter = el('div', { className: 'voice-char-counter' }, '0 / 500');
  detailsField.addEventListener('input', () => {
    charCounter.textContent = `${detailsField.value.length} / 500`;
  });

  // Voice assist dialog with speech recognition and Thai community voice presets
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
      let i = 0;
      detailsField.value = '';
      charCounter.textContent = '0 / 500';
      closeDialog();
      detailsField.focus();
      const timer = setInterval(() => {
        if (i < text.length) {
          detailsField.value += text[i];
          charCounter.textContent = `${detailsField.value.length} / 500`;
          i++;
        } else {
          clearInterval(timer);
          notify(`บันทึกเสียงพูดสำเร็จ: "${text.slice(0, 32)}..."`);
        }
      }, 10);
    };

    const sampleChoices = [
      {
        author: 'คุณสมปอง คำภา (เกษตรกรแปลง A-03)',
        text: 'สูตรปรับปรุง: ใช้น้ำหมักชีวภาพสูตรใบสะเดาและพริกแกง เจือจาง 1 ต่อ 500 ฉีดพ่นขับไล่เพลี้ยช่วงเย็นสัปดาห์ละครั้ง'
      },
      {
        author: 'คุณบัวผัน ศรีห้วยทับทัน (เกษตรกรแปลง B-01)',
        text: 'สูตรปรับปรุง: ปุ๋ยหมักมูลวัวนมในฟาร์มอินทรีย์ผสมแกลบดำและรำละเอียด หมักกลับกองครบ 30 วัน อัตรา 40 กิโลกรัมต่อไร่'
      },
      {
        author: 'คุณทองมี แก้วกัลยา (เกษตรกรแปลง C-12)',
        text: 'สูตรปรับปรุง: ใช้น้ำส้มควันไม้เจือจาง 1 ต่อ 200 ฉีดพ่นทางใบช่วงเช้าตรู่ทุก 10 วัน'
      }
    ];

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

    const card = el('div', { className: 'voice-dialog-card' },
      el('div', { className: 'voice-dialog-header' },
        el('h4', { className: 'voice-dialog-title' }, icon('mic', 18), ' ระบบสั่งการด้วยเสียงภาษาไทย'),
        el('button', {
          type: 'button',
          className: 'voice-dialog-close-btn',
          title: 'ปิดหน้าต่าง',
          onclick: closeDialog
        }, icon('x', 16))
      ),
      el('p', { className: 'muted text-sm' }, 'เลือกตัวอย่างเสียงเกษตรกรสำหรับสาธิต หรือแตะพูดสดผ่านไมค์:'),
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
            rec.onerror = () => notify('ไม่สามารถรับเสียงได้ กรุณาพิมพ์ข้อความหรือเลือกเสียงจำลอง');
            rec.start();
          } catch {
            notify('ไม่สามารถเปิดไมโครโฟนได้');
          }
        }
      }, icon('mic', 16), ' กดเพื่อพูดสดด้วยไมค์ภาษาไทย') : null
    );

    overlay.append(card);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDialog(); });
    document.body.append(overlay);
  };

  // Embedded microphone button inside the textarea box
  const embeddedMicBtn = el('button', {
    type: 'button',
    className: 'embedded-mic-btn',
    title: 'กดเพื่อพูดรายละเอียดสูตรปุ๋ยด้วยเสียง (หรือเลือกเสียงจำลองสำหรับสาธิต)',
    'aria-label': 'พูดรายละเอียดสูตรปุ๋ยด้วยเสียง',
    onclick: () => openVoicePresetSelector()
  }, icon('mic', 18));

  const presetFormulas = [
    {
      label: 'สูตรปุ๋ยหมักอินทรีย์บำรุงดิน (มูลวัวนม + แกลบดำ หมัก 30 วัน)',
      name: 'ปุ๋ยหมักอินทรีย์บำรุงดิน (ทำเอง)',
      details: 'สูตร: มูลวัวในฟาร์มอินทรีย์ + แกลบดำ + รำอ่อน + จุลินทรีย์หน่อกล้วย หมักกลับกองครบ 30 วัน อัตรา 40 กก./ไร่'
    },
    {
      label: 'สูตรน้ำหมักสมุนไพรไล่แมลง (ใบสะเดา + พริก + กากน้ำตาล หมัก 7 วัน)',
      name: 'น้ำหมักสมุนไพรไล่แมลง (ทำเอง)',
      details: 'สูตร: ใบสะเดา + พริก + กากน้ำตาล หมัก 7 วัน ใช้ป้องกันหนอนและเพลี้ยไฟ ตามเกณฑ์มาตรฐานเกษตรอินทรีย์ PGS'
    }
  ];

  const formulaBtns = el('div', { className: 'formula-presets-box' },
    el('small', { className: 'muted helper-label' }, 'แตะเลือกสูตรมาตรฐานกลุ่มวิสาหกิจชุมชน (ไม่ต้องพิมพ์เอง):'),
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
    className: 'btn-send-review'
  }, icon('send', 16), ' ส่งพิจารณา');

  const approvalForm = el('form', { id: 'approvalForm', className: 'action-card-submit', novalidate: true },
    el('div', { className: 'action-card-header' },
      el('span', { className: 'bag-icon-badge' }, icon('fertilizerBag', 24)),
      el('h4', { className: 'action-card-title' }, 'ส่งปุ๋ยสูตรใหม่')
    ),
    formulaBtns,
    plotSel,
    el('label', {}, 'ชื่อปุ๋ย / ปัจจัยการผลิต', inputNameField),
    el('div', { className: 'voice-field-group' },
      el('label', {}, 'รายละเอียดสูตรปุ๋ยและอัตราการใช้'),
      el('div', { className: 'voice-textarea-wrap' },
        detailsField,
        embeddedMicBtn
      ),
      charCounter
    ),
    submitApprovalBtn
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
      notify('ส่งปุ๋ยสูตรใหม่ให้เจ้าหน้าที่ ICS พิจารณาเรียบร้อย');
      if (typeof reloadTab === 'function') await reloadTab();
    } catch (err) {
      if (!err.handled) notify(err.message);
    } finally {
      submitApprovalBtn.disabled = false;
      submitApprovalBtn.replaceChildren(icon('send', 16), document.createTextNode(' ส่งพิจารณา'));
    }
  });

  const contactCard = el('button', {
    type: 'button',
    className: 'action-card-contact',
    onclick: () => openContactIcsDialog(me)
  },
    el('div', { className: 'contact-card-top' },
      el('div', { className: 'contact-headset-badge' }, icon('headset', 28)),
      el('span', { className: 'contact-card-title' }, 'ติดต่อเจ้าหน้าที่'),
      el('span', { className: 'contact-chevron' }, icon('chevronRight', 20))
    ),
    el('p', { className: 'contact-card-desc' }, 'สอบถามรายละเอียดเพิ่มเติม หรือขอคำแนะนำการปรับสูตร')
  );

  nodes.push(
    el('div', { className: 'next-action-section' },
      el('h3', { className: 'next-action-heading' }, 'กรุณาดำเนินการต่อ'),
      el('div', { className: 'next-action-grid' },
        approvalForm,
        contactCard
      )
    )
  );

  return nodes;
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
    } else if (item.photo_url) {
      box.append(
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

    nodes.push(box);
  }

  return nodes;
}
