'use strict';

import { token, config, demoUser, setConfig, demoBackend, demoSession, $ } from './state.js';
import { el, notify } from './dom.js';

export async function loadConfig() {
  if (config?.liffId || config?.development || config?.demoOnly) return config;
  const response = await fetch('/api/config', { cache: 'no-store' });
  if (!response.ok) throw new Error('โหลดคอนฟิกไม่สำเร็จ');
  const data = await response.json();
  setConfig(data);
  return data;
}

export async function api(path, method = 'GET', body) {
  // Demo mode: answered locally, never sent to the backend (no token, no Admin API).
  const activeDemo = demoUser || (demoSession && !token ? demoSession.restore() : null);
  if (activeDemo) return demoBackend.request(activeDemo, path, method, body ?? {});
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'เกิดข้อผิดพลาด');
    error.code = data.code; error.status = response.status;
    if (response.status === 401 && token) {
      if (typeof window.__pakMaiiOnSessionExpired === 'function') {
        window.__pakMaiiOnSessionExpired();
      }
      error.handled = true;
    }
    throw error;
  }
  return data;
}

export function exportCsv(filename, headers, rows) {
  const escapeCsv = (str) => `"${String(str ?? '').replace(/"/g, '""')}"`;
  const content = [
    headers.map(escapeCsv).join(','),
    ...rows.map(row => row.map(escapeCsv).join(','))
  ].join('\r\n');
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  notify(`ดาวน์โหลดไฟล์ ${filename} เรียบร้อย`);
}
