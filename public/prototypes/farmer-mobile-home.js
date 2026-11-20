// farmer-mobile-home.js
const sheetData = {
  plots: {
    title: '🌾 แปลงปลูกของฉัน (2 แปลง)',
    html: `
      <div class="sheet-card-item">
        <h4>1. แปลงนาทุ่งใหญ่ (8 ไร่)</h4>
        <p><strong>พืชหลัก:</strong> ข้าวหอมมะลิ 105 อินทรีย์</p>
        <p><strong>สถานะ:</strong> ได้รับรองมาตรฐาน Organic Thailand 2569</p>
        <p class="text-badge-meta">📍 พิกัด: 15.114° N, 104.321° E (ต.ผักไหม)</p>
      </div>
      <div class="sheet-card-item">
        <h4>2. แปลงโคกหนองนา (6 ไร่)</h4>
        <p><strong>พืชหลัก:</strong> ถั่วเหลืองอินทรีย์หลังนา (Fairtrade)</p>
        <p><strong>สถานะ:</strong> อยู่ในระยะปรับเปลี่ยน (T2)</p>
        <p class="text-badge-meta">📍 พิกัด: 15.118° N, 104.325° E (ต.ผักไหม)</p>
      </div>
    `
  },
  inputs: {
    title: '🧪 คำขออนุมัติปัจจัยการผลิต',
    html: `
      <div class="sheet-card-item sheet-item-success">
        <h4>ปุ๋ยหมักชีวภาพสูตร พด.1</h4>
        <p><strong>ปริมาณ:</strong> 500 กิโลกรัม • แปลงนาทุ่งใหญ่</p>
        <p class="text-success">✓ สารวัตรเกษตรอนุมัติแล้ว (15 พ.ย. 69)</p>
      </div>
      <div class="sheet-card-item sheet-item-warning">
        <h4>น้ำหมักปลาชีวภาพเข้มข้น</h4>
        <p><strong>ปริมาณ:</strong> 40 ลิตร • แปลงโคกหนองนา</p>
        <p class="text-warning">⏳ กำลังรอผลการตรวจรับรอง (ยื่นเมื่อ 18 พ.ย.)</p>
      </div>
    `
  },
  inspections: {
    title: '📋 ผลการตรวจประเมินแปลง',
    html: `
      <div class="sheet-card-item">
        <h4>ผลตรวจรับรองรอบที่ 1/2569</h4>
        <p><strong>ผู้ตรวจ:</strong> นายวีระ ชัยมงคล (สารวัตรเกษตร ICS)</p>
        <p><strong>ผลการตรวจ:</strong> ผ่านเกณฑ์ 100% ไม่พบสารเคมีสังเคราะห์ตกค้าง</p>
        <p class="text-success" style="margin-top:4px;">🌟 ได้รับมาตรฐาน Organic Thailand ต่อเนื่องปีที่ 3</p>
      </div>
    `
  },
  notifications: {
    title: '🔔 การแจ้งเตือนของฉัน',
    html: `
      <div class="sheet-card-item sheet-item-alert">
        <h4 class="text-alert-title">📅 นัดหมายตรวจแปลงรอบที่ 2/2569</h4>
        <p class="text-alert-desc">สารวัตรเกษตร ICS จะเข้าตรวจแปลงในอีก 4 วัน (24 พ.ย. 69) กรุณาเตรียมสมุดบันทึก</p>
      </div>
    `
  }
};

export function openSheet(type) {
  const data = sheetData[type];
  if (!data) return;
  const titleEl = document.getElementById('sheetTitle');
  const bodyEl = document.getElementById('sheetBody');
  const backdropEl = document.getElementById('sheetBackdrop');
  const sheetEl = document.getElementById('bottomSheet');

  if (titleEl) titleEl.textContent = data.title;
  if (bodyEl) bodyEl.innerHTML = data.html;
  if (backdropEl) backdropEl.style.display = 'block';
  setTimeout(() => {
    if (sheetEl) sheetEl.classList.add('open');
  }, 10);
}

export function closeSheet() {
  const backdropEl = document.getElementById('sheetBackdrop');
  const sheetEl = document.getElementById('bottomSheet');
  if (sheetEl) sheetEl.classList.remove('open');
  setTimeout(() => {
    if (backdropEl) backdropEl.style.display = 'none';
  }, 250);
}

document.addEventListener('DOMContentLoaded', () => {
  // Bind sheet openers
  document.querySelectorAll('[data-sheet]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const type = btn.getAttribute('data-sheet');
      openSheet(type);
    });
  });

  // Bind close buttons
  const backdrop = document.getElementById('sheetBackdrop');
  if (backdrop) backdrop.addEventListener('click', closeSheet);

  const closeBtn = document.querySelector('.sheet-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeSheet);

  // Bottom dock buttons
  document.querySelectorAll('.dock-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.tagName === 'BUTTON') {
        document.querySelectorAll('.dock-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    });
  });
});
