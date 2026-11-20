'use strict';

import { el, dated, parseLocalIsoDate } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { create14DayRhythmTrack } from '../core/rhythm.js';
import { api } from '../core/api.js';

function createQrSvg(lotCode) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('width', '108');
  svg.setAttribute('height', '108');
  svg.setAttribute('class', 'passport-qr-code-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `QR Code ตรวจสอบย้อนกลับล็อต ${lotCode || ''}`);

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '100');
  bg.setAttribute('height', '100');
  bg.setAttribute('fill', '#FFFFFF');
  bg.setAttribute('rx', '6');
  svg.appendChild(bg);

  const drawFinder = (x, y) => {
    const outer = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    outer.setAttribute('x', String(x));
    outer.setAttribute('y', String(y));
    outer.setAttribute('width', '24');
    outer.setAttribute('height', '24');
    outer.setAttribute('fill', '#173D2C');
    outer.setAttribute('rx', '3');
    svg.appendChild(outer);

    const inner = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    inner.setAttribute('x', String(x + 4));
    inner.setAttribute('y', String(y + 4));
    inner.setAttribute('width', '16');
    inner.setAttribute('height', '16');
    inner.setAttribute('fill', '#FFFFFF');
    inner.setAttribute('rx', '1');
    svg.appendChild(inner);

    const center = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    center.setAttribute('x', String(x + 7));
    center.setAttribute('y', String(y + 7));
    center.setAttribute('width', '10');
    center.setAttribute('height', '10');
    center.setAttribute('fill', '#15803D');
    center.setAttribute('rx', '2');
    svg.appendChild(center);
  };

  drawFinder(8, 8);
  drawFinder(68, 8);
  drawFinder(8, 68);

  const dots = [
    [38, 12], [46, 12], [54, 12], [38, 20], [46, 28], [54, 20],
    [12, 38], [20, 38], [28, 38], [12, 46], [20, 54], [28, 46],
    [38, 38], [46, 38], [54, 38], [38, 46], [46, 46], [54, 46], [38, 54], [46, 54], [54, 54],
    [68, 38], [76, 38], [84, 38], [68, 46], [76, 54], [84, 46],
    [38, 68], [46, 68], [54, 68], [38, 76], [46, 84], [54, 76],
    [68, 68], [76, 68], [84, 68], [68, 76], [76, 84], [84, 84]
  ];

  for (const [dx, dy] of dots) {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    dot.setAttribute('x', String(dx));
    dot.setAttribute('y', String(dy));
    dot.setAttribute('width', '5');
    dot.setAttribute('height', '5');
    dot.setAttribute('fill', '#245C43');
    dot.setAttribute('rx', '1');
    svg.appendChild(dot);
  }

  const centerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  centerCircle.setAttribute('cx', '50');
  centerCircle.setAttribute('cy', '50');
  centerCircle.setAttribute('r', '8');
  centerCircle.setAttribute('fill', '#DCFCE7');
  centerCircle.setAttribute('stroke', '#16A34A');
  centerCircle.setAttribute('stroke-width', '1.5');
  svg.appendChild(centerCircle);

  return svg;
}

export async function showStoryPassport(lot) {
  const previousFocus = document.activeElement;
  const lotCode = lot.code || lot.lot_code || '-';
  const overlay = el('div', {
    className: 'passport-overlay',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': `ข้อมูลย้อนกลับล็อตผลผลิต ${lotCode}`.trim()
  });
  const closeDialog = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKeyDown);
    if (previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus();
    }
  };
  const onKeyDown = (e) => {
    if (e.key === 'Escape') closeDialog();
  };
  document.addEventListener('keydown', onKeyDown);

  const hasHarvestDate = Boolean(parseLocalIsoDate(lot.harvest_date));
  const rhythmContainer = el('div', { className: 'passport-rhythm-section mt-12' },
    el('div', { className: 'passport-section-label' },
      hasHarvestDate
        ? 'ความต่อเนื่องการบันทึกแปลงต้นทาง (14 วันก่อนเก็บเกี่ยว):'
        : 'ความต่อเนื่องการบันทึกแปลงต้นทาง (14 วันล่าสุด):'
    )
  );

  const reviewStatusSpan = el('span', { className: 'muted' }, 'ยังไม่มีผลตรวจที่เชื่อมกับล็อตนี้');
  const closeBtn = el('button', {
    type: 'button',
    className: 'passport-close-btn',
    onclick: closeDialog
  }, 'ปิดหน้าต่าง');

  const terroirSection = el('div', { className: 'passport-terroir-box' },
    el('div', { className: 'passport-terroir-header' },
      icon('mapPin', 15),
      el('strong', {}, 'แหล่งกำเนิดดินและภูมิปัญญา: ทุ่งกุลาร้องไห้ ต.ผักไหม')
    ),
    el('div', { className: 'passport-terroir-grid' },
      el('div', { className: 'passport-terroir-item' },
        el('small', { className: 'muted' }, 'พิกัดแปลงดาวเทียม:'),
        el('div', {}, '15.0542° N, 104.0215° E')
      ),
      el('div', { className: 'passport-terroir-item' },
        el('small', { className: 'muted' }, 'ชุดดินทุ่งกุลาร้องไห้:'),
        el('div', {}, 'ดินร่วนปนทราย ส่งเสริมสารหอม 2-AP')
      ),
      el('div', { className: 'passport-terroir-item' },
        el('small', { className: 'muted' }, 'มาตรฐานรับรองกลุ่ม:'),
        el('div', { className: 'passport-cert-tag' }, 'PGS-PKM-2569 (เกษตรอินทรีย์แบบมีส่วนร่วม)')
      )
    )
  );

  const qrSection = el('div', { className: 'passport-qr-wrapper' },
    createQrSvg(lotCode),
    el('div', { className: 'passport-qr-info' },
      el('strong', {}, 'สแกนตรวจสอบย้อนกลับ (Digital Traceability)'),
      el('p', { className: 'muted text-xs mt-4' }, `รหัสล็อต: ${lotCode} • สามารถใช้กล้องสมาร์ทโฟนสแกนเพื่อตรวจสอบความต่อเนื่องของประวัติการดูแลแปลงก่อนเก็บเกี่ยว`)
    )
  );

  const signaturesRow = el('div', { className: 'passport-signature-row mt-16' },
    el('div', { className: 'passport-signature-col' },
      el('div', { className: 'signature-line' }),
      el('small', { className: 'muted' }, '(ลงชื่อ) ผู้ตรวจประเมินภายใน (ICS)')
    ),
    el('div', { className: 'passport-signature-col' },
      el('div', { className: 'signature-line' }),
      el('small', { className: 'muted' }, '(ลงชื่อ) ประธานวิสาหกิจชุมชนเกษตรอินทรีย์ผักไหม')
    )
  );

  const card = el('div', { className: 'passport-card' },
    el('div', { className: 'passport-header' },
      el('span', { className: 'passport-badge' }, 'ข้อมูลย้อนกลับล็อตผลผลิต'),
      el('h3', { className: 'passport-title' }, 'ล็อตผลผลิต ' + lotCode),
      el('small', { className: 'passport-subtitle' }, 'วิสาหกิจชุมชนเกษตรอินทรีย์ตำบลผักไหม จ.ศรีสะเกษ')
    ),
    el('div', { className: 'passport-body' },
      terroirSection,
      el('div', { className: 'passport-row mt-12' },
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
      qrSection,
      rhythmContainer,
      signaturesRow,
      el('div', { className: 'passport-actions row between mt-16' },
        el('div', { className: 'row' },
          el('button', {
            type: 'button',
            className: 'btn-sm secondary',
            onclick: () => window.print()
          }, icon('printer', 14), ' พิมพ์ข้อมูลล็อต')
        ),
        closeBtn
      )
    )
  );
  overlay.append(card);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDialog(); });
  document.body.append(overlay);
  closeBtn.focus();

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
