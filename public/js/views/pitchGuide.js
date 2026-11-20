'use strict';

import { el, notify } from '../core/dom.js';
import { icon } from '../core/icons.js';

let activePitchGuide = null;

export function openPitchGuide(options = {}) {
  const { onSelectPersona, onSwitchTab, onOpenPassport } = options;
  if (activePitchGuide) {
    activePitchGuide.focus();
    return;
  }

  const scenes = [
    {
      step: 1,
      title: 'เกษตรกรพบการแจ้งเตือนปุ๋ยไม่ผ่านเกณฑ์',
      role: 'farmer',
      code: 'F-STG-001',
      actor: 'คุณสมปอง คำภา (เกษตรกรแปลง A-03 ข้าวหอมมะลิ 105)',
      tab: 'approval',
      goal: 'แสดงความโปร่งใสของระบบควบคุมภายใน (ICS) ที่ตรวจจับสูตรปุ๋ยที่ยังไม่ตรงตามเกณฑ์ PGS ได้โดยอัตโนมัติ',
      script: 'ยินดีต้อนรับสู่ระบบ Ready to Grow วิสาหกิจชุมชนเกษตรอินทรีย์ตำบลผักไหม ในฉากแรกนี้ เกษตรกรเปิดแอพมาจะพบการ์ดแจ้งเตือนทันทีว่า แผนการใส่ปุ๋ยในแปลง A-03 ยังไม่ผ่านการอนุมัติ พร้อมระบุสาเหตุชัดเจนโดยไม่ต้องรอเอกสารกระดาษหลายวัน',
      actionLabel: 'เปิดฉากที่ 1: ตรวจสอบสถานะปุ๋ยแปลง A-03',
      execute: async () => {
        if (typeof onSelectPersona === 'function') await onSelectPersona('farmer', 'F-STG-001');
        if (typeof onSwitchTab === 'function') await onSwitchTab('approval');
        notify('ฉากที่ 1: สลับเป็นคุณสมปอง คำภา และเปิดหน้าคำขอปัจจัยการผลิตเรียบร้อย');
      }
    },
    {
      step: 2,
      title: 'เกษตรกรยื่นสูตรปรับปรุงใหม่ (1-Tap & คำสั่งเสียง)',
      role: 'farmer',
      code: 'F-STG-001',
      actor: 'คุณสมปอง คำภา (เกษตรกรสูงอายุ)',
      tab: 'approval',
      goal: 'ขจัดอุปสรรคการพิมพ์ของเกษตรกรสูงอายุ ด้วยชิปสูตรสำเร็จรูปและปุ่มไมโครโฟนภาษาไทย',
      script: 'เกษตรกรสูงอายุไม่จำเป็นต้องพิมพ์ข้อความยาวๆ สามารถแตะชิปสูตรมาตรฐานของวิสาหกิจฯ เพียงครั้งเดียว หรือกดปุ่มไมค์เพื่อสั่งการด้วยเสียง จากนั้นแตะปุ่ม "ส่งพิจารณา" ข้อมูลจะวิ่งตรงถึงผู้ตรวจ ICS ทันที',
      actionLabel: 'เปิดฉากที่ 2: จำลองการเลือกสูตรปรับปรุง & เตรียมส่ง',
      execute: async () => {
        if (typeof onSelectPersona === 'function') await onSelectPersona('farmer', 'F-STG-001');
        if (typeof onSwitchTab === 'function') await onSwitchTab('approval');
        // Auto fill details field if present
        const field = document.querySelector('textarea[name="details"]');
        const nameField = document.querySelector('input[name="name"]');
        if (nameField) nameField.value = 'ปุ๋ยหมักอินทรีย์บำรุงดิน (สูตรปรับปรุงมาตรฐานวิสาหกิจฯ)';
        if (field) {
          field.value = 'สูตรปรับปรุง: มูลวัวนมในฟาร์มอินทรีย์ + แกลบดำ + รำละเอียด หมักกลับกองครบ 30 วัน อัตรา 40 กิโลกรัมต่อไร่';
          field.dispatchEvent(new Event('input', { bubbles: true }));
        }
        notify('ฉากที่ 2: กรอกสูตรปรับปรุงสำเร็จรูป พร้อมให้กดส่งพิจารณา');
      }
    },
    {
      step: 3,
      title: 'ผู้ตรวจประเมิน ICS ตรวจสอบคิวคำขอและแดชบอร์ดความเสี่ยง',
      role: 'ics',
      code: 'ICS-STG-001',
      actor: 'คุณวิชัย ผักไหม (หัวหน้าชุดผู้ตรวจประเมิน ICS)',
      tab: 'approval',
      goal: 'แสดงแดชบอร์ดของผู้ตรวจประเมิน คัดกรองแปลงเสี่ยง และคิวคำขอแบบแยกบทบาทชัดเจน',
      script: 'กรรมการหรือผู้บริหารสามารถสลับสู่มุมมองเจ้าหน้าที่ ICS ได้ทันที แดชบอร์ดจะสรุปสถิติความเสี่ยงด้วยกราฟวงกลม และแสดงคิวคำขอปัจจัยการผลิตที่รอการพิจารณา เพื่อให้เจ้าหน้าที่ตรวจสอบส่วนผสมก่อนอนุญาตให้ใช้ในแปลงจริง',
      actionLabel: 'เปิดฉากที่ 3: สลับเป็นผู้ตรวจ ICS & ดูคิวรออนุมัติ',
      execute: async () => {
        if (typeof onSelectPersona === 'function') await onSelectPersona('ics', 'ICS-STG-001');
        if (typeof onSwitchTab === 'function') await onSwitchTab('approval');
        notify('ฉากที่ 3: สลับเป็นผู้ตรวจ ICS และเปิดคิวพิจารณาคำขอเรียบร้อย');
      }
    },
    {
      step: 4,
      title: 'เจ้าหน้าที่อนุมัติคำขอ & เกษตรกรเห็นผลเรียลไทม์',
      role: 'ics',
      code: 'ICS-STG-001',
      actor: 'คุณวิชัย ผักไหม -> คุณบัวผัน / คุณสมปอง',
      tab: 'approval',
      goal: 'แสดงความต่อเนื่องของการทำงานร่วมกันระหว่างชุมชนและผู้ตรวจ พร้อมประวัติความโปร่งใส',
      script: 'เมื่อเจ้าหน้าที่พิจารณาแล้วว่าสูตรสอดคล้องตามข้อกำหนด PGS จึงกดอนุมัติ ระบบจะบันทึกประวัติการอนุมัติแบบถาวร และเมื่อเกษตรกรเปิดแอพ สถานะจะเปลี่ยนเป็นการ์ดสีเขียว "อนุมัติแล้ว" ปลอดภัยสำหรับนำไปใส่ในแปลงได้ทันที',
      actionLabel: 'เปิดฉากที่ 4: อนุมัติคำขอ & ดูผลลัพธ์สีเขียว',
      execute: async () => {
        // Find approve button in ICS queue if available
        const approveBtn = document.querySelector('.btn-approve, button[name="action"][value="approve"]');
        if (approveBtn) {
          approveBtn.click();
          notify('ฉากที่ 4: ทำการอนุมัติคำขอในระบบเรียบร้อย');
        } else {
          // Switch to farmer with approved status or B-01
          if (typeof onSelectPersona === 'function') await onSelectPersona('farmer', 'F-STG-002');
          if (typeof onSwitchTab === 'function') await onSwitchTab('approval');
          notify('ฉากที่ 4: แสดงหน้าจอเกษตรกรพร้อมสถานะการพิจารณา');
        }
      }
    },
    {
      step: 5,
      title: 'ตรวจสอบย้อนกลับด้วย Digital PGS Passport & พิกัดแปลง',
      role: 'farmer',
      code: 'F-STG-001',
      actor: 'ผู้บริโภค / คู่ค้า Fairtrade / ตลาดส่งออก',
      tab: 'lots',
      goal: 'สร้างมูลค่าเพิ่มและเอกลักษณ์ของข้าวหอมมะลิทุ่งกุลาร้องไห้ ตรวจสอบย้อนกลับถึงแปลงปลูก',
      script: 'เมื่อผลผลิตถูกบรรจุถุง ผู้บริโภคหรือคู่ค้าส่งออกสามารถสแกน QR Code เพื่อเปิด Digital PGS Passport ดูประวัติความต่อเนื่องในการบันทึกแปลง 14 วัน วันที่เก็บเกี่ยว พิกัดแปลงดาวเทียม และตราประทับรับรองวิสาหกิจชุมชนผักไหม',
      actionLabel: 'เปิดฉากที่ 5: เปิดดู Digital Passport ข้าวหอมมะลิผักไหม',
      execute: async () => {
        if (typeof onSelectPersona === 'function') await onSelectPersona('farmer', 'F-STG-001');
        if (typeof onSwitchTab === 'function') await onSwitchTab('lots');
        if (typeof onOpenPassport === 'function') {
          onOpenPassport({
            id: 1,
            code: 'LOT-PKM-2569-001',
            crop: 'ข้าวหอมมะลิ 105 อินทรีย์ (ทุ่งกุลาร้องไห้)',
            plot_name: 'แปลง A-03 (แปลงต้นแบบอินทรีย์)',
            quantity: 3200,
            harvest_date: '2026-11-15',
            farmer: 'คุณสมปอง คำภา',
            review_status: 'approved',
            created_at: '2026-11-16T08:30:00Z'
          });
        }
        notify('ฉากที่ 5: เปิด Digital PGS Passport ของข้าวหอมมะลิผักไหมเรียบร้อย');
      }
    }
  ];

  let currentIdx = 0;
  let isMinimized = false;

  const container = el('aside', {
    className: 'pitch-guide-dock',
    role: 'region',
    'aria-label': 'คู่มือนำเสนอระบบ 3 นาที',
    tabindex: '-1'
  });

  const updateView = () => {
    container.replaceChildren();
    const scene = scenes[currentIdx];

    if (isMinimized) {
      const minBtn = el('button', {
        type: 'button',
        className: 'pitch-minimized-pill',
        title: 'คลิกเพื่อขยายบทสาธิตระบบ 3 นาที',
        onclick: () => { isMinimized = false; updateView(); }
      },
        icon('play', 14),
        el('strong', {}, `บทสาธิต 3 นาที: ฉากที่ ${scene.step}/5`),
        el('span', { className: 'pitch-min-badge' }, 'คลิกเพื่อขยาย')
      );
      container.append(minBtn);
      return;
    }

    // Header
    const closeBtn = el('button', {
      type: 'button',
      className: 'pitch-ctrl-btn',
      title: 'ปิดบทสาธิต',
      'aria-label': 'ปิดบทสาธิต',
      onclick: () => {
        container.remove();
        activePitchGuide = null;
      }
    }, icon('x', 16));

    const minBtn = el('button', {
      type: 'button',
      className: 'pitch-ctrl-btn',
      title: 'ย่อบทสาธิตไว้มุมจอ',
      'aria-label': 'ย่อบทสาธิต',
      onclick: () => { isMinimized = true; updateView(); }
    }, 'ย่อ');

    const header = el('div', { className: 'pitch-guide-header' },
      el('div', { className: 'pitch-header-title-row' },
        el('span', { className: 'pitch-badge' }, '🎯 บทสาธิต 3 นาที'),
        el('span', { className: 'pitch-step-counter' }, `ฉากที่ ${scene.step} จาก 5`)
      ),
      el('div', { className: 'pitch-header-actions' }, minBtn, closeBtn)
    );

    // Step Indicator Dots
    const dotsRow = el('div', { className: 'pitch-dots-row' },
      ...scenes.map((s, idx) => el('button', {
        type: 'button',
        className: `pitch-dot ${idx === currentIdx ? 'active' : ''} ${idx < currentIdx ? 'completed' : ''}`,
        title: `ฉากที่ ${s.step}: ${s.title}`,
        onclick: () => { currentIdx = idx; updateView(); }
      }, String(s.step)))
    );

    // Scene Body Card
    const sceneCard = el('div', { className: 'pitch-scene-card' },
      el('h4', { className: 'pitch-scene-title' }, scene.title),
      el('div', { className: 'pitch-actor-row' },
        el('strong', {}, 'บทบาทจำลอง: '),
        el('span', { className: 'pitch-actor-tag' }, scene.actor)
      ),
      el('div', { className: 'pitch-goal-box' },
        el('strong', {}, 'จุดเน้นนำเสนอ: '),
        el('span', {}, scene.goal)
      ),
      el('div', { className: 'pitch-script-box' },
        el('div', { className: 'pitch-script-label' }, '🗣️ ตัวอย่างบทพูด (30 วินาที):'),
        el('p', { className: 'pitch-script-text' }, `"${scene.script}"`)
      ),
      el('button', {
        type: 'button',
        className: 'pitch-action-trigger-btn',
        onclick: () => scene.execute()
      },
        icon('play', 16),
        scene.actionLabel
      )
    );

    // Footer Controls
    const prevBtn = el('button', {
      type: 'button',
      className: 'btn-sm secondary pitch-nav-btn',
      disabled: currentIdx === 0,
      onclick: () => { if (currentIdx > 0) { currentIdx--; updateView(); } }
    }, icon('chevronLeft', 14), ' ก่อนหน้า');

    const nextBtn = el('button', {
      type: 'button',
      className: 'btn-sm secondary pitch-nav-btn',
      disabled: currentIdx === scenes.length - 1,
      onclick: () => { if (currentIdx < scenes.length - 1) { currentIdx++; updateView(); } }
    }, 'ถัดไป ', icon('chevronRight', 14));

    const footer = el('div', { className: 'pitch-guide-footer' },
      prevBtn,
      el('span', { className: 'pitch-step-pill' }, `${currentIdx + 1} / ${scenes.length}`),
      nextBtn
    );

    container.append(header, dotsRow, sceneCard, footer);
  };

  updateView();
  document.body.append(container);
  activePitchGuide = container;
  container.focus();
}
