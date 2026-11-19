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
        el('span', { className: 'muted' }, 'ยังไม่มีผลตรวจที่เชื่อมกับล็อตนี้')
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
          }, icon('printer', 14), ' พิมพ์ข้อมูลล็อต'),
          el('button', {
            type: 'button',
            className: 'btn-sm secondary',
            onclick: () => showPublicTraceabilityProposal(lot)
          }, icon('package', 14), ' ตัวอย่างหน้าสาธารณะ (QR)')
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
  document.body.append(overlay);

  try {
    const activities = await api('/activities').catch(() => []);
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

export function showPublicTraceabilityProposal(lot) {
  const overlay = el('div', { className: 'passport-overlay' });
  const qrBox = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  qrBox.setAttribute('viewBox', '0 0 80 80');
  qrBox.setAttribute('width', '80');
  qrBox.setAttribute('height', '80');
  qrBox.setAttribute('aria-hidden', 'true');
  qrBox.setAttribute('class', 'qr-proposal-svg');
  const qrShapes = [
    { x: '4', y: '4', w: '24', h: '24' },
    { x: '52', y: '4', w: '24', h: '24' },
    { x: '4', y: '52', w: '24', h: '24' },
    { x: '34', y: '34', w: '12', h: '12' },
    { x: '52', y: '52', w: '10', h: '10' },
    { x: '66', y: '66', w: '10', h: '10' }
  ];
  for (const s of qrShapes) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', s.x);
    rect.setAttribute('y', s.y);
    rect.setAttribute('width', s.w);
    rect.setAttribute('height', s.h);
    rect.setAttribute('rx', '2');
    qrBox.appendChild(rect);
  }

  const card = el('div', { className: 'passport-card' },
    el('div', { className: 'passport-header' },
      el('span', { className: 'pill warn' }, icon('info', 12), ' ตัวอย่างข้อเสนอ (ยังไม่เชื่อมระบบจริง)'),
      el('h3', { className: 'passport-title mt-8' }, 'หน้าตรวจสอบย้อนกลับสาธารณะสำหรับผู้ซื้อ'),
      el('small', { className: 'passport-subtitle' }, 'ล็อต ' + (lot.code || lot.lot_code || '-') + ' • วิสาหกิจชุมชนผักไหม จ.ศรีสะเกษ')
    ),
    el('div', { className: 'passport-body' },
      el('div', { className: 'notice' },
        el('b', {}, 'ข้อจำกัดปัจจุบัน: '),
        'ยังไม่มี Public API / URL สาธารณะสำหรับสแกน QR จริง หน้านี้เป็นต้นแบบการแสดงผลเมื่อระบบเปิดใช้งาน Public Traceability'
      ),
      el('div', { className: 'qr-proposal-box' },
        qrBox,
        el('div', { className: 'qr-proposal-meta' },
          el('b', {}, `รหัสล็อต: ${lot.code || lot.lot_code || '-'}`),
          el('small', { className: 'muted' }, `ผลผลิต: ${lot.crop || '-'} • แปลง: ${lot.plot_name || '-'}`),
          lot.harvest_date ? el('small', { className: 'muted' }, `เก็บเกี่ยว: ${dated(lot.harvest_date)}`) : null,
          el('small', { className: 'muted' }, 'QR สาธารณะ (รอเปิดใช้งาน Public Endpoint)')
        )
      ),
      el('div', { className: 'passport-actions row between mt-12' },
        el('button', {
          type: 'button',
          className: 'passport-close-btn',
          onclick: () => overlay.remove()
        }, 'ปิดหน้าต่างตัวอย่าง')
      )
    )
  );
  overlay.append(card);
  document.body.append(overlay);
}
