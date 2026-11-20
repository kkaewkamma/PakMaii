// farmer-mobile-record.js
let currentStep = 1;
let selectedPlot = "แปลงนาทุ่งใหญ่ (8 ไร่)";
let selectedActivity = "ใส่ปุ๋ย / บำรุงดิน";

function selectPlot(el, name) {
  document.querySelectorAll('.plot-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedPlot = name;
  const sumEl = document.getElementById('sumPlot');
  if (sumEl) sumEl.textContent = name;
}

function selectActivity(el, name) {
  document.querySelectorAll('.activity-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedActivity = name;
  const sumEl = document.getElementById('sumActivity');
  if (sumEl) sumEl.textContent = name;
}

function setQty(val) {
  const input = document.getElementById('inputQty');
  if (input) input.value = val;
}

function updateStepUI() {
  // Bar states
  const b1 = document.getElementById('bar1');
  const b2 = document.getElementById('bar2');
  const b3 = document.getElementById('bar3');
  if (b1) b1.classList.toggle('active', currentStep >= 1);
  if (b2) b2.classList.toggle('active', currentStep >= 2);
  if (b3) b3.classList.toggle('active', currentStep >= 3);

  // Panels
  const p1 = document.getElementById('step1Panel');
  const p2 = document.getElementById('step2Panel');
  const p3 = document.getElementById('step3Panel');
  if (p1) p1.classList.toggle('active', currentStep === 1);
  if (p2) p2.classList.toggle('active', currentStep === 2);
  if (p3) p3.classList.toggle('active', currentStep === 3);

  // Buttons
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const stepCounter = document.getElementById('stepCounter');
  const stepHeading = document.getElementById('stepHeading');
  const stepSubheading = document.getElementById('stepSubheading');

  if (btnPrev) btnPrev.classList.toggle('is-hidden', currentStep <= 1);

  if (currentStep === 1) {
    if (stepCounter) stepCounter.textContent = 'ขั้นตอนที่ 1 / 3';
    if (stepHeading) stepHeading.textContent = 'เลือกแปลงและประเภทกิจกรรม';
    if (stepSubheading) stepSubheading.textContent = 'ระบุแปลงที่คุณลงมือปฏิบัติงานและหมวดหมู่งาน';
    if (btnNext) {
      btnNext.textContent = 'ขั้นตอนถัดไป →';
      btnNext.classList.remove('btn-step3');
    }
  } else if (currentStep === 2) {
    if (stepCounter) stepCounter.textContent = 'ขั้นตอนที่ 2 / 3';
    if (stepHeading) stepHeading.textContent = 'ระบุรายละเอียดและภาพถ่าย';
    if (stepSubheading) stepSubheading.textContent = 'เลือกสารอินทรีย์ ปริมาณ และภาพประกอบ';
    if (btnNext) {
      btnNext.textContent = 'ตรวจสอบข้อมูล →';
      btnNext.classList.remove('btn-step3');
    }
  } else if (currentStep === 3) {
    if (stepCounter) stepCounter.textContent = 'ขั้นตอนที่ 3 / 3';
    if (stepHeading) stepHeading.textContent = 'ตรวจสอบและยืนยันข้อมูล';
    if (stepSubheading) stepSubheading.textContent = 'โปรดตรวจสอบความถูกต้องก่อนบันทึกลงระบบ';
    if (btnNext) {
      btnNext.textContent = '✓ ยืนยันและบันทึกกิจกรรม';
      btnNext.classList.add('btn-step3');
    }

    const mat = document.getElementById('inputMaterialSelect')?.value || '';
    const qty = document.getElementById('inputQty')?.value || '50';
    const sumMat = document.getElementById('sumMaterial');
    const sumQty = document.getElementById('sumQty');
    if (sumMat) sumMat.textContent = mat;
    if (sumQty) sumQty.textContent = qty + ' กิโลกรัม';
  }
}

function goToNext() {
  if (currentStep < 3) {
    currentStep++;
    updateStepUI();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    alert('🎉 บันทึกกิจกรรมแปลงเรียบร้อยแล้ว!\nระบบได้อัปเดตข้อมูลเข้าระบบตรวจสอบมาตรฐานผักไหมทันที');
    window.location.href = 'farmer-mobile-home.html';
  }
}

function goToPrev() {
  if (currentStep > 1) {
    currentStep--;
    updateStepUI();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Bind plot cards
  document.querySelectorAll('.plot-card').forEach(card => {
    card.addEventListener('click', () => {
      const name = card.getAttribute('data-name') || card.querySelector('h4')?.textContent;
      selectPlot(card, name);
    });
  });

  // Bind activity chips
  document.querySelectorAll('.activity-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const name = chip.getAttribute('data-name') || chip.querySelector('span:last-child')?.textContent;
      selectActivity(chip, name);
    });
  });

  // Bind quick qty buttons
  document.querySelectorAll('.btn-qty-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const qty = parseInt(btn.getAttribute('data-qty'), 10);
      if (!isNaN(qty)) setQty(qty);
    });
  });

  // Photo upload trigger
  const photoBox = document.querySelector('.photo-upload-zone');
  if (photoBox) {
    photoBox.addEventListener('click', () => {
      alert('จำลอง: ถ่ายภาพจากกล้องโทรศัพท์สำเร็จ (1 รูป)');
    });
  }

  // Stepper buttons
  const btnNext = document.getElementById('btnNext');
  if (btnNext) btnNext.addEventListener('click', goToNext);

  const btnPrev = document.getElementById('btnPrev');
  if (btnPrev) btnPrev.addEventListener('click', goToPrev);
});
