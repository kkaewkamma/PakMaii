'use strict';

import { el, dated, parseLocalIsoDate } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { create14DayRhythmTrack } from '../core/rhythm.js';
import { api } from '../core/api.js';

export async function showStoryPassport(lot) {
  const overlay = el('div', { className: 'passport-overlay' });
  const hasHarvestDate = Boolean(parseLocalIsoDate(lot.harvest_date));
  const rhythmContainer = el('div', { className: 'passport-rhythm-section mt-12' },
    el('div', { className: 'passport-section-label' },
      hasHarvestDate
        ? 'ความต่อเนื่องการบันทึกแปลงต้นทาง (14 วันก่อนเก็บเกี่ยว):'
        : 'ความต่อเนื่องการบันทึกแปลงต้นทาง (14 วันล่าสุด):'
    )
  );

  const reviewStatusSpan = el('span', { className: 'muted' }, 'ยังไม่มีผลตรวจที่เชื่อมกับล็อตนี้');

  const card = el('div', { className: 'passport-card' },
    el('div', { className: 'passport-header' },
      el('span', { className: 'passport-badge' }, 'ข้อมูลย้อนกลับล็อตผลผลิต'),
      el('h3', { className: 'passport-title' }, 'ล็อตผลผลิต ' + (lot.code || lot.lot_code || '-')),
      el('small', { className: 'passport-subtitle' }, 'วิสาหกิจชุมชนเกษตรอินทรีย์ตำบลผักไหม จ.ศรีสะเกษ')
    ),
    el('div', { className: 'passport-body' },
      el('div', { className: 'passport-row' },
        el('b', {}, 'ชนิดผลผลิต:'),
        el('span', {}, lot.crop || '-')
      ),
      el('div', { className: 'passport-row' },
        el('b', {}, 'แปลงต้นทาง:'),
        el('span', {}, lot.plot_name || '-')
      ),
      el('div', { className: 'passport-row' },
        el('b', {}, 'ปริมาณ:'),
        el('span', {}, typeof lot.quantity === 'number' ? `${lot.quantity} กก.` : (lot.quantity || '-'))
      ),
      lot.harvest_date ? el('div', { className: 'passport-row' },
        el('b', {}, 'วันที่เก็บเกี่ยว:'),
        el('span', {}, dated(lot.harvest_date))
      ) : null,
      lot.farmer ? el('div', { className: 'passport-row' },
        el('b', {}, 'เกษตรกรผู้ผลิต:'),
        el('span', {}, lot.farmer)
      ) : null,
      el('div', { className: 'passport-row' },
        el('b', {}, 'ผลการตรวจประเมิน:'),
        reviewStatusSpan
      ),
      el('div', { className: 'passport-row' },
        el('b', {}, 'วันที่บันทึกล็อต:'),
        el('span', {}, dated(lot.created_at))
      ),
      rhythmContainer,
      el('div', { className: 'passport-actions row between mt-12' },
        el('div', { className: 'row' },
          el('button', {
            type: 'button',
            className: 'btn-sm secondary',
            onclick: () => window.print()
          }, icon('printer', 14), ' พิมพ์ข้อมูลล็อต')
        ),
        el('button', {
          type: 'button',
          className: 'passport-close-btn',
          onclick: () => overlay.remove()
        }, 'ปิดหน้าต่าง')
      )
    )
  );
  overlay.append(card);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.append(overlay);

  try {
    const [activities, reviews] = await Promise.all([
      api('/activities').catch(() => []),
      api('/reviews').catch(() => [])
    ]);
    const matchingReview = Array.isArray(reviews) ? reviews.find(r => r.plot_id === lot.plot_id) : null;
    if (matchingReview) {
      reviewStatusSpan.className = matchingReview.result === 'ผ่าน' ? 'pill success' : 'pill warn';
      reviewStatusSpan.textContent = `${matchingReview.result} (${dated(matchingReview.reviewed_at || matchingReview.created_at)})`;
    } else if (lot.ics_review_status === 'approved') {
      reviewStatusSpan.className = 'pill success';
      reviewStatusSpan.textContent = 'ผ่านการตรวจ ICS (ตัวอย่าง)';
    }
    const track = create14DayRhythmTrack(lot.plot_id, activities, {
      title: `จังหวะบันทึกแปลง ${lot.plot_name || ''}`.trim(),
      endDate: lot.harvest_date || undefined,
      compact: false
    });
    rhythmContainer.append(track);
  } catch {
    rhythmContainer.append(el('small', { className: 'muted' }, 'ไม่สามารถโหลดประวัติจังหวะบันทึกแปลงได้'));
  }
}
