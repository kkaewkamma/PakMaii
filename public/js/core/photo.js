'use strict';

import { icon } from './icons.js';
import { el, notify } from './dom.js';
import { state } from './state.js';

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });
}

export function compressImage(file, maxDimension = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(e.target.result);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export function dataUrlToBlob(dataUrl) {
  const parts = String(dataUrl || '').split(',');
  const mimeMatch = (parts[0] || '').match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(parts[1] || '');
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

export async function compressImageToBlob(file, maxDimension = 1200, quality = 0.8) {
  const dataUrl = await compressImage(file, maxDimension, quality);
  const blob = dataUrlToBlob(dataUrl);
  return { blob, dataUrl, contentType: blob.type || 'image/jpeg', size: blob.size };
}

export function openPhotoPreviewModal(src, title = 'ภาพหลักฐาน') {
  if (!src) return;
  const previousFocus = document.activeElement;
  const overlay = el('div', {
    className: 'passport-overlay',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': title
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

  const closeBtn = el('button', { type: 'button', className: 'passport-close-btn', onclick: closeDialog }, 'ปิดหน้าต่าง');
  const cardNode = el('div', { className: 'passport-card' },
    el('div', { className: 'passport-header' },
      el('span', { className: 'pill success' }, icon('camera', 12), ' ภาพหลักฐานประกอบการบันทึก'),
      el('h3', { className: 'passport-title mt-8' }, title)
    ),
    el('div', { className: 'passport-body' },
      el('img', { src, className: 'evidence-viewer-img', alt: title })
    ),
    el('div', { className: 'passport-actions row between mt-12' },
      closeBtn
    )
  );
  overlay.append(cardNode);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDialog(); });
  document.body.append(overlay);
  closeBtn.focus();
}

export function uploadEvidenceWithProgress(blob, { plotId, entityType = 'activity', onProgress } = {}) {
  return new Promise((resolve, reject) => {
    if (!plotId) {
      reject(new Error('กรุณาเลือกแปลงปลูกก่อนอัปโหลดภาพหลักฐาน'));
      return;
    }
    const xhr = new XMLHttpRequest();
    const qs = `plot_id=${encodeURIComponent(String(plotId))}&entity_type=${encodeURIComponent(String(entityType))}`;
    xhr.open('POST', `/api/evidence?${qs}`);
    if (state.token) xhr.setRequestHeader('Authorization', `Bearer ${state.token}`);
    xhr.setRequestHeader('Content-Type', blob.type || 'image/jpeg');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && typeof onProgress === 'function') {
        onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      }
    };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText || '{}'); } catch { data = {}; }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `อัปโหลดภาพไม่สำเร็จ (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง'));
    xhr.send(blob);
  });
}

export async function openEvidenceViewer(evidenceId) {
  const previousFocus = document.activeElement;
  const overlay = el('div', {
    className: 'passport-overlay',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': `ภาพหลักฐาน #${evidenceId}`
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

  const closeBtn = el('button', { type: 'button', className: 'passport-close-btn', onclick: closeDialog }, 'ปิดหน้าต่าง');
  const bodyHost = el('div', { className: 'passport-body' },
    el('p', { className: 'muted' }, 'กำลังโหลดภาพหลักฐานอย่างปลอดภัย...')
  );
  const cardNode = el('div', { className: 'passport-card' },
    el('div', { className: 'passport-header' },
      el('span', { className: 'pill success' }, icon('shield', 12), ' หลักฐานภาพถ่ายที่อัปโหลดแล้ว'),
      el('h3', { className: 'passport-title mt-8' }, `ภาพหลักฐาน #${evidenceId}`),
      el('small', { className: 'passport-subtitle' }, 'เข้าถึงได้เฉพาะเจ้าของแปลง เจ้าหน้าที่ ICS ที่รับผิดชอบ และผู้ดูแลระบบ')
    ),
    bodyHost,
    el('div', { className: 'passport-actions row between mt-12' },
      closeBtn
    )
  );
  overlay.append(cardNode);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDialog(); });
  document.body.append(overlay);
  closeBtn.focus();

  try {
    const response = await fetch(`/api/evidence/${encodeURIComponent(String(evidenceId))}/content`, {
      headers: state.token ? { Authorization: `Bearer ${state.token}` } : {},
      cache: 'no-store'
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'ไม่สามารถเปิดดูภาพหลักฐานได้');
    }
    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    bodyHost.replaceChildren(
      el('img', { src: dataUrl, className: 'evidence-viewer-img', alt: `ภาพหลักฐาน #${evidenceId}` }),
      el('small', { className: 'muted mt-8' }, 'ภาพหลักฐานที่จัดเก็บอย่างปลอดภัยในระบบ')
    );
  } catch (err) {
    bodyHost.replaceChildren(
      el('small', { className: 'field-error' }, err.message || 'ไม่สามารถโหลดภาพหลักฐานได้')
    );
  }
}

export function createPhotoUploader(photoUrlInput, options = {}) {
  const entityType = options.entityType || 'activity';
  const getPlotId = typeof options.getPlotId === 'function' ? options.getPlotId : () => null;
  const evidenceIdInput = options.evidenceIdInput || null;

  const isDemoPreview = Boolean(state.demoUser);
  const realUploadReady = !isDemoPreview && Boolean(state.config?.evidenceUploadEnabled);

  if (!isDemoPreview && !realUploadReady) {
    return el('div', { className: 'photo-preview-wrap' },
      el('small', { className: 'muted' }, 'ระบบอัปโหลดภาพขึ้น R2 ยังไม่เปิดใช้งานในสภาพแวดล้อมนี้ (สามารถแนบลิงก์ HTTPS ด้านบนได้หากมี)')
    );
  }

  const galleryInput = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/*', className: 'hide' });
  const cameraInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment', className: 'hide' });
  const previewImg = el('img', {
    className: 'photo-preview-img hide',
    alt: 'ตัวอย่างหลักฐานภาพถ่าย',
    title: 'แตะเพื่อขยายดูภาพขนาดใหญ่',
    onclick: () => openPhotoPreviewModal(previewImg.src, 'ตัวอย่างหลักฐานภาพถ่าย')
  });
  const statusLine = el('small', { className: 'photo-upload-status muted hide' });
  const errorLine = el('small', { className: 'field-error hide' });
  const clearBtn = el('button', {
    type: 'button',
    className: 'ghost btn-sm hide',
    onclick: () => {
      previewImg.classList.add('hide');
      previewImg.removeAttribute('src');
      statusLine.classList.add('hide');
      errorLine.classList.add('hide');
      clearBtn.classList.add('hide');
      if (photoUrlInput) {
        delete photoUrlInput.dataset.uploadedDataUrl;
        if (!photoUrlInput.value.startsWith('https://')) photoUrlInput.value = '';
      }
      if (evidenceIdInput) {
        delete evidenceIdInput.dataset.uploadedDataUrl;
        evidenceIdInput.value = '';
      }
      galleryInput.value = '';
      cameraInput.value = '';
    }
  }, 'ลบภาพ');

  const cameraBtn = el('button', {
    type: 'button',
    className: 'secondary btn-sm',
    onclick: () => cameraInput.click()
  }, icon('camera', 13), ' ถ่ายภาพด้วยกล้อง');

  const galleryBtn = el('button', {
    type: 'button',
    className: 'secondary btn-sm',
    onclick: () => galleryInput.click()
  }, icon('plus', 13), ' เลือกจากคลังภาพ');

  const handleSelectedFile = async (file) => {
    if (!file) return;
    errorLine.classList.add('hide');
    statusLine.classList.remove('hide');
    statusLine.textContent = 'กำลังบีบอัดภาพ...';

    try {
      const compressed = await compressImageToBlob(file, 1000, 0.78);
      if (isDemoPreview) {
        previewImg.src = compressed.dataUrl;
        previewImg.classList.remove('hide');
        clearBtn.classList.remove('hide');
        if (photoUrlInput) {
          photoUrlInput.dataset.uploadedDataUrl = compressed.dataUrl;
          if (photoUrlInput.type === 'hidden') photoUrlInput.value = compressed.dataUrl;
        }
        if (evidenceIdInput) {
          evidenceIdInput.dataset.uploadedDataUrl = compressed.dataUrl;
        }
        const demoSizeKb = Math.max(1, Math.round(compressed.size / 1024));
        statusLine.textContent = `แนบภาพเรียบร้อย (${demoSizeKb} KB) • ตัวอย่างภาพในโหมดทดลอง (เก็บเฉพาะในเครื่องนี้ ไม่ได้อัปโหลดขึ้นเซิร์ฟเวอร์)`;
        notify('โหลดภาพตัวอย่างในโหมดทดลองเรียบร้อย');
        return;
      }

      if (compressed.size > 5 * 1024 * 1024) {
        throw new Error('ไฟล์ภาพหลังบีบอัดยังมีขนาดเกิน 5 MB กรุณาเลือกภาพที่เล็กลง');
      }

      const plotId = getPlotId();
      cameraBtn.disabled = true;
      galleryBtn.disabled = true;
      statusLine.textContent = 'กำลังอัปโหลด... 0%';

      const uploaded = await uploadEvidenceWithProgress(compressed.blob, {
        plotId,
        entityType,
        onProgress: (pct) => { statusLine.textContent = `กำลังอัปโหลด... ${pct}%`; },
      });

      if (evidenceIdInput) evidenceIdInput.value = String(uploaded.id);
      previewImg.src = compressed.dataUrl;
      previewImg.classList.remove('hide');
      clearBtn.classList.remove('hide');
      const sizeKb = Math.max(1, Math.round((uploaded.size_bytes || compressed.size) / 1024));
      statusLine.textContent = `อัปโหลดขึ้นระบบแล้ว (หลักฐาน #${uploaded.id} • ${sizeKb} KB)`;
      notify('อัปโหลดภาพหลักฐานสำเร็จ');
    } catch (err) {
      statusLine.classList.add('hide');
      errorLine.textContent = err?.message || 'ไม่สามารถอัปโหลดภาพได้ กรุณาลองใหม่';
      errorLine.classList.remove('hide');
    } finally {
      cameraBtn.disabled = false;
      galleryBtn.disabled = false;
    }
  };

  galleryInput.onchange = () => handleSelectedFile(galleryInput.files?.[0]);
  cameraInput.onchange = () => handleSelectedFile(cameraInput.files?.[0]);

  const previewWrap = el('div', { className: 'photo-preview-wrap' },
    el('div', { className: 'photo-upload-actions' }, cameraBtn, galleryBtn, clearBtn),
    cameraInput,
    galleryInput,
    previewImg,
    statusLine,
    errorLine,
    el('small', { className: isDemoPreview ? 'muted demo-note' : 'muted' },
      isDemoPreview
        ? 'โหมดทดลอง: ตัวอย่างภาพเก็บเฉพาะในเครื่องนี้ (ไม่ได้อัปโหลดขึ้นเซิร์ฟเวอร์)'
        : 'รองรับ JPEG/PNG/WebP ระบบจะย่อขนาดอัตโนมัติก่อนอัปโหลดขึ้นเซิร์ฟเวอร์อย่างปลอดภัย (สูงสุด 5 MB)'
    )
  );
  return previewWrap;
}
