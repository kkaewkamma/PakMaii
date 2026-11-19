'use strict';

import { icon } from './icons.js';
import { el, parseLocalIsoDate, formatLocalIsoDate } from './dom.js';

// 14-Day Rhythm Track — "สมุดบันทึกแปลงที่ตรวจสอบได้" (Audit-ready Farm Ledger)
// Pure DOM, 100% CSP safe, no inline styles or innerHTML
export function create14DayRhythmTrack(plotId, activities = [], options = {}) {
  const plotActivities = Array.isArray(activities)
    ? (plotId ? activities.filter(a => a.plot_id === plotId) : activities)
    : [];

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayIso = formatLocalIsoDate(today);
  const customEnd = options.endDate ? parseLocalIsoDate(options.endDate) : null;
  const anchorDay = customEnd || today;
  const windowLabel = customEnd ? '14 วันก่อนเก็บเกี่ยว' : '14 วันล่าสุด';

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(anchorDay);
    d.setDate(d.getDate() - i);
    const iso = formatLocalIsoDate(d);

    const matching = plotActivities.filter(a => {
      const actDate = typeof a.activity_date === 'string' ? a.activity_date.slice(0, 10) : '';
      return actDate === iso;
    });

    days.push({
      iso,
      dayNum: d.getDate(),
      monthNum: d.getMonth() + 1,
      isToday: iso === todayIso,
      daysAgo: i,
      count: matching.length,
      hasActivity: matching.length > 0,
      activities: matching
    });
  }

  const activeDaysCount = days.filter(d => d.hasActivity).length;
  const recentDay = [...days].reverse().find(d => d.hasActivity);

  let continuityText = customEnd ? 'ไม่พบบันทึกช่วง 14 วันก่อนเก็บเกี่ยว' : 'ขาดการบันทึกเกิน 14 วัน';
  let continuityClass = 'status-danger';
  let continuityIcon = 'alert';

  if (activeDaysCount >= 5) {
    continuityText = 'บันทึกต่อเนื่องสม่ำเสมอ';
    continuityClass = 'status-good';
    continuityIcon = 'checkCircle';
  } else if (activeDaysCount >= 1) {
    continuityText = `บันทึกแล้ว ${activeDaysCount} วัน`;
    continuityClass = 'status-warn';
    continuityIcon = 'clock';
  }

  const wrap = el('div', {
    className: 'rhythm-track-wrap ' + (options.compact ? 'compact' : ''),
    role: 'region',
    'aria-label': `แถบจังหวะบันทึก ${windowLabel}: ${continuityText}`
  });

  if (!options.compact) {
    wrap.append(
      el('div', { className: 'rhythm-track-header' },
        el('span', { className: 'rhythm-track-title' },
          icon('calendar', 14),
          options.title || `แถบจังหวะบันทึก ${windowLabel}`
        ),
        el('span', { className: `rhythm-track-status ${continuityClass}` },
          icon(continuityIcon, 12),
          ' ',
          continuityText
        )
      )
    );
  }

  const cells = days.map(d => {
    const activityNames = d.activities.map(a => a.kind || a.activity_type || 'กิจกรรม').join(', ');
    const titleText = d.hasActivity
      ? `${d.dayNum}/${d.monthNum}: บันทึก ${d.count} กิจกรรม (${activityNames})`
      : `${d.dayNum}/${d.monthNum}: ไม่มีการบันทึก`;

    const cellClass = `rhythm-cell ${d.hasActivity ? 'active' : 'empty'} ${d.isToday ? 'is-today' : ''}`;
    return el('div', {
      className: cellClass,
      title: titleText,
      'aria-label': titleText
    }, options.compact ? null : el('span', { className: 'cell-date' }, String(d.dayNum)));
  });

  wrap.append(el('div', { className: 'rhythm-track-row' }, ...cells));

  if (!options.hideFooter) {
    const footerText = options.compact
      ? `บันทึก ${activeDaysCount}/14 วัน`
      : `บันทึก ${activeDaysCount} จาก 14 วัน${recentDay ? ` • ล่าสุด: ${recentDay.dayNum}/${recentDay.monthNum}` : ` • ยังไม่มีบันทึกในรอบ ${windowLabel}`}`;

    wrap.append(
      el('div', { className: 'rhythm-track-footer' },
        el('span', { className: 'rhythm-summary-text' }, footerText),
        options.compact ? null : el('small', { className: 'muted' }, 'เกณฑ์ PGS: ตรวจสอบความต่อเนื่องทุก 14 วัน')
      )
    );
  }

  return wrap;
}
