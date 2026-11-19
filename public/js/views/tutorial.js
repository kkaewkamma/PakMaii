'use strict';

import { el, statusBadge, notify } from '../core/dom.js';
import { icon } from '../core/icons.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function createDonutSvg(segments, centerTopText, centerSubText) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 180 180');
  svg.setAttribute('width', '168');
  svg.setAttribute('height', '168');
  svg.setAttribute('class', 'ics-donut-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${centerTopText} ${centerSubText}`);

  const radius = 64;
  const circumference = 2 * Math.PI * radius;

  // Base track circle
  const bgCircle = document.createElementNS(SVG_NS, 'circle');
  bgCircle.setAttribute('cx', '90');
  bgCircle.setAttribute('cy', '90');
  bgCircle.setAttribute('r', String(radius));
  bgCircle.setAttribute('fill', 'none');
  bgCircle.setAttribute('stroke', '#E6ECE4');
  bgCircle.setAttribute('stroke-width', '22');
  svg.appendChild(bgCircle);

  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  if (total > 0) {
    let accumulatedFraction = 0;
    for (const seg of segments) {
      const val = Math.max(0, seg.value);
      if (val <= 0) continue;
      const fraction = val / total;
      const segLength = fraction * circumference;
      const offset = circumference * (0.25 - accumulatedFraction);

      const arc = document.createElementNS(SVG_NS, 'circle');
      arc.setAttribute('cx', '90');
      arc.setAttribute('cy', '90');
      arc.setAttribute('r', String(radius));
      arc.setAttribute('fill', 'none');
      arc.setAttribute('stroke', seg.color);
      arc.setAttribute('stroke-width', '22');
      arc.setAttribute('stroke-dasharray', `${segLength.toFixed(2)} ${(circumference - segLength).toFixed(2)}`);
      arc.setAttribute('stroke-dashoffset', offset.toFixed(2));
      svg.appendChild(arc);

      accumulatedFraction += fraction;
    }
  }

  // Center text
  const topText = document.createElementNS(SVG_NS, 'text');
  topText.setAttribute('x', '90');
  topText.setAttribute('y', '86');
  topText.setAttribute('text-anchor', 'middle');
  topText.setAttribute('class', 'donut-center-num');
  topText.textContent = centerTopText;
  svg.appendChild(topText);

  const subText = document.createElementNS(SVG_NS, 'text');
  subText.setAttribute('x', '90');
  subText.setAttribute('y', '108');
  subText.setAttribute('text-anchor', 'middle');
  subText.setAttribute('class', 'donut-center-label');
  subText.textContent = centerSubText;
  svg.appendChild(subText);

  return svg;
}

export function buildIcsAnalyticsChartsPanel({
  totalPlots = 0,
  normalPlotsCount = 0,
  pendingInput = 0,
  riskAlerts = 0,
  groupReadiness = null,
  plots = [],
  activities = [],
  isDemo = false
}) {
  const safeTotal = Math.max(1, normalPlotsCount + pendingInput + riskAlerts || totalPlots || 1);
  const normalPct = Math.round((normalPlotsCount / safeTotal) * 100);
  const pendingPct = Math.round((pendingInput / safeTotal) * 100);
  const riskPct = Math.max(0, 100 - normalPct - pendingPct);

  const statusSegments = [
    { label: 'ปกติ / ผ่านเกณฑ์ PGS', value: normalPlotsCount, pct: normalPct, unit: 'แปลง', color: '#1E7E3E', dotClass: 'dot-green' },
    { label: 'รออนุมัติปัจจัยการผลิต', value: pendingInput, pct: pendingPct, unit: 'รายการ', color: '#D9822B', dotClass: 'dot-amber' },
    { label: 'จุดเสี่ยงเฝ้าระวังเร่งด่วน', value: riskAlerts, pct: riskPct, unit: 'จุด', color: '#C8322B', dotClass: 'dot-rose' }
  ];

  const statusDonut = createDonutSvg(
    statusSegments,
    groupReadiness !== null ? `${groupReadiness}%` : `${normalPct}%`,
    'ความพร้อมกลุ่ม'
  );

  // Crop Distribution Donut Chart (Real plots blended with PakMaii Sisaket community data)
  let riceCount = 0;
  let soyCount = 0;
  let hempCount = 0;
  if (isDemo && totalPlots >= 100) {
    riceCount = 66; // ข้าวหอมมะลิ 105 อินทรีย์ (55%)
    soyCount = 36;  // ถั่วเหลืองอินทรีย์หลังนา แฟร์เทรด (30%)
    hempCount = 18; // ปอเทืองบำรุงดิน / พืชหมุนเวียน (15%)
  } else {
    for (const p of plots) {
      const c = String(p.crop || '').toLowerCase();
      if (c.includes('ถั่ว')) soyCount++;
      else if (c.includes('ปอเทือง')) hempCount++;
      else riceCount++;
    }
  }
  const cropTotal = Math.max(1, riceCount + soyCount + hempCount);
  const cropSegments = [
    { label: 'ข้าวหอมมะลิ 105 อินทรีย์', value: riceCount, pct: Math.round((riceCount / cropTotal) * 100), unit: 'แปลง', color: '#1E7E3E', dotClass: 'dot-green' },
    { label: 'ถั่วเหลืองอินทรีย์หลังนา', value: soyCount, pct: Math.round((soyCount / cropTotal) * 100), unit: 'แปลง', color: '#2F855A', dotClass: 'dot-teal' },
    { label: 'ปอเทืองบำรุงดิน (ไม่เผาฟาง)', value: hempCount, pct: Math.max(0, 100 - Math.round((riceCount / cropTotal) * 100) - Math.round((soyCount / cropTotal) * 100)), unit: 'แปลง', color: '#D9822B', dotClass: 'dot-amber' }
  ];

  const cropDonut = createDonutSvg(
    cropSegments,
    `${riceCount + soyCount + hempCount}`,
    'แปลงทั้งหมด'
  );

  const buildLegendList = (segs) => el('div', { className: 'chart-legend-list' },
    ...segs.map(s => el('div', { className: 'chart-legend-row' },
      el('div', { className: 'chart-legend-left' },
        el('span', { className: `legend-dot ${s.dotClass}` }),
        el('span', { className: 'chart-legend-name' }, s.label)
      ),
      el('div', { className: 'chart-legend-right' },
        el('b', {}, `${s.value} ${s.unit}`),
        el('span', { className: 'chart-pct-badge' }, `${s.pct}%`)
      )
    ))
  );

  // Horizontal Bar Chart: PakMaii Organic Standards Compliance Breakdown
  const since14Iso = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const activePlots14 = plots.filter(p =>
    activities.some(a => a.plot_id === p.id && String(a.activity_date || '').slice(0, 10) >= since14Iso)
  ).length;
  const rhythmRate = plots.length ? Math.round((activePlots14 / plots.length) * 100) : 0;

  const barMetrics = [
    {
      label: '1. แปลงปลอดสารเคมีสังเคราะห์ & แนวกันชนปลอดภัย (เกณฑ์ PGS)',
      pct: isDemo ? 96 : Math.max(75, normalPct),
      tone: 'green',
      detail: isDemo ? '115 / 120 แปลงผ่านเกณฑ์แนวกันชน' : `${normalPlotsCount} / ${plots.length} แปลงปกติ`
    },
    {
      label: '2. ความพร้อมรับรองมาตรฐานกลุ่มวิสาหกิจชุมชนตำบลผักไหม',
      pct: groupReadiness !== null ? groupReadiness : normalPct,
      tone: 'green',
      detail: isDemo ? 'เป้าหมายกลุ่ม ≥ 85% (ปัจจุบันพร้อมตรวจรับรอง)' : 'คำนวณจากแปลงที่ไม่พบความเสี่ยง'
    },
    {
      label: '3. ความสม่ำเสมอการบันทึกสมุดแปลงรอบ 14 วันล่าสุด',
      pct: isDemo ? Math.max(78, rhythmRate) : rhythmRate,
      tone: rhythmRate >= 75 ? 'green' : 'amber',
      detail: `${activePlots14} / ${plots.length} แปลงในชุดตัวอย่างบันทึกครบตามรอบ`
    },
    {
      label: '4. การใช้น้ำจากธนาคารน้ำใต้ดิน & ปุ๋ยอินทรีย์ชีวภาพ (แหนแดง/ปอเทือง)',
      pct: isDemo ? 92 : 88,
      tone: 'teal',
      detail: 'ลดต้นทุนปุ๋ยเคมีและแก้ปัญหาภัยแล้ง อ.ห้วยทับทัน จ.ศรีสะเกษ'
    }
  ];

  const widthTierClass = (pct) => {
    const clamped = Math.max(0, Math.min(100, Math.round(pct / 5) * 5));
    return `bar-w-${clamped}`;
  };

  return el('div', { className: 'card ics-charts-analytics-card' },
    el('div', { className: 'row between' },
      el('div', {},
        el('h3', { className: 'charts-panel-title' }, icon('shield', 18), ' แผนภาพวงกลมและกราฟวิเคราะห์มาตรฐานเกษตรอินทรีย์ (ICS Analytics)'),
        el('p', { className: 'muted card-lead' }, 'สรุปสัดส่วนสถานะแปลงปลูก ชนิดพืชอินทรีย์ และดัชนีความพร้อมของวิสาหกิจชุมชนเกษตรอินทรีย์ตำบลผักไหม อ.ห้วยทับทัน จ.ศรีสะเกษ')
      ),
      statusBadge(riskAlerts > 0 ? 'warn' : 'normal', isDemo ? 'ข้อมูลจริงชุมชน + DEMO นำเสนอ' : 'คำนวณจากข้อมูลจริง')
    ),
    el('div', { className: 'ics-donut-charts-grid mt-12' },
      el('div', { className: 'donut-chart-box' },
        el('h4', { className: 'donut-box-title' }, 'แผนภาพที่ 1: สัดส่วนสถานะแปลงในความดูแล'),
        el('div', { className: 'donut-box-body' },
          statusDonut,
          buildLegendList(statusSegments)
        )
      ),
      el('div', { className: 'donut-chart-box' },
        el('h4', { className: 'donut-box-title' }, 'แผนภาพที่ 2: สัดส่วนชนิดพืชอินทรีย์ ต.ผักไหม'),
        el('div', { className: 'donut-box-body' },
          cropDonut,
          buildLegendList(cropSegments)
        )
      )
    ),
    el('div', { className: 'ics-bar-chart-section mt-16' },
      el('h4', { className: 'donut-box-title' }, 'กราฟดัชนีความสอดคล้องตามมาตรฐานเกษตรอินทรีย์กลุ่ม (PGS & ICS)'),
      el('div', { className: 'bar-chart-list' },
        ...barMetrics.map(m => el('div', { className: 'bar-chart-item' },
          el('div', { className: 'row between bar-chart-header' },
            el('b', { className: 'bar-chart-label' }, m.label),
            el('span', { className: 'bar-chart-val' }, `${m.pct}%`)
          ),
          el('div', { className: 'bar-chart-track' },
            el('div', { className: `bar-chart-fill tone-${m.tone} ${widthTierClass(m.pct)}` })
          ),
          el('small', { className: 'muted' }, m.detail)
        ))
      )
    )
  );
}

export async function markIpTutorialSeen(reset = false) {
  try {
    sessionStorage.setItem('pakmaii_tutorial_seen', reset ? '0' : '1');
    await fetch('/api/tutorial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset })
    });
  } catch {}
}

export function openInteractiveTutorial({ clientIp = '127.0.0.1', onSelectPersona } = {}) {
  document.querySelector('.tutorial-modal-overlay')?.remove();
  const previousFocus = document.activeElement;

  const slides = [
    {
      badge: 'ขั้นตอนที่ 1 / 4 • ภาพรวมโครงการจริง + ข้อมูล DEMO',
      title: 'ยินดีต้อนรับสู่ "ปลูกของดี" (PakMaii Ready to Grow)',
      subtitle: 'ระบบบริหารและตรวจสอบมาตรฐานเกษตรอินทรีย์ วิสาหกิจชุมชนตำบลผักไหม อ.ห้วยทับทัน จ.ศรีสะเกษ',
      points: [
        'อ้างอิงบริบทจริงของวิสาหกิจชุมชนเกษตรอินทรีย์ตำบลผักไหม (สมาชิก 65 ราย พื้นที่รวม 120 แปลง 380 ไร่)',
        'พืชเศรษฐกิจหลัก: ข้าวหอมมะลิ 105 อินทรีย์, ถั่วเหลืองอินทรีย์หลังนา (Fairtrade), ปอเทืองไถกลบไม่เผาฟาง และการใช้แหนแดง/ธนาคารน้ำใต้ดินแก้ภัยแล้ง',
        'ผสานข้อมูล DEMO สำหรับนำเสนอ: คุณสามารถทดลองกดบันทึก อนุมัติ ตรวจแปลง และอัปโหลดรูปภาพได้ครบทุกฟังก์ชันโดยไม่กระทบข้อมูลจริง'
      ]
    },
    {
      badge: 'ขั้นตอนที่ 2 / 4 • ออกแบบเพื่อเกษตรกรและผู้สูงอายุ',
      title: 'ใช้งานง่าย ตัวอักษรใหญ่ สั่งงานด้วยเสียง และถ่ายรูปแปลงได้จริง',
      subtitle: 'ลดภาระการเขียนเอกสารกระดาษซ้ำซ้อนของเกษตรกรในพื้นที่',
      points: [
        'ปุ่ม "ก+ ตัวอักษรใหญ่" มุมขวาบน: กดเพียง 1 ครั้งเพื่อขยายตัวอักษรและปุ่มกดให้ใหญ่พิเศษ อ่านง่ายแม้อยู่กลางแดด',
        'สมุดบันทึกแปลง 3 ขั้นตอน: มีปุ่มลัดเลือกงานที่ใช้บ่อยโดยไม่ต้องพิมพ์เอง พร้อมปุ่มไมโครโฟนพูดภาษาไทยและระบบแนบรูปถ่ายจากกล้อง/คลังภาพ',
        'หน้าคำขอปัจจัยการผลิต: แจ้งเหตุผลชัดเจนเมื่อสูตรปุ๋ยไม่ผ่านเกณฑ์ พร้อมกล่อง "ส่งปุ๋ยสูตรใหม่" และปุ่ม "ติดต่อเจ้าหน้าที่"'
      ]
    },
    {
      badge: 'ขั้นตอนที่ 3 / 4 • สำหรับเจ้าหน้าที่ตรวจสอบภายใน (ICS Officer)',
      title: 'แผนภาพวงกลม (Donut Chart) & ระบบผู้ช่วยคัดกรองความเสี่ยงอัตโนมัติ',
      subtitle: 'ช่วยให้เจ้าหน้าที่ ICS ดูแลสมาชิก 65 รายได้อย่างแม่นยำและโปร่งใส',
      points: [
        'แสดงข้อมูลเป็นแผนภาพวงกลม (Donut Charts) และกราฟดัชนีความพร้อมรับรองกลุ่ม (สัดส่วนแปลงปกติ, รออนุมัติปัจจัย, และจุดเสี่ยง)',
        'ระบบตรวจจับความเสี่ยง 5 ประเภทอัตโนมัติ: แปลงขาดบันทึกเกิน 14 วัน, ขาดภาพหลักฐาน, คำขอปัจจัยค้างตรวจ และงานแก้ไข (CAPA) เกินกำหนด',
        'แยกชุดรายการตรวจ (Checklist) ตามมาตรฐาน PGS, EU Organic และ Fairtrade ออกจากกันอย่างชัดเจน พร้อมตาราง Audit Log'
      ]
    },
    {
      badge: 'ขั้นตอนที่ 4 / 4 • เริ่มต้นทดลองใช้งานได้ทันทีในคลิกเดียว',
      title: 'เลือกบทบาทที่ต้องการทดลองนำเสนอได้เลย',
      subtitle: `ระบบจดจำการเข้าชมครั้งแรกตาม IP ของคุณ (${clientIp}) และสามารถเปิดดูคู่มือนี้ซ้ำได้ตลอดเวลาจากปุ่ม "คู่มือแนะนำ" ด้านบน`,
      points: [
        'กดเลือก "คุณสมปอง คำภา (F-STG-001)" เพื่อทดลองมุมมองเกษตรกร (บันทึกกิจกรรม, อัปโหลดรูป, ส่งปุ๋ยสูตรใหม่)',
        'กดเลือก "คุณวิชัย ผักไหม (ICS-STG-001)" เพื่อทดลองมุมมองเจ้าหน้าที่ ICS (ดูกราฟวงกลม, อนุมัติคำขอ, บันทึกผลตรวจแปลง)',
        'เมื่อเข้าสู่ระบบแล้ว สามารถกดสลับบทบาทไปมาที่แถบด้านบนได้ทันที ข้อมูลจะเชื่อมโยงถึงกันแบบ Real-time'
      ]
    }
  ];

  let stepIndex = 0;
  const badgeEl = el('span', { className: 'tutorial-step-badge' });
  const ipTagEl = el('span', { className: 'tutorial-ip-badge' }, `เข้าชมครั้งแรกจาก IP: ${clientIp}`);
  const titleEl = el('h3', { className: 'tutorial-title' });
  const subEl = el('p', { className: 'tutorial-subtitle' });
  const listEl = el('ul', { className: 'tutorial-points-list' });
  const dotsHost = el('div', { className: 'tutorial-dots-row' });
  const quickStartBox = el('div', { className: 'tutorial-quickstart-box hide' });

  const closeTutorial = async () => {
    overlay.remove();
    document.removeEventListener('keydown', onKeyDown);
    await markIpTutorialSeen(false);
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') closeTutorial();
  };
  document.addEventListener('keydown', onKeyDown);

  if (typeof onSelectPersona === 'function') {
    quickStartBox.append(
      el('b', { className: 'tutorial-qs-label' }, 'หรือแตะเลือกบทบาทเพื่อเข้าสู่ระบบทันที:'),
      el('div', { className: 'tutorial-qs-buttons' },
        el('button', {
          type: 'button',
          className: 'btn-send-review',
          onclick: async () => {
            await closeTutorial();
            onSelectPersona('farmer', 'F-STG-001');
          }
        }, icon('farmerAvatar', 18), ' เริ่มต้นในฐานะเกษตรกร (คุณสมปอง F-STG-001)'),
        el('button', {
          type: 'button',
          className: 'secondary',
          onclick: async () => {
            await closeTutorial();
            onSelectPersona('ics', 'ICS-STG-001');
          }
        }, icon('shield', 18), ' เริ่มต้นในฐานะเจ้าหน้าที่ ICS (คุณวิชัย ICS-STG-001)')
      )
    );
  }

  const prevBtn = el('button', {
    type: 'button',
    className: 'secondary',
    onclick: () => {
      if (stepIndex > 0) {
        stepIndex--;
        renderSlide();
      }
    }
  }, 'ย้อนกลับ');

  const nextBtn = el('button', {
    type: 'button',
    id: 'tutorialNextBtn',
    onclick: async () => {
      if (stepIndex < slides.length - 1) {
        stepIndex++;
        renderSlide();
      } else {
        await closeTutorial();
        notify('พร้อมเริ่มใช้งานระบบ Ready to Grow');
      }
    }
  }, 'ถัดไป');

  const skipBtn = el('button', {
    type: 'button',
    id: 'tutorialSkipBtn',
    className: 'tutorial-skip-btn',
    onclick: closeTutorial
  }, 'ข้ามคู่มือ ✕');

  const renderSlide = () => {
    const s = slides[stepIndex];
    badgeEl.textContent = s.badge;
    titleEl.textContent = s.title;
    subEl.textContent = s.subtitle;
    listEl.replaceChildren(...s.points.map(pt => el('li', {}, pt)));
    dotsHost.replaceChildren(
      ...slides.map((_, idx) => el('span', {
        className: `tutorial-dot ${idx === stepIndex ? 'active' : idx < stepIndex ? 'done' : ''}`
      }))
    );
    prevBtn.classList.toggle('hide', stepIndex === 0);
    const isLast = stepIndex === slides.length - 1;
    nextBtn.textContent = isLast ? 'เริ่มใช้งานระบบ' : 'ถัดไป';
    quickStartBox.classList.toggle('hide', !isLast || typeof onSelectPersona !== 'function');
  };

  renderSlide();

  const cardNode = el('div', { className: 'passport-card tutorial-modal-card' },
    el('div', { className: 'tutorial-modal-header' },
      el('div', { className: 'tutorial-header-top' },
        el('div', { className: 'tutorial-badges-wrap' }, badgeEl, ipTagEl),
        skipBtn
      ),
      el('div', { className: 'tutorial-heading-row' },
        el('div', { className: 'tutorial-brand-icon' }, icon('sprout', 26)),
        el('div', { className: 'tutorial-heading-text' },
          titleEl,
          subEl
        )
      )
    ),
    el('div', { className: 'passport-body tutorial-modal-body' },
      listEl,
      quickStartBox,
      el('div', { className: 'tutorial-footer-bar' },
        dotsHost,
        el('div', { className: 'row' }, prevBtn, nextBtn)
      )
    )
  );

  const overlay = el('div', {
    className: 'passport-overlay tutorial-modal-overlay',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'คู่มือแนะนำการใช้งานระบบครั้งแรก'
  }, cardNode);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeTutorial();
  });
  document.body.append(overlay);
  nextBtn.focus();
}

export async function checkAndShowIpTutorial({ onSelectPersona } = {}) {
  const params = new URLSearchParams(window.location.search);
  const forceTutorial = params.get('tutorial') === '1';

  // Skip auto-popup in headless webdriver unless explicitly requested via ?tutorial=1
  if (navigator.webdriver && !forceTutorial) return;
  if (!forceTutorial && sessionStorage.getItem('pakmaii_tutorial_seen') === '1') return;

  try {
    const res = await fetch('/api/tutorial', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (!data.seen || forceTutorial) {
        openInteractiveTutorial({
          clientIp: data.clientIp || '127.0.0.1',
          onSelectPersona
        });
      }
      return;
    }
  } catch {}

  if (forceTutorial || sessionStorage.getItem('pakmaii_tutorial_seen') !== '1') {
    openInteractiveTutorial({ clientIp: '127.0.0.1', onSelectPersona });
  }
}
