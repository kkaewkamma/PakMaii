'use strict';

let token = sessionStorage.getItem('token');
let me = null;
let plots = [];
let tab = 'home';
let lastInvitation = null;
let config = null;
let liffInitPromise = null;
let demoUser = null;
let loginRole = 'farmer';

// Demo store is client-side only (public/demo.js); it never issues server sessions.
const demoApi = window.ReadyToGrowDemo || null;
const demoBackend = demoApi ? demoApi.createDemoBackend() : null;
const demoSession = demoBackend ? demoApi.createDemoSession(demoBackend, sessionStorage) : null;

const $ = selector => document.querySelector(selector);
const roleLabels = { farmer: 'Farmer', ics: 'ICS Officer', admin: 'System Admin' };
const statusLabels = { active: 'เปิดใช้งาน', unlinked: 'รอผูก LINE', disabled: 'ระงับ', used: 'ใช้แล้ว', expired: 'หมดอายุ', revoked: 'เพิกถอนแล้ว' };

// SVG Icon definition dictionary (24x24 viewBox, stroke-based)
const ICONS = {
  sprout: [
    { type: 'path', d: 'M7 20h10' },
    { type: 'path', d: 'M12 20v-8' },
    { type: 'path', d: 'M12 12c0-3 2.5-5.5 5.5-5.5.5 0 1 .05 1.5.15C19 9.5 16.5 12 12 12z' },
    { type: 'path', d: 'M12 15c0-3-2.5-5.5-5.5-5.5-.5 0-1 .05-1.5.15C5 12.5 7.5 15 12 15z' },
  ],
  leaf: [
    { type: 'path', d: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 3.5 1 9.2A7 7 0 0 1 11 20z' },
    { type: 'path', d: 'M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12' },
  ],
  clipboard: [
    { type: 'path', d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' },
    { type: 'path', d: 'M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z' },
    { type: 'path', d: 'M9 12h6' },
    { type: 'path', d: 'M9 16h6' },
  ],
  check: [
    { type: 'path', d: 'M20 6L9 17l-5-5' },
  ],
  checkCircle: [
    { type: 'path', d: 'M22 11.08V12a10 10 0 1 1-5.93-9.14' },
    { type: 'path', d: 'M22 4L12 14.01l-3-3' },
  ],
  x: [
    { type: 'path', d: 'M18 6L6 18' },
    { type: 'path', d: 'M6 6l12 12' },
  ],
  xCircle: [
    { type: 'circle', cx: '12', cy: '12', r: '10' },
    { type: 'path', d: 'M15 9l-6 6' },
    { type: 'path', d: 'M9 9l6 6' },
  ],
  clock: [
    { type: 'circle', cx: '12', cy: '12', r: '10' },
    { type: 'path', d: 'M12 6v6l4 2' },
  ],
  alert: [
    { type: 'path', d: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' },
    { type: 'line', x1: '12', y1: '9', x2: '12', y2: '13' },
    { type: 'line', x1: '12', y1: '17', x2: '12.01', y2: '17' },
  ],
  edit: [
    { type: 'path', d: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' },
    { type: 'path', d: 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' },
  ],
  plus: [
    { type: 'line', x1: '12', y1: '5', x2: '12', y2: '19' },
    { type: 'line', x1: '5', y1: '12', x2: '19', y2: '12' },
  ],
  search: [
    { type: 'circle', cx: '11', cy: '11', r: '8' },
    { type: 'line', x1: '21', y1: '21', x2: '16.65', y2: '16.65' },
  ],
  refresh: [
    { type: 'path', d: 'M23 4v6h-6' },
    { type: 'path', d: 'M1 20v-6h6' },
    { type: 'path', d: 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' },
  ],
  package: [
    { type: 'path', d: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z' },
    { type: 'path', d: 'M3.27 6.96L12 12.01l8.73-5.05' },
    { type: 'line', x1: '12', y1: '22.08', x2: '12', y2: '12' },
  ],
  calendar: [
    { type: 'rect', x: '3', y: '4', width: '18', height: '18', rx: '2', ry: '2' },
    { type: 'line', x1: '16', y1: '2', x2: '16', y2: '6' },
    { type: 'line', x1: '8', y1: '2', x2: '8', y2: '6' },
    { type: 'line', x1: '3', y1: '10', x2: '21', y2: '10' },
  ],
  user: [
    { type: 'path', d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' },
    { type: 'circle', cx: '12', cy: '7', r: '4' },
  ],
  users: [
    { type: 'path', d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' },
    { type: 'circle', cx: '9', cy: '7', r: '4' },
    { type: 'path', d: 'M23 21v-2a4 4 0 0 0-3-3.87' },
    { type: 'path', d: 'M16 3.13a4 4 0 0 1 0 7.75' },
  ],
  mapPin: [
    { type: 'path', d: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z' },
    { type: 'circle', cx: '12', cy: '10', r: '3' },
  ],
  message: [
    { type: 'path', d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  ],
  shield: [
    { type: 'path', d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
    { type: 'path', d: 'M9 12l2 2 4-4' },
  ],
  camera: [
    { type: 'path', d: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z' },
    { type: 'circle', cx: '12', cy: '13', r: '4' },
  ],
  logOut: [
    { type: 'path', d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' },
    { type: 'path', d: 'M16 17l5-5-5-5' },
    { type: 'line', x1: '21', y1: '12', x2: '9', y2: '12' },
  ],
  logIn: [
    { type: 'path', d: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4' },
    { type: 'path', d: 'M10 17l5-5-5-5' },
    { type: 'line', x1: '15', y1: '12', x2: '3', y2: '12' },
  ],
  info: [
    { type: 'circle', cx: '12', cy: '12', r: '10' },
    { type: 'line', x1: '12', y1: '16', x2: '12', y2: '12' },
    { type: 'line', x1: '12', y1: '8', x2: '12.01', y2: '8' },
  ],
  mic: [
    { type: 'path', d: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z' },
    { type: 'path', d: 'M19 10v2a7 7 0 0 1-14 0v-2' },
    { type: 'line', x1: '12', y1: '19', x2: '12', y2: '23' },
    { type: 'line', x1: '8', y1: '23', x2: '16', y2: '23' }
  ],
  printer: [
    { type: 'path', d: 'M6 9V2h12v7' },
    { type: 'path', d: 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2' },
    { type: 'path', d: 'M6 14h12v8H6z' }
  ],
  fileText: [
    { type: 'path', d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
    { type: 'path', d: 'M14 2v6h6' },
    { type: 'line', x1: '16', y1: '13', x2: '8', y2: '13' },
    { type: 'line', x1: '16', y1: '17', x2: '8', y2: '17' },
    { type: 'line', x1: '10', y1: '9', x2: '8', y2: '9' }
  ],
  moreHorizontal: [
    { type: 'circle', cx: '12', cy: '12', r: '1.5' },
    { type: 'circle', cx: '19', cy: '12', r: '1.5' },
    { type: 'circle', cx: '5', cy: '12', r: '1.5' }
  ]
};

// Safe pure DOM SVG icon builder — no innerHTML
function icon(name, size = 16, className = 'ui-icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (className) svg.setAttribute('class', className);

  const shapes = ICONS[name] || ICONS.sprout;
  for (const item of shapes) {
    const elNode = document.createElementNS('http://www.w3.org/2000/svg', item.type || 'path');
    for (const [attr, val] of Object.entries(item)) {
      if (attr !== 'type') elNode.setAttribute(attr, val);
    }
    svg.appendChild(elNode);
  }
  return svg;
}

function parseLocalIsoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const match = typeof value === 'string' && value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  return null;
}

function formatLocalIsoDate(date) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}

// 14-Day Rhythm Track — "สมุดบันทึกแปลงที่ตรวจสอบได้" (Audit-ready Farm Ledger)
// Pure DOM, 100% CSP safe, no inline styles or innerHTML
function create14DayRhythmTrack(plotId, activities = [], options = {}) {
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

// Accessible Status Badge (always icon + text, never color alone)
function statusBadge(tier, text, customIcon) {
  const normalized = tier === 'risk' ? 'risk' : tier === 'warn' || tier === 'warning' ? 'warning' : 'normal';
  const iconName = customIcon || (normalized === 'risk' ? 'alert' : normalized === 'warning' ? 'clock' : 'checkCircle');
  return el('span', { className: `badge-${normalized}` }, icon(iconName, 12), ' ', text);
}

const tabsFarmer = [
  ['home', 'ภาพรวม', 'sprout'],
  ['plots', 'แปลงปลูก', 'mapPin'],
  ['record', 'บันทึกกิจกรรม', 'calendar'],
  ['approval', 'คำขอปัจจัย', 'clipboard'],
  ['reviews', 'ผลตรวจแปลง', 'shield'],
  ['lots', 'ล็อตผลผลิต', 'package']
];
const tabsIcs = [
  ['home', 'ภาพรวม', 'sprout'],
  ['plots', 'แปลงเกษตรกร', 'mapPin'],
  ['record', 'กิจกรรม', 'calendar'],
  ['approval', 'พิจารณาคำขอ', 'clipboard'],
  ['risks', 'ความเสี่ยง', 'alert'],
  ['lots', 'ล็อตผลผลิต', 'package'],
  ['reviews', 'ผลตรวจ', 'shield']
];
const tabsIcsDemo = [
  ['farmers', 'เกษตรกรในดูแล', 'users'],
  ...tabsIcs
];
const tabsAdmin = [
  ['overview', 'ภาพรวมระบบ', 'sprout'],
  ['invites', 'คำเชิญลงทะเบียน', 'user'],
  ['users', 'ผู้ใช้งาน', 'users'],
  ['assignments', 'มอบหมาย Farmer', 'clipboard']
];

function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'className') node.className = value;
    else if (name.startsWith('on') && typeof value === 'function') node.addEventListener(name.slice(2), value);
    else if (value === true) node.setAttribute(name, '');
    else if (value !== false && value !== null && value !== undefined) node.setAttribute(name, String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function notify(message) {
  const toast = $('#toast');
  toast.textContent = String(message);
  toast.classList.add('show');
  setTimeout(() => { toast.classList.remove('show'); }, 4000);
}

function clearSession() {
  token = null; me = null; plots = []; lastInvitation = null; demoUser = null; tab = 'home';
  sessionStorage.removeItem('token');
  demoSession?.logout();
}

async function loadConfig() {
  if (config?.liffId || config?.development || config?.demoOnly) return config;
  const response = await fetch('/api/config', { cache: 'no-store' });
  if (!response.ok) throw new Error('โหลดคอนฟิกไม่สำเร็จ');
  config = await response.json();
  return config;
}

async function ensureLiff() {
  const cfg = await loadConfig();
  if (cfg.development) return null;
  if (!cfg.liffId) throw new Error('ยังไม่ได้ตั้งค่า LIFF ID สำหรับ environment นี้');
  for (let i = 0; i < 20 && !window.liff; i++) await new Promise(r => setTimeout(r, 100));
  if (!window.liff) throw new Error('โหลด LINE LIFF SDK ไม่สำเร็จ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่');
  liffInitPromise ||= window.liff.init({ liffId: cfg.liffId });
  await liffInitPromise;
  return window.liff;
}

function showState(title, message, actionLabel, action) {
  $('#tabs').classList.add('hide');
  $('#mobile-dock')?.classList.add('hide');
  $('#content').replaceChildren();
  const box = el('div', { className: 'notice' }, el('b', {}, title), el('p', {}, message));
  if (actionLabel) box.append(el('button', { type: 'button', onclick: action }, actionLabel));
  $('#identity').replaceChildren(box);
}

async function api(path, method = 'GET', body) {
  // Demo mode: answered locally, never sent to the backend (no token, no Admin API).
  if (demoUser) return demoBackend.request(demoUser, path, method, body ?? {});
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'เกิดข้อผิดพลาด');
    error.code = data.code; error.status = response.status;
    if (response.status === 401 && token) {
      clearSession();
      showState('เซสชันหมดอายุ', 'กรุณาเข้าสู่ระบบผ่าน LINE อีกครั้ง', 'เข้าสู่ระบบใหม่', () => start(true));
      error.handled = true;
    }
    throw error;
  }
  return data;
}

async function acceptLogin(data) {
  demoUser = null;
  demoSession?.logout();
  sessionStorage.removeItem('admin_login');
  token = data.token;
  sessionStorage.setItem('token', token);
  tab = data.redirectTo || 'home';
  await start();
}

async function acceptDemoLogin(role, code) {
  clearSession();
  sessionStorage.removeItem('logged_out');
  demoUser = demoSession.login(role, code);
  loginRole = demoUser.role;
  tab = 'home';
  await start();
}

async function logout() {
  try { if (token) await api('/logout', 'POST', {}); }
  catch (error) { if (!error.handled) notify(error.message); }
  finally {
    clearSession();
    sessionStorage.removeItem('admin_login');
    sessionStorage.setItem('logged_out', '1');
    notify('ออกจากระบบแล้ว');
    const cfg = await loadConfig().catch(() => null);
    showLogin(Boolean(cfg?.development));
  }
}

function inputField(name, label, type = 'text', required = true, value = '') {
  return el('label', {}, label, el('input', { name, type, required, value, maxlength: type === 'text' ? 200 : null }));
}

function selectField(name, label, choices) {
  return el('label', {}, label, el('select', { name, required: true }, choices.map(choice => el('option', { value: choice.value }, choice.label))));
}

function card(...children) { return el('div', { className: 'card' }, children); }
function empty(message = 'ยังไม่มีข้อมูล', actionLabel = '', onAction = null) {
  return card(el('div', { className: 'empty-box' },
    el('div', { className: 'empty-icon-wrap' }, icon('leaf', 24)),
    el('p', { className: 'empty-text' }, message),
    actionLabel && typeof onAction === 'function'
      ? el('button', { type: 'button', className: 'secondary btn-sm', onclick: onAction }, actionLabel)
      : null
  ));
}

function showRegistration(idToken) {
  const form = el('form', {},
    inputField('agencyCode', 'รหัสประจำตัวจากหน่วยงาน'),
    inputField('invitationToken', 'รหัสเชิญ'),
    el('button', { type: 'submit' }, 'ผูกบัญชี LINE'));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    try { await acceptLogin(await api('/auth/register/invite', 'POST', { ...values, idToken })); }
    catch (error) {
      if (error.status === 400) notify('รหัสเชิญไม่ถูกต้อง หมดอายุ ถูกเพิกถอน หรือถูกใช้แล้ว');
      else if (!error.handled) notify(error.status === 403 ? 'บัญชีถูกปิดหรือยังไม่พร้อมใช้งาน' : error.message);
    }
  });
  const copyBtn = el('button', {
    type: 'button',
    className: 'secondary',
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(idToken);
        notify('คัดลอก Token สำหรับ Admin CLI แล้ว');
      } catch {
        notify('คัดลอกไม่สำเร็จ');
      }
    }
  }, 'คัดลอก Token สำหรับ Admin CLI');
  $('#identity').replaceChildren(el('div', { className: 'notice' },
    el('b', {}, 'ลงทะเบียนครั้งแรก'),
    el('p', {}, 'กรอกรหัสประจำตัวและรหัสเชิญจาก Admin หรือคัดลอก Token สำหรับผู้ดูแลระบบ'),
    form,
    el('p', {}, copyBtn)
  ));
}

function showLogin(development) {
  $('#tabs').classList.add('hide');
  $('#mobile-dock')?.classList.add('hide');
  $('#content').replaceChildren();
  $('#welcome').textContent = 'เข้าสู่ระบบทดลองใช้งาน';
  document.body.classList.add('is-login');

  const codeInput = el('input', {
    id: 'demoCode', name: 'agencyCode', type: 'text', required: true, maxlength: 32,
    autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false',
    placeholder: loginRole === 'ics' ? 'เช่น ICS-STG-001' : 'เช่น F-STG-001'
  });

  const roleButton = (role, iconName, title, subtitle) => el('button', {
    type: 'button', id: `demoRole-${role}`, role: 'radio', className: 'role-option',
    'aria-checked': loginRole === role ? 'true' : 'false',
    onclick: () => { loginRole = role; showLogin(development); $('#demoCode')?.focus(); },
  },
    el('div', { className: 'role-icon-box' }, icon(iconName, 20)),
    el('div', { className: 'role-check-indicator' }, icon('check', 11)),
    el('span', { className: 'role-title' }, title),
    el('span', { className: 'role-sub' }, subtitle)
  );

  const chips = demoApi ? demoApi.sampleCodes(loginRole).map(code => el('button', {
    type: 'button', className: 'chip', onclick: () => { codeInput.value = code; codeInput.focus(); }
  }, code)) : [];

  const form = el('form', { id: 'demoLoginForm', className: 'login-form', novalidate: true },
    el('div', { className: 'role-switch', role: 'radiogroup', 'aria-label': 'เลือกบทบาท' },
      roleButton('farmer', 'sprout', 'Farmer', 'เกษตรกรผู้ปลูก'),
      roleButton('ics', 'clipboard', 'ICS', 'เจ้าหน้าที่ตรวจสอบ')),
    el('label', { for: 'demoCode' }, 'รหัสประจำตัว Demo'),
    codeInput,
    chips.length ? el('div', { className: 'chips' }, el('span', { className: 'muted' }, 'ตัวอย่าง:'), chips) : null,
    el('button', { type: 'submit', id: 'demoLoginButton', className: 'btn-lg', disabled: !demoBackend },
      icon('logIn', 18), 'เข้าสู่ระบบ Demo')
  );

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try { await acceptDemoLogin(loginRole, codeInput.value); }
    catch (error) { notify(error.message); codeInput.focus(); }
    finally { if (btn) btn.disabled = !demoBackend; }
  });

  const adminBtn = config?.demoOnly
    ? null
    : el('button', {
        type: 'button', id: 'adminLoginButton', className: 'link-btn',
        onclick: () => (development ? showAdminLogin(true) : adminLineLogin())
      }, 'Admin Login');

  const footer = el('div', { className: 'login-footer' },
    el('button', {
      type: 'button',
      id: 'demoResetButton',
      className: 'link-btn',
      onclick: () => {
        if (confirm('ต้องการรีเซ็ตข้อมูล Demo ทั้งหมดกลับเป็นค่าเริ่มต้นหรือไม่?\n(ข้อมูลแปลงและกิจกรรมที่คุณเพิ่มระหว่างทดลองจะถูกล้าง)')) {
          demoBackend?.reset();
          notify('รีเซ็ตข้อมูล Demo กลับเป็นค่าเริ่มต้นเรียบร้อย');
        }
      }
    }, icon('refresh', 13), 'รีเซ็ตข้อมูล Demo'),
    adminBtn
  );

  const quickPersonas = el('div', { className: 'quick-persona-box' },
    el('div', { className: 'quick-persona-title' }, 'ทดลองใช้งานด่วนตามบทบาท'),
    el('div', { className: 'quick-persona-grid' },
      el('button', {
        type: 'button',
        className: 'persona-card-btn',
        onclick: () => acceptDemoLogin('farmer', 'F-STG-001')
      },
        el('div', { className: 'persona-badge risk' }, 'แปลง A-03 • ขาดบันทึก 14 วัน'),
        el('b', {}, 'เกษตรกร 01 (F-STG-001)'),
        el('small', {}, 'บันทึกกิจกรรมเพื่อแก้ความเสี่ยงของแปลง')
      ),
      el('button', {
        type: 'button',
        className: 'persona-card-btn',
        onclick: () => acceptDemoLogin('farmer', 'F-STG-002')
      },
        el('div', { className: 'persona-badge warn' }, 'แปลง B-01 • รออนุมัติปัจจัย'),
        el('b', {}, 'เกษตรกร 02 (F-STG-002)'),
        el('small', {}, 'ยื่นคำขอใช้ปุ๋ยหมักอินทรีย์ก่อนใช้งานจริง')
      ),
      el('button', {
        type: 'button',
        className: 'persona-card-btn persona-ics',
        onclick: () => acceptDemoLogin('ics', 'ICS-STG-001')
      },
        el('div', { className: 'persona-badge ics' }, 'ผู้ตรวจประเมิน ICS'),
        el('b', {}, 'เจ้าหน้าที่ ICS (ICS-STG-001)'),
        el('small', {}, 'ตรวจรายการแปลงต้องติดตาม อนุมัติปัจจัย และบันทึกผลตรวจ')
      )
    )
  );

  $('#identity').replaceChildren(el('div', { className: 'login-card' },
    el('div', { className: 'login-card-header' },
      el('span', { className: 'pill success' }, icon('shield', 12), ' สมุดบันทึกแปลงที่ตรวจสอบได้'),
      el('p', { className: 'muted login-lead' }, 'เลือกบทบาท แล้วแตะรหัสตัวอย่าง หรือเลือกบัญชีทดลองด้านล่าง')
    ),
    form,
    el('div', { className: 'login-divider' }, el('span', {}, 'หรือเข้าใช้งานทันทีด้วยบัญชีตัวอย่าง')),
    quickPersonas,
    el('p', { className: 'login-note' }, icon('shield', 14), ' ข้อมูลทดลองเก็บในเบราว์เซอร์นี้เท่านั้น แยกจากข้อมูลจริงทั้งหมด'),
    footer
  ));
}

async function completeLineLogin(liff) {
  sessionStorage.removeItem('admin_login');
  const idToken = liff.getIDToken();
  if (!idToken) return showState('ไม่พบ LINE Identity', 'กรุณาเปิด LIFF พร้อมสิทธิ์ openid', 'กลับหน้าเข้าสู่ระบบ', () => start(true));
  try { return await acceptLogin(await api('/login', 'POST', { idToken })); }
  catch (error) {
    if (error.code === 'REGISTRATION_REQUIRED') return showRegistration(idToken);
    if (!error.handled) showState('เข้าสู่ระบบไม่สำเร็จ', error.status === 403 ? 'บัญชีถูกปิดหรือยังไม่พร้อมใช้งาน' : error.message, 'กลับหน้าเข้าสู่ระบบ', () => start(true));
  }
}

// Admin keeps the original LINE Login (LIFF) flow; flag survives the LINE redirect.
async function adminLineLogin() {
  try {
    clearSession();
    sessionStorage.removeItem('logged_out');
    sessionStorage.setItem('admin_login', '1');
    const liff = await ensureLiff();
    if (!liff.isLoggedIn()) return liff.login();
    await completeLineLogin(liff);
  } catch (error) {
    sessionStorage.removeItem('admin_login');
    if (!error.handled) notify(error.message);
  }
}

function showAdminLogin(development) {
  $('#tabs').classList.add('hide');
  $('#mobile-dock')?.classList.add('hide');
  $('#content').replaceChildren();
  $('#welcome').textContent = 'Admin Login';
  const form = el('form', {},
    development ? inputField('agencyCode', 'รหัสประจำตัวจากหน่วยงาน', 'text', true) : null,
    development ? inputField('password', 'รหัสผ่าน Super User (เฉพาะ Admin)', 'password', false) : null,
    el('button', { type: 'submit' }, development ? 'เข้าสู่ระบบ Development' : 'เข้าสู่ระบบด้วย LINE'));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      sessionStorage.removeItem('logged_out');
      if (!development) {
        const liff = await ensureLiff();
        if (!liff.isLoggedIn()) return liff.login();
        const idToken = liff.getIDToken();
        if (!idToken) return showState('ไม่พบ LINE Identity', 'กรุณาเปิด LIFF พร้อมสิทธิ์ openid');
        return await acceptLogin(await api('/login', 'POST', { idToken }));
      }
      const values = Object.fromEntries(new FormData(form));
      const result = values.password
        ? await api('/auth/admin/password-login', 'POST', values)
        : await api('/dev/login', 'POST', { agencyCode: values.agencyCode });
      await acceptLogin(result);
    } catch (error) {
      if (error.code === 'REGISTRATION_REQUIRED' && !development) {
        const liff = await ensureLiff().catch(() => null);
        return showRegistration(liff?.getIDToken());
      }
      if (!error.handled) notify(error.status === 403 ? 'บัญชีถูกปิดหรือยังไม่พร้อมใช้งาน' : error.message);
    }
  });
  $('#identity').replaceChildren(el('div', { className: 'notice' }, el('b', {}, 'เข้าสู่ระบบ Ready to Grow'), form,
    el('small', {}, development ? 'Development Mode เฉพาะ localhost' : 'Farmer, ICS และ Admin ใช้ LINE Login'),
    el('p', {}, el('button', { type: 'button', className: 'link-btn', onclick: () => showLogin(development) }, '← กลับไปหน้า Demo'))));
}

async function start(forceLogin = false) {
  try {
    if (forceLogin) {
      clearSession();
      sessionStorage.removeItem('logged_out');
      sessionStorage.removeItem('admin_login');
    }
    if (!token && !demoUser && demoSession) demoUser = demoSession.restore();
    if (!token && !demoUser) {
      const cfg = await loadConfig().catch(() => ({ liffId: '', development: false, demoOnly: false }));
      if (cfg.demoOnly) return showLogin(false);
      // Demo-first: only resume LINE when Admin Login was explicitly started.
      if (cfg.development || sessionStorage.getItem('admin_login') !== '1') return showLogin(Boolean(cfg.development));
      const liff = await ensureLiff();
      if (!liff.isLoggedIn() || sessionStorage.getItem('logged_out') === '1') {
        sessionStorage.removeItem('admin_login');
        return showLogin(false);
      }
      return await completeLineLogin(liff);
    }
    document.body.classList.remove('is-login');
    me = await api('/me');
    if (me.role === 'admin' && !tabsAdmin.some(item => item[0] === tab)) tab = 'overview';
    if (me.role !== 'admin' && !currentTabs().some(item => item[0] === tab)) tab = 'home';
    plots = me.role === 'admin' ? [] : await api('/plots');
    
    $('#welcome').textContent = `สวัสดี, ${me.name}`;
    const roleIconName = me.role === 'farmer' ? 'sprout' : (me.role === 'ics' ? 'clipboard' : 'shield');
    
    const switcherBar = demoUser ? el('div', { className: 'role-switcher-bar' },
      el('span', { className: 'switcher-label' }, icon('refresh', 13), ' สลับบัญชีทดสอบ:'),
      el('button', {
        type: 'button',
        className: `switcher-pill ${me.agency_code === 'F-STG-001' ? 'active' : ''}`,
        onclick: () => acceptDemoLogin('farmer', 'F-STG-001')
      }, 'เกษตรกร A-03 (F-STG-001)'),
      el('button', {
        type: 'button',
        className: `switcher-pill ${me.agency_code === 'F-STG-002' ? 'active' : ''}`,
        onclick: () => acceptDemoLogin('farmer', 'F-STG-002')
      }, 'เกษตรกร B-01 (F-STG-002)'),
      el('button', {
        type: 'button',
        className: `switcher-pill ${me.agency_code === 'F-STG-003' ? 'active' : ''}`,
        onclick: () => acceptDemoLogin('farmer', 'F-STG-003')
      }, 'เกษตรกร C-12 (F-STG-003)'),
      el('button', {
        type: 'button',
        className: `switcher-pill switcher-ics ${me.role === 'ics' ? 'active' : ''}`,
        onclick: () => {
          tab = 'home';
          acceptDemoLogin('ics', 'ICS-STG-001');
        }
      }, 'ผู้ตรวจประเมิน ICS (ICS-STG-001)')
    ) : null;

    $('#identity').replaceChildren(
      el('div', { className: 'identity-bar' },
        el('div', { className: 'identity-info' },
          el('div', { className: 'user-avatar' }, icon(roleIconName, 18)),
          el('div', { className: 'identity-meta' },
            el('div', { className: 'user-code' },
              demoUser ? el('span', { className: 'demo-badge' }, 'DEMO') : null,
              me.agency_code || me.name
            ),
            el('div', { className: 'user-role-text' }, `${roleLabels[me.role] || me.role} • ${statusLabels[me.status] || me.status}`)
          )
        ),
        el('button', { type: 'button', id: 'logoutButton', className: 'secondary btn-sm', onclick: logout },
          icon('logOut', 14),
          demoUser ? 'ออกจากโหมดทดลอง' : 'ออกจากระบบ'
        )
      ),
      switcherBar
    );

    renderTabs();
    await loadTab();
  } catch (error) {
    if (!error.handled) showState('เกิดข้อผิดพลาด', error.message, 'ลองใหม่', () => start());
  }
}

function createVoiceInput(textarea) {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    return el('div', { className: 'voice-mic-bar hide' });
  }

  const voiceBtn = el('button', {
    type: 'button',
    className: 'voice-btn',
    title: 'กดเพื่อพูดภาษาไทย'
  }, icon('mic', 14), ' บันทึกด้วยเสียง');

  let recognition = null;
  try {
    recognition = new SpeechRec();
    recognition.lang = 'th-TH';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      voiceBtn.classList.add('recording');
      voiceBtn.textContent = 'กำลังรับฟังเสียง...';
    };

    recognition.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript || '';
      if (transcript) {
        textarea.value = (textarea.value ? textarea.value + ' ' : '') + transcript;
        notify(`แปลงเสียงสำเร็จ: "${transcript}"`);
      }
    };

    recognition.onerror = () => {
      voiceBtn.classList.remove('recording');
      voiceBtn.replaceChildren(icon('mic', 14), document.createTextNode(' บันทึกด้วยเสียง'));
      notify('อุปกรณ์นี้ยังใช้การพิมพ์ด้วยเสียงไม่ได้ กรุณาพิมพ์แทน');
    };

    recognition.onend = () => {
      voiceBtn.classList.remove('recording');
      voiceBtn.replaceChildren(icon('mic', 14), document.createTextNode(' บันทึกด้วยเสียง'));
    };
  } catch {
    return el('div', { className: 'voice-mic-bar hide' });
  }

  voiceBtn.onclick = () => {
    if (recognition) {
      try {
        recognition.start();
      } catch {
        notify('อุปกรณ์นี้ยังใช้การพิมพ์ด้วยเสียงไม่ได้ กรุณาพิมพ์แทน');
      }
    } else {
      notify('อุปกรณ์นี้ยังใช้การพิมพ์ด้วยเสียงไม่ได้ กรุณาพิมพ์แทน');
    }
  };

  return el('div', { className: 'voice-mic-bar' }, voiceBtn);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });
}

function compressImage(file, maxDimension = 1200, quality = 0.8) {
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

async function compressImageToBlob(file, maxDimension = 1200, quality = 0.8) {
  const dataUrl = await compressImage(file, maxDimension, quality);
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return { blob, dataUrl, contentType: blob.type || 'image/jpeg', size: blob.size };
}

function uploadEvidenceWithProgress(blob, { plotId, entityType = 'activity', onProgress } = {}) {
  return new Promise((resolve, reject) => {
    if (!plotId) {
      reject(new Error('กรุณาเลือกแปลงปลูกก่อนอัปโหลดภาพหลักฐาน'));
      return;
    }
    const xhr = new XMLHttpRequest();
    const qs = `plot_id=${encodeURIComponent(String(plotId))}&entity_type=${encodeURIComponent(String(entityType))}`;
    xhr.open('POST', `/api/evidence?${qs}`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
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

async function openEvidenceViewer(evidenceId) {
  const overlay = el('div', { className: 'passport-overlay' });
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
      el('button', { type: 'button', className: 'passport-close-btn', onclick: () => overlay.remove() }, 'ปิดหน้าต่าง')
    )
  );
  overlay.append(cardNode);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.append(overlay);

  try {
    const response = await fetch(`/api/evidence/${encodeURIComponent(String(evidenceId))}/content`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
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

function createPhotoUploader(photoUrlInput, options = {}) {
  const entityType = options.entityType || 'activity';
  const getPlotId = typeof options.getPlotId === 'function' ? options.getPlotId : () => null;
  const evidenceIdInput = options.evidenceIdInput || null;

  const isDemoPreview = Boolean(demoUser);
  const realUploadReady = !isDemoPreview && Boolean(config?.evidenceUploadEnabled);

  if (!isDemoPreview && !realUploadReady) {
    return el('div', { className: 'photo-preview-wrap' },
      el('small', { className: 'muted' }, 'ระบบอัปโหลดภาพขึ้น R2 ยังไม่เปิดใช้งานในสภาพแวดล้อมนี้ (สามารถแนบลิงก์ HTTPS ด้านบนได้หากมี)')
    );
  }

  const galleryInput = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/*', className: 'hide' });
  const cameraInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment', className: 'hide' });
  const previewImg = el('img', { className: 'photo-preview-img hide', alt: 'ตัวอย่างหลักฐานภาพถ่าย' });
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
      if (photoUrlInput && !photoUrlInput.value.startsWith('https://')) photoUrlInput.value = '';
      if (evidenceIdInput) evidenceIdInput.value = '';
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
      const compressed = await compressImageToBlob(file, 1200, 0.8);
      if (isDemoPreview) {
        previewImg.src = compressed.dataUrl;
        previewImg.classList.remove('hide');
        clearBtn.classList.remove('hide');
        if (photoUrlInput) photoUrlInput.value = compressed.dataUrl;
        statusLine.textContent = 'ตัวอย่างภาพในโหมดทดลอง (เก็บเฉพาะในเครื่องนี้ ไม่ได้อัปโหลดขึ้นเซิร์ฟเวอร์)';
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

async function showStoryPassport(lot) {
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

function showPublicTraceabilityProposal(lot) {
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

function sharePlotRiskToLine(w) {
  const text = `[แจ้งเตือนมาตรฐานเกษตรอินทรีย์ ผักไหม (PGS/ICS)]\n` +
    `แปลง: ${w.code} (${w.crop || 'อินทรีย์'})\n` +
    `เกษตรกร: ${w.farmer}\n` +
    `สถานะ: ${w.status}\n` +
    `คำแนะนำ: กรุณาเข้าบันทึกกิจกรรมในแปลงผ่านระบบ Ready to Grow เพื่อรักษามาตรฐานกลุ่ม\n` +
    `เข้าใช้งาน: ${window.location.origin}`;
  const url = `https://line.me/R/msg/text/?${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function exportCsv(filename, headers, rows) {
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

function currentTabs() {
  return me.role === 'admin' ? tabsAdmin : me.role === 'ics' ? (demoUser ? tabsIcsDemo : tabsIcs) : tabsFarmer;
}

function renderTabs() {
  const items = currentTabs();
  $('#tabs').replaceChildren(...items.map(([id, label, iconName]) =>
    el('button', {
      type: 'button',
      className: tab === id ? 'active' : '',
      onclick: async () => { tab = id; renderTabs(); await loadTab(); }
    },
      icon(iconName || 'sprout', 15),
      label
    )
  ));
  $('#tabs').classList.remove('hide');
  renderMobileDock();
}

function openMoreSheet(secondaryItems) {
  $('.more-sheet-overlay')?.remove();
  const closeSheet = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKeyDown);
  };
  const onKeyDown = (e) => {
    if (e.key === 'Escape') closeSheet();
  };
  document.addEventListener('keydown', onKeyDown);

  const navList = el('div', { className: 'more-sheet-nav' },
    ...secondaryItems.map(([id, label, iconName]) =>
      el('button', {
        type: 'button',
        className: `more-sheet-item ${tab === id ? 'active' : ''}`,
        onclick: async () => {
          closeSheet();
          if (tab !== id) {
            tab = id;
            renderTabs();
            await loadTab();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }
      },
        icon(iconName || 'sprout', 18),
        el('span', {}, label)
      )
    )
  );

  const accountActions = el('div', { className: 'more-sheet-footer' },
    el('div', { className: 'more-sheet-account' },
      el('b', {}, me?.name || '-'),
      el('small', { className: 'muted' }, `${roleLabels[me?.role] || me?.role} • ${me?.agency_code || '-'}`)
    ),
    el('button', {
      type: 'button',
      className: 'secondary',
      onclick: () => { closeSheet(); logout(); }
    }, icon('logOut', 16), demoUser ? 'ออกจากโหมดทดลอง' : 'ออกจากระบบ')
  );

  const sheet = el('div', {
    className: 'more-sheet',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'เมนูเพิ่มเติม'
  },
    el('div', { className: 'more-sheet-header' },
      el('b', {}, 'เมนูเพิ่มเติม'),
      el('button', { type: 'button', className: 'ghost btn-sm', onclick: closeSheet, 'aria-label': 'ปิดเมนูเพิ่มเติม' }, 'ปิด')
    ),
    secondaryItems.length ? navList : null,
    accountActions
  );

  const overlay = el('div', {
    className: 'more-sheet-overlay',
    onclick: (e) => { if (e.target === overlay) closeSheet(); }
  }, sheet);
  document.body.append(overlay);
}

function renderMobileDock() {
  const dock = $('#mobile-dock');
  if (!dock) return;
  if (!me) {
    dock.classList.add('hide');
    dock.replaceChildren();
    return;
  }

  const permitted = currentTabs();
  const primaryIds = me.role === 'farmer'
    ? ['home', 'plots', 'record', 'approval']
    : me.role === 'ics'
    ? ['home', 'risks', 'approval', 'plots']
    : ['overview', 'invites', 'users', 'assignments'];

  const shortLabels = {
    overview: 'ภาพรวม',
    home: 'ภาพรวม',
    plots: me.role === 'ics' ? 'แปลง' : 'แปลงปลูก',
    record: 'บันทึก',
    approval: me.role === 'ics' ? 'คำขอ' : 'ขอปัจจัย',
    risks: 'จุดเสี่ยง',
    invites: 'คำเชิญ',
    users: 'สมาชิก',
    assignments: 'มอบหมาย'
  };

  const primaryTabs = primaryIds
    .map(id => permitted.find(([tId]) => tId === id))
    .filter(Boolean)
    .slice(0, 4);
  const primarySet = new Set(primaryTabs.map(([id]) => id));
  const secondaryTabs = permitted.filter(([id]) => !primarySet.has(id));
  const isSecondaryActive = secondaryTabs.some(([id]) => id === tab);

  const dockButtons = primaryTabs.map(([id, label, iconName]) => {
    const isHighlight = (me.role === 'farmer' && id === 'record') || (me.role === 'ics' && id === 'risks');
    return el('button', {
      type: 'button',
      className: `dock-btn ${tab === id ? 'active' : ''} ${isHighlight ? 'dock-highlight' : ''}`,
      onclick: async () => {
        if (tab !== id) {
          tab = id;
          renderTabs();
          await loadTab();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    },
      icon(iconName || 'sprout', 18),
      el('span', { className: 'dock-label' }, shortLabels[id] || label)
    );
  });

  dockButtons.push(
    el('button', {
      type: 'button',
      className: `dock-btn ${isSecondaryActive ? 'active' : ''}`,
      'aria-haspopup': 'dialog',
      onclick: () => openMoreSheet(secondaryTabs)
    },
      icon('moreHorizontal', 18),
      el('span', { className: 'dock-label' }, 'เพิ่มเติม')
    )
  );

  dock.replaceChildren(...dockButtons);
  dock.classList.remove('hide');
}

function plotSelect() {
  return selectField('plot_id', 'แปลงปลูก', plots.map(plot => ({ value: plot.id, label: `${plot.name} — ${plot.crop}` })));
}

function dated(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('th-TH');
}

async function loadInvites() {
  const [targets, invites] = await Promise.all([api('/admin/unlinked-users'), api('/admin/invites')]);
  const nodes = [];
  if (lastInvitation) {
    const invitation = lastInvitation;
    nodes.push(el('div', { className: 'notice' },
      el('b', {}, 'คัดลอกรหัสนี้ทันที ระบบจะไม่แสดงย้อนหลัง'),
      el('p', { className: 'token' }, invitation.invitationToken),
      el('button', {
        type: 'button',
        onclick: async () => {
          try { await navigator.clipboard.writeText(invitation.invitationToken); notify('คัดลอกรหัสเชิญแล้ว'); }
          catch { notify('คัดลอกไม่สำเร็จ กรุณาเลือกข้อความด้วยตนเอง'); }
        }
      }, 'คัดลอกรหัสเชิญ'),
      ' ',
      el('button', { type: 'button', className: 'secondary', onclick: () => { lastInvitation = null; loadTab(); } }, 'ซ่อนรหัส'),
      el('p', {}, el('small', {}, `หมดอายุ ${dated(invitation.expiresAt)}`))
    ));
  }
  if (targets.length) {
    const form = el('form', { className: 'card' },
      el('h3', {}, 'สร้างคำเชิญ 24 ชั่วโมง'),
      selectField('targetUserId', 'บัญชี Farmer หรือ ICS', targets.map(user => ({ value: user.id, label: `${user.agency_code} — ${user.name} (${roleLabels[user.role]}) • ${statusLabels[user.status]}` }))),
      el('button', { type: 'submit' }, 'สร้างรหัสเชิญ')
    );
    form.addEventListener('submit', async event => {
      event.preventDefault();
      try {
        lastInvitation = await api('/admin/invites', 'POST', { targetUserId: Number(new FormData(form).get('targetUserId')) });
        notify('สร้างคำเชิญแล้ว');
        await loadTab();
      } catch (error) {
        if (!error.handled) notify(error.message);
      }
    });
    nodes.push(form);
  } else {
    nodes.push(empty('ไม่มี Farmer หรือ ICS ที่รอผูก LINE'));
  }
  for (const invite of invites) {
    const box = card(
      el('b', {}, `${invite.target_code || '-'} — ${invite.target_name}`),
      ' ',
      el('span', { className: 'pill' }, roleLabels[invite.target_role] || invite.target_role),
      ' ',
      el('span', { className: `pill ${invite.status === 'active' ? 'warn' : ''}` }, statusLabels[invite.status] || invite.status),
      el('p', {}, `สร้าง ${dated(invite.created_at)} • หมดอายุ ${dated(invite.expires_at)}`)
    );
    if (invite.status === 'active') {
      box.append(el('button', {
        type: 'button', className: 'secondary',
        onclick: async () => {
          try { await api(`/admin/invites/${invite.id}/revoke`, 'PATCH', {}); notify('เพิกถอนคำเชิญแล้ว'); await loadTab(); }
          catch (error) { if (!error.handled) notify(error.message); }
        }
      }, 'เพิกถอน'));
    }
    nodes.push(box);
  }
  return nodes;
}

async function loadUsers() {
  const users = await api('/admin/users');
  const form = el('form', { className: 'card' },
    el('h3', {}, 'เพิ่ม Farmer หรือ ICS'),
    inputField('agencyCode', 'รหัสประจำตัว'),
    inputField('name', 'ชื่อ'),
    selectField('role', 'บทบาท', [{ value: 'farmer', label: 'Farmer' }, { value: 'ics', label: 'ICS Officer' }]),
    el('button', { type: 'submit' }, 'เพิ่มผู้ใช้')
  );
  form.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await api('/admin/users', 'POST', Object.fromEntries(new FormData(form)));
      notify('เพิ่มผู้ใช้แล้ว');
      await loadTab();
    } catch (error) {
      if (!error.handled) notify(error.message);
    }
  });
  return [form, ...users.map(user => {
    const box = card(
      el('b', {}, `${user.agency_code || '-'} — ${user.name}`),
      ' ',
      el('span', { className: 'pill' }, roleLabels[user.role] || user.role),
      el('p', {}, `สถานะ ${statusLabels[user.status] || user.status} • ${user.linked ? 'ผูก LINE แล้ว' : 'ยังไม่ผูก LINE'}`)
    );
    if (user.role !== 'admin') {
      box.append(el('button', {
        type: 'button', className: 'secondary',
        onclick: async () => {
          try { await api(`/admin/users/${user.id}/status`, 'PATCH', { status: user.status === 'disabled' ? 'active' : 'disabled' }); await loadTab(); }
          catch (error) { if (!error.handled) notify(error.message); }
        }
      }, user.status === 'disabled' ? 'เปิดใช้งาน' : 'ระงับบัญชี'));
    }
    return box;
  })];
}

async function loadAssignments() {
  const [users, assignments] = await Promise.all([api('/admin/users'), api('/admin/assignments')]);
  const officers = users.filter(user => user.role === 'ics' && user.status === 'active');
  const farmers = users.filter(user => user.role === 'farmer' && user.status === 'active');
  const nodes = [];
  if (officers.length && farmers.length) {
    const form = el('form', { className: 'card' },
      el('h3', {}, 'มอบหมาย Farmer ให้ ICS'),
      selectField('icsUserId', 'ICS Officer', officers.map(user => ({ value: user.id, label: `${user.agency_code} — ${user.name}` }))),
      selectField('farmerUserId', 'Farmer', farmers.map(user => ({ value: user.id, label: `${user.agency_code} — ${user.name}` }))),
      el('button', { type: 'submit' }, 'บันทึก Assignment')
    );
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      try {
        await api('/admin/assignments', 'POST', { icsUserId: Number(values.icsUserId), farmerUserId: Number(values.farmerUserId) });
        await loadTab();
      } catch (error) {
        if (!error.handled) notify(error.message);
      }
    });
    nodes.push(form);
  }
  for (const item of assignments) {
    const box = card(
      el('b', {}, `${item.ics_name} → ${item.farmer_name}`),
      ' ',
      el('span', { className: 'pill' }, item.ends_at ? 'สิ้นสุดแล้ว' : 'active')
    );
    if (!item.ends_at) {
      box.append(el('p', {}, el('button', {
        type: 'button', className: 'secondary',
        onclick: async () => {
          try { await api(`/admin/assignments/${item.id}/end`, 'PATCH', {}); await loadTab(); }
          catch (error) { if (!error.handled) notify(error.message); }
        }
      }, 'สิ้นสุด Assignment')));
    }
    nodes.push(box);
  }
  return nodes.length ? nodes : [empty()];
}

function dataForm(id, fields, label, path, onSuccess) {
  const submitBtn = el('button', { type: 'submit' }, icon('plus', 16), label);
  const form = el('form', { id, className: 'card' }, fields, submitBtn);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'กำลังบันทึก...';
    try {
      const values = Object.fromEntries(new FormData(form));
      await api(path, 'POST', values);
      notify('บันทึกสำเร็จ');
      form.reset();
      if (onSuccess) onSuccess();
      await loadTab();
    } catch (error) {
      if (!error.handled) notify(error.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.replaceChildren(icon('plus', 16), document.createTextNode(label));
    }
  });
  return form;
}

async function loadAdminOverview() {
  const [users, assignments] = await Promise.all([api('/admin/users'), api('/admin/assignments')]);
  const activeUsers = users.filter(u => u.status === 'active').length;
  const unlinkedUsers = users.filter(u => !u.linked).length;
  const farmerCount = users.filter(u => u.role === 'farmer').length;
  const icsCount = users.filter(u => u.role === 'ics').length;
  const activeAssignments = assignments.filter(a => !a.ends_at).length;

  const kpis = el('div', { className: 'grid kpi-grid' },
    [
      ['ผู้ใช้งานทั้งหมด', `${users.length}`, 'คน', `เปิดใช้งาน ${activeUsers} • รอผูก LINE ${unlinkedUsers}`],
      ['เกษตรกร (Farmer)', `${farmerCount}`, 'ราย', 'บันทึกแปลงและขออนุมัติปัจจัย'],
      ['เจ้าหน้าที่ ICS', `${icsCount}`, 'คน', 'ตรวจแปลง พิจารณาคำขอ และจุดเสี่ยง'],
      ['การมอบหมายที่ใช้งานอยู่', `${activeAssignments}`, 'คู่', `ทั้งหมดในระบบ ${assignments.length} รายการ`]
    ].map(([label, val, unit, desc]) =>
      el('div', { className: 'card kpi-card' },
        el('div', { className: 'kpi-top' }, el('span', { className: 'kpi-tag' }, label)),
        el('div', { className: 'kpi-num' }, val, el('small', {}, ` ${unit}`)),
        el('div', { className: 'kpi-desc muted' }, desc)
      )
    )
  );

  const rbacRows = [
    ['สร้าง/แก้ไขแปลงปลูกและบันทึกกิจกรรมตนเอง', 'ได้', 'ดูในความดูแล', '—'],
    ['ยื่นคำขออนุมัติปัจจัยการผลิต (/approvals POST)', 'ได้', '—', '—'],
    ['พิจารณาคำขอปัจจัย (/approvals PATCH)', '—', 'ได้', '—'],
    ['ดูความเสี่ยง (/risks) และบันทึกผลตรวจ (/reviews)', '—', 'ได้', '—'],
    ['สร้างคำเชิญ จัดการผู้ใช้ และมอบหมาย (/admin/*)', '—', '—', 'ได้']
  ];

  const rbacTableCard = card(
    el('div', { className: 'row between' },
      el('h3', {}, icon('shield', 16), ' ตารางสิทธิ์ตามบทบาท (RBAC Read-Only)'),
      el('span', { className: 'pill' }, 'อ่านอย่างเดียว')
    ),
    el('p', { className: 'muted card-lead' }, 'สรุปขอบเขตสิทธิ์ที่เซิร์ฟเวอร์บังคับใช้จริงสำหรับแต่ละบทบาท'),
    el('div', { className: 'watchlist-table-wrap' },
      el('table', { className: 'watchlist-table' },
        el('thead', {},
          el('tr', {},
            el('th', {}, 'ความสามารถ / เส้นทาง API'),
            el('th', {}, 'Farmer'),
            el('th', {}, 'ICS'),
            el('th', {}, 'Admin')
          )
        ),
        el('tbody', {},
          ...rbacRows.map(r => el('tr', {}, ...r.map(cell => el('td', {}, cell))))
        )
      )
    )
  );

  return [kpis, rbacTableCard];
}

async function loadTab() {
  const contentEl = $('#content');
  if (contentEl) {
    contentEl.replaceChildren(card(
      el('div', { className: 'skeleton-loader', 'aria-label': 'กำลังโหลดข้อมูล...' },
        el('div', { className: 'skeleton-line skeleton-title' }),
        el('div', { className: 'skeleton-line skeleton-subtitle' })
      )
    ));
  }
  try {
    if (me.role !== 'admin') plots = await api('/plots');
    let nodes = [];
    if (tab === 'overview' && me.role === 'admin') nodes = await loadAdminOverview();
    else if (tab === 'invites') nodes = await loadInvites();
    else if (tab === 'users') nodes = await loadUsers();
    else if (tab === 'assignments') nodes = await loadAssignments();
    else if (tab === 'home') {
      const [activities, approvals, lots] = await Promise.all([
        api('/activities'),
        api('/approvals'),
        api('/lots')
      ]);
      const [revs, risks] = me.role === 'ics'
        ? await Promise.all([api('/reviews').catch(() => []), api('/risks').catch(() => [])])
        : [[], []];
      const pendingCount = approvals.filter(item => item.status === 'pending').length;

      if (me.role === 'ics') {
        let totalMembers = 0;
        let totalPlots = plots.length;
        let pendingInput = pendingCount;
        let riskAlerts = 0;
        let groupReadiness = null;
        let watchRows = [];
        const isDemo = Boolean(demoBackend && demoUser);

        if (isDemo) {
          const [metrics, watchlist] = await Promise.all([
            api('/metrics').catch(() => null),
            api('/watchlist').catch(() => [])
          ]);
          totalMembers = metrics?.totalMembers ?? 0;
          totalPlots = metrics?.totalPlots ?? 0;
          pendingInput = metrics?.pendingInputRequests ?? pendingCount;
          riskAlerts = metrics?.riskAlerts ?? 0;
          groupReadiness = metrics?.groupReadiness ?? null;
          watchRows = Array.isArray(watchlist) ? watchlist : [];
        } else {
          // REAL PRODUCTION DATA: Calculated strictly from real API responses
          const since14 = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
          const farmerIdSet = new Set();

          plots.forEach(p => {
            const farmerKey = p.owner_id || p.farmer_id || p.owner || p.farmer;
            if (farmerKey) farmerIdSet.add(farmerKey);
            const farmerDisplayName = p.owner || p.farmer_name || p.farmer || (p.owner_id ? `เกษตรกร #${p.owner_id}` : `เกษตรกร #${p.id}`);
            const plotActs = activities.filter(a => a.plot_id === p.id);
            const hasRecentAct = plotActs.some(a => a.activity_date >= since14);
            const pendingForPlot = approvals.find(a => a.plot_id === p.id && a.status === 'pending');

            if (!hasRecentAct) {
              riskAlerts++;
              watchRows.push({
                plot_id: p.id,
                code: p.plot_code || p.name || `P-${p.id}`,
                farmer: farmerDisplayName,
                crop: p.crop || '-',
                conversion: p.conversion_year || '',
                status: 'ขาดการบันทึกกิจกรรมเกิน 14 วัน',
                severity: 'risk',
                action: 'ติดตามด่วน',
                targetTab: 'record'
              });
            } else if (pendingForPlot) {
              watchRows.push({
                plot_id: p.id,
                code: p.plot_code || p.name || `P-${p.id}`,
                farmer: farmerDisplayName,
                crop: p.crop || '-',
                conversion: p.conversion_year || '',
                status: 'มีคำขอปัจจัยการผลิตรออนุมัติ',
                severity: 'warning',
                action: 'พิจารณาคำขอ',
                targetTab: 'approval',
                pendingApprovalId: pendingForPlot.id
              });
            }
          });

          totalMembers = farmerIdSet.size;
          groupReadiness = plots.length > 0
            ? Math.max(0, Math.round(((plots.length - riskAlerts) / plots.length) * 100))
            : null;
        }

        let readinessFillClass = 'fill-0';
        if (groupReadiness !== null) {
          if (groupReadiness >= 98) readinessFillClass = 'fill-98';
          else if (groupReadiness >= 94) readinessFillClass = 'fill-94';
          else if (groupReadiness >= 90) readinessFillClass = 'fill-90';
          else if (groupReadiness >= 85) readinessFillClass = 'fill-86';
          else if (groupReadiness >= 75) readinessFillClass = 'fill-75';
          else if (groupReadiness >= 50) readinessFillClass = 'fill-50';
          else if (groupReadiness >= 25) readinessFillClass = 'fill-25';
          else readinessFillClass = 'fill-0';
        }
        const readinessStatText = groupReadiness !== null ? `${groupReadiness}%` : 'รอประเมิน';
        const readinessSubtext = groupReadiness !== null
          ? (isDemo ? 'ความพร้อมรับรองกลุ่ม (เกณฑ์ PGS)' : 'ประเมินจากแปลงที่ไม่มีจุดเสี่ยง')
          : 'รอข้อมูลแปลงในความดูแล';

        const buildWatchlistActionButtons = (w) => {
          const actionRow = el('div', { className: 'row' });
          if (w.pendingApprovalId) {
            actionRow.append(
              el('button', {
                type: 'button',
                className: 'btn-sm',
                onclick: async () => { tab = 'approval'; renderTabs(); await loadTab(); }
              }, icon('clipboard', 13), ' พิจารณาคำขอ')
            );
          } else if (w.targetTab === 'reviews' || w.action === 'นัดตรวจแปลง' || w.action === 'บันทึกตรวจ') {
            actionRow.append(
              el('button', {
                type: 'button',
                className: 'btn-sm secondary',
                onclick: async () => { tab = 'reviews'; renderTabs(); await loadTab(); }
              }, icon('shield', 13), ' ' + (w.action || 'บันทึกตรวจแปลง')),
              el('button', {
                type: 'button',
                className: 'btn-sm secondary',
                onclick: () => sharePlotRiskToLine(w)
              }, icon('message', 13), ' แชร์ข้อความทาง LINE')
            );
          } else if (w.code === 'A-03' && w.severity === 'risk' && demoUser) {
            actionRow.append(
              el('button', {
                type: 'button',
                className: 'btn-sm secondary',
                onclick: () => acceptDemoLogin('farmer', 'F-STG-001')
              }, icon('user', 12), ' สลับเป็นเกษตรกร A-03'),
              el('button', {
                type: 'button',
                className: 'btn-sm secondary',
                onclick: () => sharePlotRiskToLine(w)
              }, icon('message', 13), ' แชร์ข้อความทาง LINE')
            );
          } else if (w.severity === 'risk') {
            actionRow.append(
              el('button', {
                type: 'button',
                className: 'btn-sm secondary',
                onclick: async () => { tab = w.targetTab || 'lots'; renderTabs(); await loadTab(); }
              }, w.action),
              el('button', {
                type: 'button',
                className: 'btn-sm secondary',
                onclick: () => sharePlotRiskToLine(w)
              }, icon('message', 13), ' แชร์ข้อความทาง LINE')
            );
          } else {
            actionRow.append(
              el('button', {
                type: 'button',
                className: 'btn-sm secondary',
                onclick: async () => { tab = w.targetTab || 'lots'; renderTabs(); await loadTab(); }
              }, w.action)
            );
          }
          return actionRow;
        };

        let watchlistContent;
        if (!watchRows.length) {
          watchlistContent = empty('ไม่พบแปลงที่มีความเสี่ยงในระบบ สมาชิกทุกคนบันทึกข้อมูลและปฏิบัติตามมาตรฐาน');
        } else {
          let watchSeverityFilter = 'all';
          let watchQuery = '';
          const watchResultsHost = el('div', {});

          const renderWatchRows = () => {
            const q = watchQuery.trim().toLowerCase();
            const filtered = watchRows.filter(w => {
              const matchSeverity = watchSeverityFilter === 'all' || w.severity === watchSeverityFilter;
              const matchQuery = !q ||
                String(w.code || '').toLowerCase().includes(q) ||
                String(w.farmer || '').toLowerCase().includes(q) ||
                String(w.crop || '').toLowerCase().includes(q);
              return matchSeverity && matchQuery;
            });

            if (!filtered.length) {
              watchResultsHost.replaceChildren(empty('ไม่พบแปลงที่ตรงกับตัวกรอง'));
              return;
            }

            // 1. Desktop Table View (visible on > 640px)
            const desktopTable = el('div', { className: 'watchlist-table-wrap desktop-only' },
              el('table', { className: 'watchlist-table' },
                el('thead', {},
                  el('tr', {},
                    el('th', {}, 'รหัสแปลง'),
                    el('th', {}, 'เกษตรกรผู้ดูแล'),
                    el('th', {}, 'พืช & ระยะปรับเปลี่ยน'),
                    el('th', {}, 'จังหวะ 14 วัน'),
                    el('th', {}, 'สถานะความเสี่ยง'),
                    el('th', {}, 'การดำเนินการ')
                  )
                ),
                el('tbody', {},
                  ...filtered.map(w => el('tr', {},
                    el('td', {}, el('b', { className: 'plot-code-tag' }, w.code)),
                    el('td', {}, w.farmer),
                    el('td', {}, `${w.crop}${w.conversion ? ` (${w.conversion})` : ''}`),
                    el('td', { className: 'rhythm-col' }, create14DayRhythmTrack(w.plot_id, activities, { compact: true })),
                    el('td', {}, statusBadge(w.severity, w.status)),
                    el('td', {}, buildWatchlistActionButtons(w))
                  ))
                )
              )
            );

            // 2. Mobile Card View (visible on <= 640px, NO horizontal scrolling!)
            const mobileCards = el('div', { className: 'watchlist-cards mobile-only' },
              ...filtered.map(w => el('div', { className: `watchlist-card-item severity-${w.severity}` },
                el('div', { className: 'watchlist-card-top' },
                  el('b', { className: 'plot-code-tag' }, w.code),
                  statusBadge(w.severity, w.status)
                ),
                el('div', { className: 'watchlist-card-body' },
                  el('div', { className: 'watchlist-meta-item' },
                    icon('user', 14),
                    el('b', {}, w.farmer)
                  ),
                  el('div', { className: 'watchlist-meta-item' },
                    icon('leaf', 14),
                    el('span', {}, `${w.crop}${w.conversion ? ` • ${w.conversion}` : ''}`)
                  ),
                  el('div', { className: 'watchlist-rhythm-box' },
                    create14DayRhythmTrack(w.plot_id, activities, { compact: true })
                  )
                ),
                el('div', { className: 'watchlist-card-actions' },
                  buildWatchlistActionButtons(w)
                )
              ))
            );

            watchResultsHost.replaceChildren(desktopTable, mobileCards);
          };

          const filterBtns = [
            ['all', 'ทั้งหมด'],
            ['risk', 'เสี่ยง/ขาดบันทึก'],
            ['warning', 'รอพิจารณา'],
            ['normal', 'ปกติ']
          ].map(([key, label]) => {
            const btn = el('button', {
              type: 'button',
              className: `chip ${key === 'all' ? 'active' : ''}`,
              onclick: () => {
                watchSeverityFilter = key;
                filterBar.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderWatchRows();
              }
            }, label);
            return btn;
          });

          const filterBar = el('div', { className: 'ics-filter-bar' },
            el('div', { className: 'search-filter-box' },
              icon('search', 15),
              el('input', {
                type: 'search',
                placeholder: 'ค้นหารหัสแปลง, เกษตรกร, หรือพืช...',
                oninput: (e) => { watchQuery = e.target.value; renderWatchRows(); }
              })
            ),
            el('div', { className: 'filter-chips-row' }, ...filterBtns)
          );

          renderWatchRows();
          watchlistContent = el('div', {}, filterBar, watchResultsHost);
        }

        const normalPlotsCount = Math.max(0, totalPlots - riskAlerts - pendingInput);
        const since14Iso = formatLocalIsoDate(new Date(Date.now() - 14 * 86_400_000));
        const activePlots14 = plots.filter(p =>
          activities.some(a => a.plot_id === p.id && String(a.activity_date || '').slice(0, 10) >= since14Iso)
        ).length;
        const inactivePlots14 = Math.max(0, plots.length - activePlots14);

        const icsHeroCard = el('div', { className: 'card ics-hero-graphic-card' },
          el('div', { className: 'ics-hero-content' },
            el('div', { className: 'gauge-panel' },
              el('div', { className: 'gauge-meta' },
                el('div', { className: 'row between' },
                  el('span', { className: isDemo ? 'pill warn' : 'pill success' }, isDemo ? 'ตัวอย่างความพร้อมกลุ่ม (Demo)' : 'เกณฑ์ควบคุมภายใน ICS'),
                  el('span', { className: 'stat-pill' }, readinessStatText)
                ),
                el('h3', { className: 'gauge-title' }, 'ความพร้อมรับรองมาตรฐานกลุ่ม (PGS / ICS)'),
                el('p', { className: 'muted gauge-desc' }, readinessSubtext + ' • ตำบลผักไหม จ.ศรีสะเกษ'),
                el('div', { className: 'dist-legend-grid mt-12' },
                  el('div', { className: 'legend-item' },
                    el('span', { className: 'legend-dot dot-green' }),
                    el('span', { className: 'legend-label' }, 'ปกติ/ผ่านเกณฑ์:'),
                    el('b', { className: 'legend-val' }, `${normalPlotsCount} แปลง`)
                  ),
                  el('div', { className: 'legend-item' },
                    el('span', { className: 'legend-dot dot-amber' }),
                    el('span', { className: 'legend-label' }, 'รออนุมัติปัจจัย:'),
                    el('b', { className: 'legend-val text-amber' }, `${pendingInput} แปลง`)
                  ),
                  el('div', { className: 'legend-item' },
                    el('span', { className: 'legend-dot dot-rose' }),
                    el('span', { className: 'legend-label' }, 'จุดเสี่ยงเฝ้าระวัง:'),
                    el('b', { className: 'legend-val text-rose' }, `${riskAlerts} จุด`)
                  )
                )
              )
            ),
            el('div', { className: 'ics-hero-rhythm' },
              el('div', { className: 'ics-rhythm-summary' },
                el('div', { className: 'rhythm-track-header' },
                  el('span', { className: 'rhythm-track-title' }, icon('calendar', 14), 'ความต่อเนื่องรายแปลง (14 วันล่าสุด)'),
                  statusBadge(inactivePlots14 > 0 ? 'warn' : 'normal', inactivePlots14 > 0 ? `ขาดบันทึก ${inactivePlots14} แปลง` : 'บันทึกครบทุกแปลง')
                ),
                el('div', { className: 'ics-rhythm-count' },
                  el('b', {}, `${activePlots14}`),
                  el('span', { className: 'muted' }, ` / ${plots.length} แปลงในความดูแลมีบันทึกในรอบ 14 วัน`)
                ),
                el('small', { className: 'muted' }, 'ดูแถบจังหวะบันทึก 14 วันแบบรายแปลงได้ในรายการแปลงด้านล่าง')
              )
            )
          )
        );

        const kpiGrid = el('div', { className: 'grid kpi-grid' },
          el('div', { className: 'card kpi-card' },
            el('div', { className: 'kpi-top' },
              el('div', { className: 'kpi-icon-badge kpi-forest' }, icon('users', 18)),
              el('span', { className: 'kpi-tag' }, 'เกษตรกร')
            ),
            el('div', { className: 'kpi-num' }, `${totalMembers}`, el('small', {}, ' ราย')),
            el('div', { className: 'kpi-desc muted' }, totalMembers > 0 ? (isDemo ? 'วิสาหกิจชุมชนผักไหม (Demo)' : 'สมาชิกในความรับผิดชอบ') : 'รอการมอบหมายสมาชิก'),
            el('div', { className: 'kpi-bar kpi-bar-forest' })
          ),
          el('div', { className: 'card kpi-card' },
            el('div', { className: 'kpi-top' },
              el('div', { className: 'kpi-icon-badge kpi-emerald' }, icon('mapPin', 18)),
              el('span', { className: 'kpi-tag' }, 'พื้นที่แปลง')
            ),
            el('div', { className: 'kpi-num' }, `${totalPlots}`, el('small', {}, ' แปลง')),
            el('div', { className: 'kpi-desc muted' }, totalPlots > 0 ? (isDemo ? 'รวมพื้นที่ 380 ไร่' : 'แปลงในความดูแล') : 'ยังไม่มีแปลงในระบบ'),
            el('div', { className: 'kpi-bar kpi-bar-emerald' })
          ),
          el('div', { className: 'card kpi-card' },
            el('div', { className: 'kpi-top' },
              el('div', { className: 'kpi-icon-badge kpi-amber' }, icon('clock', 18)),
              el('span', { className: 'kpi-tag tag-amber' }, 'รอพิจารณา')
            ),
            el('div', { className: 'kpi-num stat-amber' }, `${pendingInput}`, el('small', {}, ' รายการ')),
            el('div', { className: 'kpi-desc muted' }, 'สูตรปุ๋ย/น้ำหมักอินทรีย์'),
            el('div', { className: 'kpi-bar kpi-bar-amber' })
          ),
          el('div', { className: 'card kpi-card' },
            el('div', { className: 'kpi-top' },
              el('div', { className: 'kpi-icon-badge kpi-rose' }, icon('alert', 18)),
              el('span', { className: 'kpi-tag tag-rose' }, 'ความเสี่ยง')
            ),
            el('div', { className: 'kpi-num stat-rose' }, `${riskAlerts}`, el('small', {}, ' จุด')),
            el('div', { className: 'kpi-desc muted' }, riskAlerts > 0 ? 'ขาดบันทึก / ไม่สอดคล้อง' : 'ไม่พบจุดเสี่ยง'),
            el('div', { className: 'kpi-bar kpi-bar-rose' })
          )
        );

        const icsRisksSummaryCard = el('div', { className: 'card ics-summary-list-card' },
          el('div', { className: 'row between' },
            el('h4', {}, icon('alert', 15), ` งานค้างและความเสี่ยงจริง (${risks.length})`),
            el('button', {
              type: 'button',
              className: 'ghost btn-sm',
              onclick: async () => { tab = 'risks'; renderTabs(); await loadTab(); }
            }, 'ดูทั้งหมด')
          ),
          ...(risks.length
            ? risks.slice(0, 5).map(r => el('div', { className: 'summary-feed-item' },
                el('div', { className: 'row between' },
                  el('b', {}, r.plot_name || '-'),
                  statusBadge(r.type === 'pending' ? 'warn' : 'risk', r.type === 'pending' ? 'คำขอค้างตรวจ' : 'ขาดบันทึก >14 วัน')
                ),
                el('small', { className: 'muted' }, r.type === 'pending'
                  ? `ปัจจัย: ${r.input_name || '-'}${r.farmer_name ? ` • ${r.farmer_name}` : ''}`
                  : `ไม่พบบันทึกกิจกรรมเกิน 14 วัน${r.farmer_name ? ` • ${r.farmer_name}` : ''}`)
              ))
            : [el('p', { className: 'muted' }, 'ไม่พบงานค้างหรือจุดเสี่ยงจากระบบ /risks')])
        );

        const recentActivitiesList = [...activities]
          .sort((a, b) => String(b.activity_date || '').localeCompare(String(a.activity_date || '')))
          .slice(0, 5);

        const icsRecentActivitiesCard = el('div', { className: 'card ics-summary-list-card' },
          el('div', { className: 'row between' },
            el('h4', {}, icon('calendar', 15), ` กิจกรรมล่าสุดของสมาชิก (${activities.length})`),
            el('button', {
              type: 'button',
              className: 'ghost btn-sm',
              onclick: async () => { tab = 'record'; renderTabs(); await loadTab(); }
            }, 'ดูทั้งหมด')
          ),
          ...(recentActivitiesList.length
            ? recentActivitiesList.map(act => el('div', { className: 'summary-feed-item' },
                el('div', { className: 'row between' },
                  el('b', {}, `${act.kind || 'กิจกรรม'} • ${act.plot_name || '-'}`),
                  el('small', { className: 'muted' }, act.activity_date || '-')
                ),
                el('small', { className: 'muted' }, `${act.farmer ? `${act.farmer}: ` : ''}${String(act.details || '').slice(0, 90)}`)
              ))
            : [el('p', { className: 'muted' }, 'ยังไม่มีกิจกรรมล่าสุดในระบบ')])
        );

        nodes = [
          icsHeroCard,
          kpiGrid,
          el('div', { className: 'ics-home-lower-grid' },
            icsRisksSummaryCard,
            icsRecentActivitiesCard
          ),
          el('div', { className: 'card watchlist-card' },
            el('div', { className: 'row between' },
              el('h3', {}, icon('alert', 16), ' รายการแปลงที่ต้องติดตาม'),
              el('div', { className: 'row' },
                el('button', {
                  type: 'button',
                  className: 'btn-sm secondary desktop-only',
                  onclick: () => window.print()
                }, icon('printer', 14), ' พิมพ์รายงานตรวจกลุ่ม'),
                el('span', { className: isDemo ? 'pill warn' : 'pill success' }, isDemo ? 'ข้อมูลตัวอย่าง (Demo)' : 'ข้อมูลจริงจากระบบ')
              )
            ),
            el('p', { className: 'muted card-lead' }, 'ระบบคัดกรองแปลงที่ต้องการการดูแลเร่งด่วน (ขาดการบันทึกเกิน 14 วัน / รออนุมัติปัจจัยการผลิต / ประวัติไม่สอดคล้อง) เพื่อให้เจ้าหน้าที่ ICS ติดตามได้ทันที'),
            watchlistContent
          )
        ];
      } else {
        const myPlot = plots[0];
        const sortedActs = [...activities].sort((a, b) => String(b.activity_date || '').localeCompare(String(a.activity_date || '')));
        const latestAct = sortedActs[0];
        let daysSince = null;
        if (latestAct?.activity_date) {
          const actTime = new Date(latestAct.activity_date).getTime();
          if (!Number.isNaN(actTime)) {
            daysSince = Math.max(0, Math.floor((Date.now() - actTime) / 86_400_000));
          }
        }

        const isOverdue = daysSince === null || daysSince > 14;
        const isWarning = !isOverdue && daysSince >= 7;
        const hasPendingApp = pendingCount > 0;

        let statusTier = 'normal';
        let statusBadgeText = daysSince !== null
          ? `บันทึกล่าสุด ${daysSince === 0 ? 'วันนี้' : `${daysSince} วันก่อน`}`
          : 'แปลงใหม่ รอเริ่มบันทึก';
        let statusTitle = myPlot ? `แปลง ${myPlot.name}` : 'ภาพรวมแปลงปลูก';
        let statusDesc = daysSince !== null
          ? `บันทึกกิจกรรมล่าสุดเมื่อ ${daysSince === 0 ? 'วันนี้' : `${daysSince} วันก่อน`} • งานถัดไป: ตรวจสอบและบันทึกกิจกรรมการดูแลแปลงรอบถัดไป`
          : 'ยังไม่มีประวัติกิจกรรม • งานถัดไป: แตะ "บันทึกกิจกรรมแปลง" เพื่อเริ่มต้นบันทึกข้อมูล';
        let alertAdvice = null;

        if (isOverdue) {
          statusTier = 'risk';
          statusBadgeText = `ขาดบันทึกเกิน 14 วัน (${daysSince !== null ? `${daysSince} วันก่อน` : 'ยังไม่มีประวัติ'})`;
          statusTitle = `แจ้งเตือน: แปลง ${myPlot?.name || ''} ขาดการบันทึกกิจกรรม`;
          statusDesc = `บันทึกกิจกรรมล่าสุดเกิน 14 วัน • งานถัดไป: แตะ "บันทึกกิจกรรมแปลงด่วน" เพื่ออัปเดตการทำงานในแปลง`;
          alertAdvice = 'คำแนะนำ: บันทึกกิจกรรมเพื่อรักษาความต่อเนื่องของข้อมูลและแจ้งความคืบหน้าให้เจ้าหน้าที่ ICS ทราบ';
        } else if (isWarning) {
          statusTier = 'warn';
          statusBadgeText = `บันทึกล่าสุด ${daysSince} วันก่อน`;
          statusTitle = `เตือนล่วงหน้า: แปลง ${myPlot?.name || ''} ใกล้ครบ 14 วัน`;
          statusDesc = `บันทึกกิจกรรมล่าสุด ${daysSince} วันก่อน • งานถัดไป: บันทึกกิจกรรมการดูแลแปลงก่อนครบกำหนด 14 วัน`;
          alertAdvice = 'คำแนะนำ: บันทึกกิจกรรมการให้น้ำ ใส่ปุ๋ย หรือตรวจแปลงเพื่ออัปเดตข้อมูล';
        } else if (hasPendingApp) {
          statusTier = 'warn';
          statusBadgeText = `รอผลพิจารณาคำขอ (${pendingCount} รายการ)`;
          statusTitle = `สถานะแปลง ${myPlot?.name || ''}: มีคำขอรอพิจารณา`;
          statusDesc = `มีคำขอปัจจัยการผลิตรอการพิจารณาจากเจ้าหน้าที่ ICS ${pendingCount} รายการ • งานถัดไป: รอการอนุมัติก่อนนำปัจจัยไปใช้ในแปลงจริง`;
        }

        const farmerRhythmSection = plots.length === 0
          ? empty('ยังไม่มีแปลงปลูกในระบบ', 'เพิ่มแปลงปลูกแรกของคุณ', async () => { tab = 'plots'; renderTabs(); await loadTab(); })
          : plots.length === 1
          ? create14DayRhythmTrack(plots[0].id, activities, { title: `ความต่อเนื่องการบันทึกแปลง ${plots[0].name} (14 วันล่าสุด)` })
          : el('div', { className: 'farmer-rhythm-list' },
              ...plots.map(p => create14DayRhythmTrack(p.id, activities, { title: `จังหวะบันทึกแปลง ${p.name} (14 วันล่าสุด)` }))
            );

        const farmerHeroCard = el('div', { className: `farmer-hero-graphic-card ${statusTier}` },
          el('div', { className: 'farmer-hero-top' },
            el('div', { className: 'farmer-hero-info' },
              el('div', { className: 'status-badge-row' },
                el('span', { className: 'pill' }, 'สิ่งที่ต้องทำวันนี้'),
                statusBadge(statusTier, statusBadgeText),
                myPlot?.conversion_year ? el('span', { className: 'pill' }, myPlot.conversion_year) : null,
                myPlot?.plot_code ? el('span', { className: 'pill' }, `รหัสแปลง: ${myPlot.plot_code}`) : null
              ),
              el('h3', { className: 'farmer-status-title' }, statusTitle),
              el('p', { className: 'farmer-status-desc' }, statusDesc)
            )
          ),
          farmerRhythmSection,
          alertAdvice ? el('div', { className: `farmer-advice-box advice-${statusTier} mt-12` },
            icon('alert', 15),
            el('span', {}, alertAdvice)
          ) : null,
          el('div', { className: 'row farmer-actions-row mt-12' },
            el('button', {
              type: 'button',
              id: 'farmerPrimaryRecordBtn',
              className: isOverdue ? 'pulse' : '',
              onclick: async () => { tab = 'record'; renderTabs(); await loadTab(); }
            }, icon('calendar', 16), ' บันทึกกิจกรรม')
          )
        );

        const pgsCriteriaCard = el('div', { className: 'card pgs-criteria-card' },
          el('div', { className: 'row between' },
            el('h4', { className: 'milestone-header' }, icon('shield', 16), ' ข้อกำหนดมาตรฐานเกษตรอินทรีย์ PGS (วิสาหกิจชุมชนผักไหม)'),
            el('span', { className: 'pill success' }, 'เกณฑ์รับรองกลุ่ม')
          ),
          el('p', { className: 'muted card-lead' }, 'แนวทางปฏิบัติ 4 ข้อสำคัญเพื่อรักษามาตรฐานอินทรีย์และเตรียมความพร้อมก่อนการตรวจประเมิน'),
          el('div', { className: 'grid pgs-criteria-grid mt-12' },
            el('div', { className: 'criteria-item' },
              el('b', { className: 'criteria-title' }, icon('calendar', 14), ' 1. บันทึกแปลงต่อเนื่อง'),
              el('p', { className: 'criteria-desc muted' }, 'บันทึกการดูแลแปลงอย่างน้อยทุก 14 วัน เพื่อให้ตรวจสอบย้อนกลับได้')
            ),
            el('div', { className: 'criteria-item' },
              el('b', { className: 'criteria-title' }, icon('clipboard', 14), ' 2. ขออนุมัติปัจจัยการผลิต'),
              el('p', { className: 'criteria-desc muted' }, 'ยื่นขออนุมัติปุ๋ยอินทรีย์และชีวภัณฑ์กับเจ้าหน้าที่ ICS ก่อนใช้ในแปลงจริง')
            ),
            el('div', { className: 'criteria-item' },
              el('b', { className: 'criteria-title' }, icon('mapPin', 14), ' 3. แนวกันชนปลอดภัย'),
              el('p', { className: 'criteria-desc muted' }, 'ดูแลแนวกันชนรอบแปลงเพื่อป้องกันสารเคมีจากภายนอกพัดพาเข้ามา')
            ),
            el('div', { className: 'criteria-item' },
              el('b', { className: 'criteria-title' }, icon('shield', 14), ' 4. ตรวจประเมินแปลง'),
              el('p', { className: 'criteria-desc muted' }, 'พร้อมรับการตรวจประเมินแปลงประจำฤดูกาลโดยคณะกรรมการกลุ่ม PGS')
            )
          )
        );

        const farmerStatMeta = {
          'แปลงปลูก': { icon: 'mapPin', color: 'kpi-emerald', unit: ' แปลง' },
          'กิจกรรม': { icon: 'calendar', color: 'kpi-forest', unit: ' รายการ' },
          'คำขอรอพิจารณา': { icon: 'clock', color: 'kpi-amber', unit: ' คำขอ' },
          'ล็อตผลผลิต': { icon: 'package', color: 'kpi-forest', unit: ' ล็อต' }
        };

        const farmerKpiGrid = el('div', { className: 'grid kpi-grid' },
          [['แปลงปลูก', plots.length],
           ['กิจกรรม', activities.length],
           ['คำขอรอพิจารณา', pendingCount],
           ['ล็อตผลผลิต', lots.length]].map(([label, count]) => {
            const meta = farmerStatMeta[label] || { icon: 'sprout', color: 'kpi-forest', unit: '' };
            return el('div', { className: 'card kpi-card' },
              el('div', { className: 'kpi-top' },
                el('div', { className: `kpi-icon-badge ${meta.color}` }, icon(meta.icon, 16)),
                el('span', { className: 'kpi-tag' }, label)
              ),
              el('div', { className: 'kpi-num' }, `${count}`, el('small', {}, meta.unit)),
              el('div', { className: `kpi-bar ${meta.color.replace('kpi-', 'kpi-bar-')}` })
            );
          })
        );

        nodes = [
          farmerHeroCard,
          pgsCriteriaCard,
          farmerKpiGrid
        ];
      }

      if (demoUser) {
        nodes.unshift(el('div', { className: 'notice demo-tip' },
          el('b', {}, icon('info', 15), ' ปลูกของดี — ระบบบริหารมาตรฐานสินค้าเกษตรอินทรีย์ วิสาหกิจชุมชนผักไหม'),
          me.role === 'farmer'
            ? 'สำหรับเกษตรกร: บันทึกกิจกรรมการเกษตรสะดวกรวดเร็ว ลดภาระงานเอกสารซ้ำซ้อน พร้อมระบบยื่นขออนุมัติปัจจัยการผลิตก่อนใช้จริง'
            : 'สำหรับเจ้าหน้าที่ ICS: ควบคุมมาตรฐานและคัดกรองความเสี่ยงรายแปลงได้ทันที เพื่อป้องกันไม่ให้ข้อผิดพลาดของสมาชิกส่งผลกระทบต่อการรับรองของกลุ่ม'
        ));
      }
    } else if (tab === 'farmers') {
      const rows = await api('/ics/farmers');
      nodes = [
        el('div', { className: 'notice' },
          el('b', {}, icon('users', 15), ' เกษตรกรในความรับผิดชอบของคุณ'),
          el('p', {}, `เจ้าหน้าที่ ${me.name} (${me.agency_code}) รับผิดชอบดูแลเกษตรกรจำนวน ${rows.length} ราย`)
        )
      ];
      if (!rows.length) nodes.push(empty('ไม่มีเกษตรกรในความดูแล'));
      for (const farmer of rows) {
        nodes.push(card(
          el('div', { className: 'row between' },
            el('b', {}, `${farmer.agency_code} — ${farmer.name}`),
            farmer.pending_approvals
              ? el('span', { className: 'pill warn' }, icon('clock', 12), `คำขอรอตรวจ ${farmer.pending_approvals}`)
              : el('span', { className: 'pill success' }, icon('check', 12), 'ปกติ')
          ),
          el('p', {}, `แปลงปลูก: ${farmer.plot_count} แปลง • บันทึกกิจกรรม: ${farmer.activity_count} ครั้ง`),
          el('p', { className: 'muted' }, farmer.last_activity_date ? `กิจกรรมล่าสุด: ${farmer.last_activity_date}` : 'ยังไม่มีการบันทึกกิจกรรม'),
          el('div', { className: 'row' },
            el('button', {
              type: 'button',
              className: 'secondary btn-sm',
              onclick: async () => { tab = 'plots'; renderTabs(); await loadTab(); }
            }, icon('mapPin', 13), ' ดูแปลงปลูก'),
            el('button', {
              type: 'button',
              className: 'secondary btn-sm',
              onclick: async () => { tab = 'record'; renderTabs(); await loadTab(); }
            }, icon('calendar', 13), ' ดูกิจกรรม'),
            farmer.pending_approvals ? el('button', {
              type: 'button',
              className: 'btn-sm',
              onclick: async () => { tab = 'approval'; renderTabs(); await loadTab(); }
            }, icon('clipboard', 13), ' พิจารณาคำขอ') : null
          )
        ));
      }
    } else if (tab === 'plots') {
      if (me.role === 'farmer') {
        nodes.push(dataForm('plotForm', [
          el('h3', {}, icon('mapPin', 16), ' เพิ่มแปลงปลูกใหม่'),
          inputField('name', 'ชื่อแปลง (เช่น แปลง A-03 ข้าวหอมมะลิ 105)'),
          inputField('crop', 'พืชที่ปลูก (เช่น ข้าวหอมมะลิ 105, ถั่วเหลืองอินทรีย์)'),
          inputField('area', 'ขนาดพื้นที่ / รายละเอียด (เช่น 2 ไร่, แปลงโซน A)', 'text', false),
        ], 'บันทึกแปลงปลูก', '/plots'));
      }
      if (me.role !== 'farmer' && plots.length) {
        nodes.push(
          el('div', { className: 'row between search-actions-row' },
            el('b', { className: 'muted' }, `แปลงทั้งหมดในความดูแล (${plots.length} แปลง)`),
            el('button', {
              type: 'button',
              className: 'btn-sm secondary',
              onclick: () => {
                const headers = ['รหัสแปลง', 'ชื่อแปลง', 'พืชที่ปลูก', 'ขนาดพื้นที่', 'ระยะปรับเปลี่ยน', 'เจ้าของแปลง', 'วันที่สร้าง'];
                const dataRows = plots.map(p => [
                  p.plot_code || `P-${p.id}`,
                  p.name || '-',
                  p.crop || '-',
                  p.area || '-',
                  p.conversion_year || '-',
                  p.owner || p.farmer || '-',
                  dated(p.created_at)
                ]);
                exportCsv(`pakmaii-plots-${new Date().toISOString().slice(0, 10)}.csv`, headers, dataRows);
              }
            }, icon('fileText', 13), ' ส่งออกข้อมูลแปลง (CSV/Excel)')
          )
        );
      }
      const buildPlotCard = (plot) => {
        const conversionYear = plot.conversion_year || '';

        if (me.role !== 'farmer') {
          return card(
            el('div', { className: 'row between' },
              el('b', {}, `${plot.plot_code ? `[${plot.plot_code}] ` : ''}${plot.name}`),
              el('span', { className: 'pill success' }, icon('leaf', 11), plot.crop)
            ),
            conversionYear ? el('div', { className: 'plot-badges-row' },
              el('span', { className: 'pill' }, 'ระยะปรับเปลี่ยน: ' + conversionYear)
            ) : null,
            el('p', {}, `ขนาดพื้นที่: ${plot.area || 'ไม่ระบุ'}`),
            el('p', { className: 'muted' }, `เจ้าของแปลง: ${plot.owner || '-'}`),
            el('div', { className: 'row' },
              el('button', {
                type: 'button',
                className: 'secondary btn-sm',
                onclick: async () => { tab = 'reviews'; renderTabs(); await loadTab(); }
              }, icon('shield', 13), ' บันทึกผลตรวจแปลงนี้')
            )
          );
        }

        let editBox = null;
        const toggleBtn = el('button', { type: 'button', className: 'secondary btn-sm' }, icon('edit', 13), ' แก้ไขแปลง');
        const box = card(
          el('div', { className: 'row between' },
            el('b', {}, `${plot.plot_code ? `[${plot.plot_code}] ` : ''}${plot.name}`),
            el('span', { className: 'pill success' }, icon('leaf', 11), plot.crop)
          ),
          conversionYear ? el('div', { className: 'plot-badges-row' },
            el('span', { className: 'pill' }, 'ระยะปรับเปลี่ยน: ' + conversionYear)
          ) : null,
          el('p', {}, `ขนาดพื้นที่: ${plot.area || 'ไม่ระบุ'}`),
          el('small', { className: 'muted' }, `สร้างเมื่อ ${dated(plot.created_at)}`),
          el('div', { className: 'row mt-12' },
            toggleBtn,
            el('button', {
              type: 'button',
              className: 'secondary btn-sm',
              onclick: async () => { tab = 'record'; renderTabs(); await loadTab(); }
            }, icon('calendar', 13), ' บันทึกกิจกรรม'),
            el('button', {
              type: 'button',
              className: 'secondary btn-sm',
              onclick: async () => { tab = 'approval'; renderTabs(); await loadTab(); }
            }, icon('clipboard', 13), ' ขออนุมัติปัจจัย')
          )
        );

        toggleBtn.onclick = () => {
          if (editBox) {
            editBox.remove();
            editBox = null;
            toggleBtn.replaceChildren(icon('edit', 13), document.createTextNode(' แก้ไขแปลง'));
            return;
          }
          const editSubmitBtn = el('button', { type: 'submit' }, 'บันทึกการแก้ไข');
          const editForm = el('form', { className: 'edit-box' },
            el('h4', {}, `แก้ไขข้อมูล: ${plot.name}`),
            inputField('name', 'ชื่อแปลง', 'text', true, plot.name),
            inputField('crop', 'พืชที่ปลูก', 'text', true, plot.crop),
            inputField('area', 'ขนาดพื้นที่', 'text', false, plot.area || ''),
            el('div', { className: 'row' },
              editSubmitBtn,
              el('button', {
                type: 'button',
                className: 'secondary',
                onclick: () => {
                  editBox.remove();
                  editBox = null;
                  toggleBtn.replaceChildren(icon('edit', 13), document.createTextNode(' แก้ไขแปลง'));
                }
              }, 'ยกเลิก')
            )
          );
          editForm.addEventListener('submit', async e => {
            e.preventDefault();
            editSubmitBtn.disabled = true;
            try {
              await api(`/plots/${plot.id}`, 'PATCH', Object.fromEntries(new FormData(editForm)));
              notify('แก้ไขแปลงสำเร็จ');
              await loadTab();
            } catch (err) {
              if (!err.handled) notify(err.message);
            } finally {
              editSubmitBtn.disabled = false;
            }
          });
          editBox = editForm;
          box.append(editBox);
          toggleBtn.replaceChildren(icon('x', 13), document.createTextNode(' ปิดฟอร์มแก้ไข'));
        };

        return box;
      };

      if (!plots.length) {
        nodes.push(empty(me.role === 'farmer' ? 'ยังไม่มีแปลงปลูก เริ่มต้นด้วยการเพิ่มแปลงแรกด้านบน' : 'ไม่พบแปลงปลูกของเกษตรกรในความดูแล'));
      } else {
        const cardsList = el('div', { className: 'cards-list' }, ...plots.map(buildPlotCard));
        if (plots.length > 2) {
          const searchInput = el('input', {
            type: 'search',
            placeholder: 'ค้นหาชื่อแปลง, รหัสแปลง, หรือพืชที่ปลูก...',
            oninput: (e) => {
              const q = e.target.value.trim().toLowerCase();
              const filtered = plots.filter(p =>
                !q ||
                String(p.name || '').toLowerCase().includes(q) ||
                String(p.crop || '').toLowerCase().includes(q) ||
                String(p.owner || '').toLowerCase().includes(q) ||
                String(p.plot_code || '').toLowerCase().includes(q)
              );
              cardsList.replaceChildren(
                ...(!filtered.length ? [empty('ไม่พบแปลงที่ตรงกับคำค้นหา')] : filtered.map(buildPlotCard))
              );
            }
          });
          nodes.push(el('div', { className: 'search-filter-box' }, icon('search', 15), searchInput));
        }
        nodes.push(cardsList);
      }
    } else if (tab === 'record') {
      const rows = await api('/activities');
      if (me.role === 'farmer') {
        if (plots.length) {
          const todayIso = formatLocalIsoDate(new Date());
          const plotSel = plotSelect();
          const kindSel = selectField('kind', 'ประเภทกิจกรรม', ['ปลูก', 'ให้น้ำ', 'ใส่ปุ๋ย', 'กำจัดวัชพืช', 'ป้องกันกำจัดศัตรูพืช', 'เก็บเกี่ยว', 'อื่นๆ'].map(value => ({ value, label: value })));
          const dateField = inputField('activity_date', 'วันที่ทำกิจกรรม', 'date', true, todayIso);
          const inputUsedField = el('input', { name: 'input_used', type: 'text', maxlength: 120, placeholder: 'เช่น ปุ๋ยหมักอินทรีย์, แหนแดง, น้ำส้มควันไม้ (ถ้ามี)' });
          const amountField = el('input', { name: 'amount_qty', type: 'text', maxlength: 60, placeholder: 'เช่น 20 กก., 5 ลิตร (ถ้ามี)' });
          const detailsArea = el('textarea', { name: 'details', required: true, placeholder: 'ระบุการปฏิบัติงาน สภาพแปลง หรือสิ่งที่สังเกตเห็น' });
          const detailsError = el('small', { className: 'field-error hide' }, 'กรุณาระบุรายละเอียดกิจกรรมอย่างน้อยสั้น ๆ เพื่อให้ตรวจสอบย้อนกลับได้');
          const photoInput = el('input', { name: 'photo_url', type: 'url', placeholder: 'https://...' });
          const evidenceIdInput = el('input', { name: 'evidence_id', type: 'hidden', value: '' });

          const quickPresets = [
            { kindTag: 'ปลูก', label: 'ปลูกข้าวหอมมะลิ 105', kind: 'ปลูก', inputUsed: 'เมล็ดพันธุ์ข้าวหอมมะลิ 105 อินทรีย์', details: 'ปลูกข้าวหอมมะลิ 105 อินทรีย์ ตามมาตรฐานกลุ่มวิสาหกิจชุมชนผักไหม' },
            { kindTag: 'ให้น้ำ', label: 'สูบน้ำเข้าแปลงนา', kind: 'ให้น้ำ', inputUsed: '', details: 'สูบน้ำเข้าแปลงนาอินทรีย์ ตรวจคันนาและแนวกันชนรอบแปลงเรียบร้อย' },
            { kindTag: 'ใส่ปุ๋ย', label: 'ปล่อยแหนแดงบำรุงดิน', kind: 'ใส่ปุ๋ย', inputUsed: 'แหนแดงสด', details: 'ปล่อยแหนแดงในแปลงนาเพื่อบำรุงดินตามธรรมชาติ' },
            { kindTag: 'ใส่ปุ๋ย', label: 'พ่นน้ำหมักชีวภาพ', kind: 'ใส่ปุ๋ย', inputUsed: 'น้ำหมักชีวภาพสูตรกลุ่ม', details: 'ฉีดพ่นปุ๋ยหมักอินทรีย์และจุลินทรีย์หน่อกล้วยตามสูตรที่ได้รับอนุมัติจาก ICS' },
            { kindTag: 'ถอนหญ้า', label: 'ดายหญ้ารอบแปลง', kind: 'กำจัดวัชพืช', inputUsed: '', details: 'กำจัดวัชพืชด้วยแรงงานคนและตัดหญ้าแนวกันชนรอบแปลง ไม่ใช้สารเคมี' },
            { kindTag: 'ป้องกันแมลง', label: 'พ่นน้ำส้มควันไม้', kind: 'ป้องกันกำจัดศัตรูพืช', inputUsed: 'น้ำส้มควันไม้', details: 'ฉีดพ่นน้ำส้มควันไม้เจือจางเพื่อไล่แมลงและเพลี้ย' },
            { kindTag: 'บำรุงดิน', label: 'ไถกลบตอซังไม่เผาฟาง', kind: 'อื่นๆ', inputUsed: 'ปอเทืองบำรุงดิน', details: 'ไถกลบตอซังข้าวและหว่านปอเทืองบำรุงดิน ไม่เผาฟาง' },
            { kindTag: 'เก็บเกี่ยว', label: 'เก็บเกี่ยวผลผลิต', kind: 'เก็บเกี่ยว', inputUsed: '', details: 'เก็บเกี่ยวผลผลิตอินทรีย์ ทำความสะอาดเครื่องมือก่อนเก็บเกี่ยว' }
          ];

          const chipsGrid = el('div', { className: 'quick-chips-grid' });
          quickPresets.forEach(preset => {
            const btn = el('button', {
              type: 'button',
              className: 'chip-btn',
              onclick: () => {
                const kindSelect = kindSel.querySelector('select[name="kind"]');
                if (kindSelect) kindSelect.value = preset.kind;
                inputUsedField.value = preset.inputUsed;
                detailsArea.value = preset.details;
                detailsError.classList.add('hide');
                chipsGrid.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                notify(`เลือกกิจกรรม: "${preset.label}"`);
              }
            },
              el('span', { className: 'chip-tag' }, preset.kindTag),
              el('span', { className: 'chip-text' }, preset.label)
            );
            chipsGrid.append(btn);
          });

          let wizardStep = 1;
          const stepTabs = [
            el('div', { className: 'wizard-step-pill active' }, '1. แปลงและประเภท'),
            el('div', { className: 'wizard-step-pill' }, '2. รายละเอียดและปริมาณ'),
            el('div', { className: 'wizard-step-pill' }, '3. ทบทวนแล้วบันทึก')
          ];
          const reviewBox = el('div', { className: 'wizard-review-box' });
          const submitBtn = el('button', { type: 'submit', id: 'recordSubmitBtn' }, icon('checkCircle', 16), ' บันทึกกิจกรรม');

          const step1Panel = el('div', { className: 'wizard-panel' },
            plotSel,
            el('small', { className: 'muted helper-label' }, 'เลือกงานที่ใช้บ่อยจากปุ่มลัด หรือเลือกประเภทด้านล่าง:'),
            chipsGrid,
            kindSel,
            dateField,
            el('div', { className: 'row mt-12' },
              el('button', {
                type: 'button',
                id: 'wizardNext1Btn',
                onclick: () => setWizardStep(2)
              }, 'ถัดไป: ระบุรายละเอียด')
            )
          );

          const step2Panel = el('div', { className: 'wizard-panel hide' },
            el('label', {}, 'ปัจจัยที่ใช้ (ถ้ามี)', inputUsedField),
            el('label', {}, 'ปริมาณและหน่วย (ถ้ามี)', amountField),
            el('label', {},
              'รายละเอียดกิจกรรม',
              detailsArea,
              detailsError,
              createVoiceInput(detailsArea)
            ),
            el('label', {},
              'ภาพหลักฐาน / ลิงก์รูปภาพ (ถ้ามี)',
              photoInput,
              evidenceIdInput,
              createPhotoUploader(photoInput, {
                entityType: 'activity',
                getPlotId: () => plotSel.querySelector('select[name="plot_id"]')?.value,
                evidenceIdInput,
              })
            ),
            el('div', { className: 'row between mt-12' },
              el('button', { type: 'button', className: 'secondary', onclick: () => setWizardStep(1) }, 'ย้อนกลับ'),
              el('button', {
                type: 'button',
                id: 'wizardNext2Btn',
                onclick: () => {
                  if (!detailsArea.value.trim()) {
                    detailsError.classList.remove('hide');
                    detailsArea.focus();
                    return;
                  }
                  detailsError.classList.add('hide');
                  setWizardStep(3);
                }
              }, 'ถัดไป: ทบทวนข้อมูล')
            )
          );

          const step3Panel = el('div', { className: 'wizard-panel hide' },
            reviewBox,
            el('div', { className: 'row between mt-12' },
              el('button', { type: 'button', className: 'secondary', onclick: () => setWizardStep(2) }, 'แก้ไขข้อมูล'),
              submitBtn
            )
          );

          const renderReviewBox = () => {
            const plotSelectEl = plotSel.querySelector('select[name="plot_id"]');
            const kindSelectEl = kindSel.querySelector('select[name="kind"]');
            const dateInputEl = dateField.querySelector('input[name="activity_date"]');
            const plotLabel = plotSelectEl?.selectedOptions?.[0]?.textContent || '-';
            const inputText = [inputUsedField.value.trim(), amountField.value.trim()].filter(Boolean).join(' • ');
            reviewBox.replaceChildren(
              el('div', { className: 'passport-row' }, el('b', {}, 'แปลงปลูก:'), el('span', {}, plotLabel)),
              el('div', { className: 'passport-row' }, el('b', {}, 'ประเภทกิจกรรม:'), el('span', {}, kindSelectEl?.value || '-')),
              el('div', { className: 'passport-row' }, el('b', {}, 'วันที่ทำกิจกรรม:'), el('span', {}, dateInputEl?.value || '-')),
              inputText ? el('div', { className: 'passport-row' }, el('b', {}, 'ปัจจัยและปริมาณ:'), el('span', {}, inputText)) : null,
              el('div', { className: 'passport-row' }, el('b', {}, 'รายละเอียด:'), el('span', {}, detailsArea.value.trim() || '-')),
              evidenceIdInput.value
                ? el('div', { className: 'passport-row' }, el('b', {}, 'ภาพหลักฐาน:'), el('span', { className: 'pill success' }, `อัปโหลดแล้ว (#${evidenceIdInput.value})`))
                : (photoInput.value.startsWith('data:')
                    ? el('div', { className: 'passport-row' }, el('b', {}, 'ภาพตัวอย่าง (Demo):'), el('span', { className: 'pill warn' }, 'เก็บในเครื่องนี้'))
                    : null)
            );
          };

          const setWizardStep = (nextStep) => {
            wizardStep = nextStep;
            stepTabs.forEach((pill, idx) => {
              pill.classList.toggle('active', idx + 1 === wizardStep);
              pill.classList.toggle('done', idx + 1 < wizardStep);
            });
            step1Panel.classList.toggle('hide', wizardStep !== 1);
            step2Panel.classList.toggle('hide', wizardStep !== 2);
            step3Panel.classList.toggle('hide', wizardStep !== 3);
            if (wizardStep === 3) renderReviewBox();
          };

          const recordForm = el('form', { id: 'recordForm', className: 'card' },
            el('h3', {}, icon('calendar', 16), ' บันทึกกิจกรรมแปลง'),
            el('div', { className: 'wizard-steps' }, ...stepTabs),
            step1Panel,
            step2Panel,
            step3Panel
          );

          recordForm.addEventListener('submit', async event => {
            event.preventDefault();
            if (submitBtn.disabled) return;
            const formData = new FormData(recordForm);
            const rawDetails = String(formData.get('details') || '').trim();
            const used = String(formData.get('input_used') || '').trim();
            const qty = String(formData.get('amount_qty') || '').trim();
            const prefix = [used ? `ปัจจัย: ${used}` : '', qty ? `ปริมาณ: ${qty}` : ''].filter(Boolean).join(' | ');
            const finalDetails = prefix ? `${prefix} — ${rawDetails}` : rawDetails;

            submitBtn.disabled = true;
            submitBtn.textContent = 'กำลังบันทึก...';
            try {
              await api('/activities', 'POST', {
                plot_id: formData.get('plot_id'),
                kind: formData.get('kind'),
                activity_date: formData.get('activity_date'),
                details: finalDetails,
                photo_url: formData.get('photo_url') || '',
                evidence_id: formData.get('evidence_id') || ''
              });
              notify('บันทึกกิจกรรมสำเร็จ');
              await loadTab();
            } catch (error) {
              if (!error.handled) notify(error.message);
            } finally {
              submitBtn.disabled = false;
              submitBtn.replaceChildren(icon('checkCircle', 16), document.createTextNode(' บันทึกกิจกรรม'));
            }
          });

          nodes.push(recordForm);
        } else {
          nodes.push(empty('กรุณาเพิ่มแปลงปลูกก่อน จึงจะสามารถบันทึกกิจกรรมได้', 'ไปหน้าแปลงปลูก', async () => { tab = 'plots'; renderTabs(); await loadTab(); }));
        }
      }
      nodes.push(el('div', { className: 'notice' },
        el('b', {}, icon('calendar', 15), me.role === 'farmer' ? ' ประวัติการทำกิจกรรมในแปลง' : ' รายการกิจกรรมของเกษตรกรในความดูแล'),
        el('p', { className: 'muted' }, `บันทึกแล้วทั้งหมด ${rows.length} รายการ`)
      ));
      if (!rows.length) nodes.push(empty('ยังไม่มีการบันทึกกิจกรรม'));
      for (const item of rows) {
        const box = card(
          el('div', { className: 'row between' },
            el('b', {}, item.kind),
            el('span', { className: 'pill' }, icon('calendar', 11), item.activity_date)
          ),
          el('p', {}, `${item.plot_name} ${item.farmer ? `• เกษตรกร: ${item.farmer}` : ''}`),
          el('p', { className: 'muted' }, item.details)
        );
        if (item.evidence_id) {
          box.append(el('button', {
            type: 'button',
            className: 'link-btn',
            onclick: () => openEvidenceViewer(item.evidence_id)
          }, icon('camera', 13), ' ดูภาพหลักฐานที่อัปโหลด'));
        }
        if (item.photo_url) {
          try {
            const url = new URL(item.photo_url);
            if (url.protocol === 'https:') {
              box.append(el('a', { href: item.photo_url, target: '_blank', rel: 'noopener noreferrer', className: 'link-btn' }, icon('camera', 13), ' ดูลิงก์ภาพภายนอก'));
            } else if (item.photo_url.startsWith('data:')) {
              box.append(el('a', { href: item.photo_url, target: '_blank', rel: 'noopener noreferrer', className: 'link-btn' }, icon('camera', 13), ' ดูภาพตัวอย่าง (ในเครื่อง Demo)'));
            }
          } catch {
            if (item.photo_url.startsWith('data:')) {
              box.append(el('a', { href: item.photo_url, target: '_blank', rel: 'noopener noreferrer', className: 'link-btn' }, icon('camera', 13), ' ดูภาพตัวอย่าง (ในเครื่อง Demo)'));
            }
          }
        }
        nodes.push(box);
      }
    } else if (tab === 'approval') {
      const rows = await api('/approvals');
      if (me.role === 'farmer') {
        if (plots.length) {
          const inputNameField = el('input', { name: 'input_name', type: 'text', required: true, placeholder: 'เช่น ปุ๋ยหมักอินทรีย์ (ทำเอง), สารสกัดสะเดา' });
          const detailsField = el('textarea', { name: 'details', required: true, placeholder: 'ระบุแหล่งที่มา ส่วนประกอบ และวัตถุประสงค์การใช้เพื่อความโปร่งใส' });

          const presetFormulas = [
            {
              label: 'สูตรน้ำหมักสะเดาไล่แมลง (ใบสะเดา + พริก + กากน้ำตาล หมัก 7 วัน)',
              name: 'น้ำหมักสมุนไพรไล่แมลง (ทำเอง)',
              details: 'สูตร: ใบสะเดา + พริก + กากน้ำตาล หมัก 7 วัน ใช้ป้องกันหนอนเจาะฝักและเพลี้ยไฟ ตามเกณฑ์มาตรฐานเกษตรอินทรีย์ PGS'
            },
            {
              label: 'สูตรปุ๋ยหมักอินทรีย์บำรุงดิน (มูลวัวนมอินทรีย์ + แกลบดำ + จุลินทรีย์หน่อกล้วย)',
              name: 'ปุ๋ยหมักอินทรีย์บำรุงดิน (ทำเอง)',
              details: 'สูตร: มูลวัวในฟาร์มอินทรีย์ + แกลบดำ + รำอ่อน + จุลินทรีย์หน่อกล้วย หมักกลับกองครบ 30 วัน'
            }
          ];

          const formulaBtns = el('div', { className: 'formula-presets-box' },
            el('small', { className: 'muted helper-label' }, 'เลือกสูตรที่ได้รับการรับรองเบื้องต้นของกลุ่มวิสาหกิจชุมชน:'),
            ...presetFormulas.map(f =>
              el('button', {
                type: 'button',
                className: 'chip-btn chip-amber',
                onclick: () => {
                  inputNameField.value = f.name;
                  detailsField.value = f.details;
                  notify(`เลือกสูตร: ${f.name}`);
                }
              }, f.label)
            )
          );

          nodes.push(dataForm('approvalForm', [
            el('h3', {}, icon('clipboard', 16), ' ส่งคำขออนุมัติปัจจัยการผลิตก่อนใช้จริง'),
            formulaBtns,
            plotSelect(),
            el('label', {}, 'ชื่อปัจจัยการผลิต', inputNameField),
            el('label', {}, 'ส่วนประกอบ สูตรการผลิต และวิธีใช้', detailsField),
          ], 'ยื่นคำขอให้ ICS ตรวจสอบ', '/approvals'));
        } else {
          nodes.push(empty('กรุณาเพิ่มแปลงปลูกก่อน จึงจะสามารถส่งคำขออนุมัติปัจจัยการผลิตได้', 'ไปหน้าแปลงปลูก', async () => { tab = 'plots'; renderTabs(); await loadTab(); }));
        }
      }

      const pendingCount = rows.filter(r => r.status === 'pending').length;
      const approvedCount = rows.filter(r => r.status === 'approved').length;
      const rejectedCount = rows.filter(r => r.status === 'rejected').length;

      nodes.push(el('div', { className: 'notice' },
        el('b', {}, icon('clipboard', 15), me.role === 'farmer' ? ' ติดตามสถานะคำขออนุมัติปัจจัยการผลิต' : ' รายการคำขออนุมัติปัจจัยการผลิตของเกษตรกร'),
        el('p', { className: 'muted' }, `รอพิจารณา ${pendingCount} • อนุมัติแล้ว ${approvedCount} • ไม่อนุมัติ ${rejectedCount}`)
      ));

      if (!rows.length) nodes.push(empty('ยังไม่มีคำขออนุมัติปัจจัยการผลิต'));

      if (me.role === 'ics' && rows.length) {
        const plotActivities = await api('/activities').catch(() => []);
        let statusFilter = 'all';
        let queryFilter = '';
        let selectedId = (rows.find(r => r.status === 'pending') || rows[0])?.id;

        const listPane = el('div', { className: 'split-list-pane' });
        const detailPane = el('div', { className: 'split-detail-pane' });

        const getFilteredApprovals = () => {
          const q = queryFilter.trim().toLowerCase();
          return rows.filter(r => {
            const matchStatus = statusFilter === 'all' || r.status === statusFilter;
            const matchQ = !q ||
              String(r.input_name || '').toLowerCase().includes(q) ||
              String(r.plot_name || '').toLowerCase().includes(q) ||
              String(r.farmer || '').toLowerCase().includes(q);
            return matchStatus && matchQ;
          });
        };

        const renderDetail = (item) => {
          if (!item) {
            detailPane.replaceChildren(empty('เลือกคำขอจากรายการด้านซ้ายเพื่อตรวจสอบรายละเอียดและกิจกรรมของแปลง'));
            return;
          }
          const isPending = item.status === 'pending';
          const isApproved = item.status === 'approved';
          const statusTier = isPending ? 'warn' : isApproved ? 'normal' : 'risk';
          const statusLabel = isPending ? 'รอพิจารณา' : isApproved ? 'อนุมัติแล้ว' : 'ไม่อนุมัติ';
          const actsForPlot = plotActivities
            .filter(a => a.plot_id === item.plot_id)
            .sort((a, b) => String(b.activity_date || '').localeCompare(String(a.activity_date || '')))
            .slice(0, 5);

          const detailCard = card(
            el('div', { className: 'row between' },
              el('h3', {}, item.input_name),
              statusBadge(statusTier, statusLabel)
            ),
            el('p', { className: 'muted' }, `แปลง: ${item.plot_name} ${item.farmer ? `• เกษตรกร: ${item.farmer}` : ''}`),
            el('p', {}, item.details),
            el('small', { className: 'muted' }, `ยื่นคำขอเมื่อ ${dated(item.created_at)}`),
            item.comment ? el('div', { className: 'comment-box mt-12' },
              el('b', {}, icon('message', 13), ' ความเห็นของเจ้าหน้าที่ ICS: '),
              el('span', {}, item.comment),
              item.reviewed_at ? el('small', { className: 'muted block-meta' }, `พิจารณาเมื่อ ${dated(item.reviewed_at)}`) : null
            ) : null,
            el('div', { className: 'split-plot-context mt-12' },
              el('h4', {}, icon('calendar', 14), ' กิจกรรมล่าสุดของแปลงนี้'),
              create14DayRhythmTrack(item.plot_id, plotActivities, { title: `จังหวะบันทึกแปลง ${item.plot_name || ''}`.trim() }),
              actsForPlot.length
                ? el('div', { className: 'split-activity-list mt-10' },
                    ...actsForPlot.map(act => el('div', { className: 'summary-feed-item' },
                      el('div', { className: 'row between' },
                        el('b', {}, act.kind || 'กิจกรรม'),
                        el('small', { className: 'muted' }, act.activity_date || '-')
                      ),
                      el('small', { className: 'muted' }, act.details || '-')
                    ))
                  )
                : el('small', { className: 'muted' }, 'ยังไม่มีบันทึกกิจกรรมในแปลงนี้')
            )
          );

          if (isPending) {
            let selectedStatus = 'approved';
            const approveBtn = el('button', { type: 'button', className: 'btn-sm' }, icon('check', 13), ' อนุมัติ');
            const rejectBtn = el('button', { type: 'button', className: 'secondary btn-sm' }, icon('x', 13), ' ไม่อนุมัติ');
            approveBtn.onclick = () => { selectedStatus = 'approved'; approveBtn.className = 'btn-sm'; rejectBtn.className = 'secondary btn-sm'; };
            rejectBtn.onclick = () => { selectedStatus = 'rejected'; rejectBtn.className = 'btn-sm danger-btn'; approveBtn.className = 'secondary btn-sm'; };

            const commentArea = el('textarea', { placeholder: 'ระบุความเห็น ข้อแนะนำ หรือเหตุผลประกอบ (จำเป็นกรณีไม่อนุมัติ)' });
            const confirmBtn = el('button', { type: 'submit', className: 'btn-sm' }, 'บันทึกผลการพิจารณา');
            const decisionForm = el('form', { className: 'decision-box' },
              el('h4', {}, 'ตัดสินคำขอปัจจัยการผลิต'),
              el('div', { className: 'row mb-10' }, approveBtn, rejectBtn),
              el('label', {}, 'ความเห็น / ข้อเสนอแนะของเจ้าหน้าที่ ICS:', commentArea),
              el('div', { className: 'row' }, confirmBtn)
            );
            decisionForm.addEventListener('submit', async e => {
              e.preventDefault();
              const commentText = commentArea.value.trim();
              if (selectedStatus === 'rejected' && !commentText) {
                notify('กรุณาระบุเหตุผลกรณีไม่อนุมัติคำขอ');
                commentArea.focus();
                return;
              }
              const confirmMsg = selectedStatus === 'approved'
                ? `ยืนยันการอนุมัติคำขอ "${item.input_name}" หรือไม่?`
                : `ยืนยันการไม่อนุมัติคำขอ "${item.input_name}" หรือไม่?`;
              if (!window.confirm(confirmMsg)) return;

              confirmBtn.disabled = true;
              try {
                await api(`/approvals/${item.id}`, 'PATCH', {
                  status: selectedStatus,
                  comment: commentText || undefined,
                });
                notify(`บันทึกผลการพิจารณาเป็น "${selectedStatus === 'approved' ? 'อนุมัติ' : 'ไม่อนุมัติ'}" เรียบร้อย`);
                await loadTab();
              } catch (err) {
                if (!err.handled) notify(err.message);
                confirmBtn.disabled = false;
              }
            });
            detailCard.append(decisionForm);
          }

          detailPane.replaceChildren(detailCard);
        };

        const renderSplit = () => {
          const filtered = getFilteredApprovals();
          if (!filtered.some(r => r.id === selectedId)) {
            selectedId = filtered[0]?.id ?? null;
          }
          if (!filtered.length) {
            listPane.replaceChildren(empty('ไม่พบคำขอที่ตรงกับตัวกรอง'));
            detailPane.replaceChildren();
            return;
          }
          listPane.replaceChildren(...filtered.map(item => {
            const isPending = item.status === 'pending';
            const isApproved = item.status === 'approved';
            const statusTier = isPending ? 'warn' : isApproved ? 'normal' : 'risk';
            const statusLabel = isPending ? 'รอพิจารณา' : isApproved ? 'อนุมัติแล้ว' : 'ไม่อนุมัติ';
            return el('button', {
              type: 'button',
              className: `split-list-item ${item.id === selectedId ? 'active' : ''}`,
              onclick: () => {
                selectedId = item.id;
                renderSplit();
              }
            },
              el('div', { className: 'row between' },
                el('b', {}, item.input_name),
                statusBadge(statusTier, statusLabel)
              ),
              el('small', { className: 'muted' }, `${item.plot_name}${item.farmer ? ` • ${item.farmer}` : ''}`),
              el('small', { className: 'muted' }, dated(item.created_at))
            );
          }));
          renderDetail(filtered.find(r => r.id === selectedId) || null);
        };

        const filterBtns = [
          ['all', 'ทั้งหมด'],
          ['pending', 'รอพิจารณา'],
          ['approved', 'อนุมัติแล้ว'],
          ['rejected', 'ไม่อนุมัติ']
        ].map(([key, label]) => {
          const btn = el('button', {
            type: 'button',
            className: `chip ${key === 'all' ? 'active' : ''}`,
            onclick: () => {
              statusFilter = key;
              approvalFilterBar.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
              btn.classList.add('active');
              renderSplit();
            }
          }, label);
          return btn;
        });

        const approvalFilterBar = el('div', { className: 'ics-filter-bar' },
          el('div', { className: 'search-filter-box' },
            icon('search', 15),
            el('input', {
              type: 'search',
              placeholder: 'ค้นหาชื่อปัจจัย, แปลง, หรือเกษตรกร...',
              oninput: (e) => { queryFilter = e.target.value; renderSplit(); }
            })
          ),
          el('div', { className: 'filter-chips-row' }, ...filterBtns)
        );

        renderSplit();
        nodes.push(approvalFilterBar, el('div', { className: 'ics-split-layout' }, listPane, detailPane));
      } else {
        for (const item of rows) {
          const isPending = item.status === 'pending';
          const isApproved = item.status === 'approved';
          const pillClass = isPending ? 'pill warn' : isApproved ? 'pill success' : 'pill danger';
          const statusIcon = isPending ? icon('clock', 12) : isApproved ? icon('checkCircle', 12) : icon('xCircle', 12);
          const statusLabel = isPending ? 'รอพิจารณา' : isApproved ? 'อนุมัติแล้ว' : 'ไม่อนุมัติ';

          const box = card(
            el('div', { className: 'row between' },
              el('b', {}, item.input_name),
              el('span', { className: pillClass }, statusIcon, statusLabel)
            ),
            el('p', { className: 'muted' }, `แปลง: ${item.plot_name} ${item.farmer ? `• เกษตรกร: ${item.farmer}` : ''}`),
            el('p', {}, item.details),
            el('small', { className: 'muted' }, `ยื่นคำขอเมื่อ ${dated(item.created_at)}`)
          );

          if (item.comment) {
            box.append(el('div', { className: 'comment-box' },
              el('b', {}, icon('message', 13), ' ความเห็นของเจ้าหน้าที่ ICS: '),
              el('span', {}, item.comment),
              item.reviewed_at ? el('small', { className: 'muted block-meta' }, `พิจารณาเมื่อ ${dated(item.reviewed_at)}`) : null
            ));
          }

          nodes.push(box);
        }
      }
    } else if (tab === 'lots') {
      const rows = await api('/lots');
      if (me.role === 'farmer') {
        if (plots.length) {
          const todayIso = new Date().toISOString().slice(0, 10);
          nodes.push(dataForm('lotForm', [
            el('h3', {}, icon('package', 16), ' เพิ่มล็อตผลผลิตใหม่'),
            plotSelect(),
            inputField('code', 'รหัสล็อต (เช่น L-12, LOT-2026-001)'),
            inputField('crop', 'ชนิดผลผลิต (เช่น ข้าวหอมมะลิ 105, ถั่วเหลืองอินทรีย์)'),
            inputField('harvest_date', 'วันที่เก็บเกี่ยว', 'date', true, todayIso),
            inputField('quantity', 'ปริมาณผลผลิต (กิโลกรัม)', 'number'),
          ], 'บันทึกข้อมูลล็อตผลผลิต', '/lots'));
        } else {
          nodes.push(el('div', { className: 'notice' }, 'กรุณาเพิ่มแปลงปลูกก่อน จึงจะสามารถบันทึกล็อตผลผลิตได้'));
        }
      }

      nodes.push(el('div', { className: 'notice' },
        el('b', {}, icon('package', 15), ' การตรวจสอบย้อนกลับระดับแปลงสู่ล็อตผลผลิต'),
        el('p', { className: 'muted' }, 'เชื่อมโยงข้อมูลตั้งแต่แปลงปลูก → ประวัติกิจกรรม → ปัจจัยการผลิตที่อนุมัติ → ข้อมูลผลตรวจแปลง'),
        el('small', { className: 'muted' }, `รวมทั้งหมด ${rows.length} ล็อตผลผลิต`)
      ));

      if (!rows.length) nodes.push(empty('ยังไม่มีข้อมูลล็อตผลผลิต'));

      for (const item of rows) {
        const lotStatusBadge = item.ics_review_status === 'approved'
          ? statusBadge('normal', 'ผ่านการตรวจ ICS (ตัวอย่าง)')
          : statusBadge('warn', 'รอเชื่อมผลตรวจ');
        const box = card(
          el('div', { className: 'row between' },
            el('b', { className: 'lot-title-text' }, `ล็อต ${item.code || item.lot_code}`),
            lotStatusBadge
          ),
          el('p', {}, `ชนิดผลผลิต: ${item.crop}`),
          el('p', {}, `แปลงต้นทาง: ${item.linked_plots ? item.linked_plots : item.plot_name} ${item.farmer ? `• เกษตรกร: ${item.farmer}` : ''}`),
          el('p', { className: 'muted' }, `ปริมาณ: ${item.total_bags_or_kg || `${item.quantity} กก.`} • เก็บเกี่ยวเมื่อ: ${dated(item.harvest_date)}`),
          el('div', { className: 'row mt-12' },
            el('button', {
              type: 'button',
              className: 'btn-sm passport-trigger-btn',
              onclick: () => showStoryPassport(item)
            }, 'เปิดดูใบรับรองข้อมูลย้อนกลับ')
          )
        );
        nodes.push(box);
      }
    } else if (tab === 'reviews') {
      if (me.role === 'farmer') {
        nodes = [
          el('div', { className: 'notice' },
            el('b', {}, icon('shield', 15), ' ประวัติผลการตรวจประเมินแปลง'),
            el('p', { className: 'muted' }, 'ผลตรวจจะแสดงที่นี่เมื่อระบบเปิดให้เกษตรกรดูได้ โดยปัจจุบันเจ้าหน้าที่ ICS เป็นผู้บันทึกผลการตรวจประเมินตามเกณฑ์มาตรฐานกลุ่ม')
          ),
          empty('ผลตรวจจะแสดงที่นี่เมื่อระบบเปิดให้เกษตรกรดูได้ หากมีข้อสงสัยเกี่ยวกับผลการตรวจแปลง กรุณาติดต่อเจ้าหน้าที่ ICS ผู้รับผิดชอบของคุณ')
        ];
      } else {
        const rows = await api('/reviews');
        if (plots.length) {
          const noteArea = el('textarea', { name: 'note', required: true, placeholder: 'บันทึกรายละเอียดการตรวจแปลง ข้อสังเกต หรือข้อกำหนดให้เกษตรกรปรับปรุง' });
          const checklistItems = [
            'แนวกันชนรอบแปลงปลอดภัย ไม่มีการปนเปื้อนจากแปลงข้างเคียง',
            'ไม่พบการใช้สารเคมีสังเคราะห์หรือสารต้องห้ามตามมาตรฐาน PGS',
            'เกษตรกรบันทึกกิจกรรมสม่ำเสมอและสอดคล้องกับสภาพแปลงจริง',
            'ปัจจัยการผลิตทุกชนิดผ่านการอนุมัติจาก ICS ก่อนนำมาใช้งาน'
          ];
          const checklistBox = el('div', { className: 'checklist-chips-box' },
            el('small', { className: 'muted helper-label' }, 'เลือกหัวข้อการตรวจมาตรฐาน PGS เพื่อเพิ่มลงในบันทึก:'),
            el('div', { className: 'quick-chips-grid' },
              ...checklistItems.map(itemText =>
                el('button', {
                  type: 'button',
                  className: 'chip-btn',
                  onclick: () => {
                    noteArea.value = (noteArea.value ? noteArea.value + '\n' : '') + '• ' + itemText;
                    notify('เพิ่มหัวข้อการตรวจ PGS แล้ว');
                  }
                }, itemText)
              )
            )
          );

          const reviewPlotSel = plotSelect();
          const reviewEvidenceInput = el('input', { name: 'evidence_id', type: 'hidden', value: '' });
          nodes.push(dataForm('reviewForm', [
            el('h3', {}, icon('shield', 16), ' บันทึกผลการตรวจประเมินแปลง (ICS Inspection)'),
            reviewPlotSel,
            selectField('result', 'ผลการตรวจประเมิน', [
              { value: 'ผ่าน', label: 'ผ่านเกณฑ์มาตรฐานเกษตรอินทรีย์' },
              { value: 'ต้องแก้ไข', label: 'ต้องแก้ไขปรับปรุง' },
              { value: 'ติดตามเพิ่มเติม', label: 'ต้องติดตามเพิ่มเติม' },
            ]),
            checklistBox,
            el('label', {}, 'บันทึกผลตรวจและข้อเสนอแนะ', noteArea),
            el('div', { className: 'form-group' },
              el('label', {}, 'แนบภาพหลักฐานการตรวจแปลง (ถ้ามี)'),
              reviewEvidenceInput,
              createPhotoUploader(null, {
                entityType: 'review',
                getPlotId: () => reviewPlotSel.querySelector('select[name="plot_id"]')?.value,
                evidenceIdInput: reviewEvidenceInput,
              })
            ),
          ], 'บันทึกผลการตรวจรับรองแปลง', '/reviews'));
        } else {
          nodes.push(el('div', { className: 'notice' }, 'ไม่พบแปลงปลูกที่สามารถตรวจได้'));
        }

        nodes.push(el('div', { className: 'notice' },
          el('b', {}, icon('shield', 15), ' ประวัติการตรวจประเมินแปลงทั้งหมด'),
          el('p', { className: 'muted' }, `บันทึกแล้วทั้งหมด ${rows.length} ครั้ง`)
        ));

        if (rows.length) {
          nodes.push(
            el('div', { className: 'row between search-actions-row' },
              el('small', { className: 'muted' }, 'ข้อมูลประวัติการตรวจรับรองตามเกณฑ์มาตรฐาน PGS/ICS'),
              el('button', {
                type: 'button',
                className: 'btn-sm secondary',
                onclick: () => {
                  const headers = ['ลำดับ', 'ชื่อแปลง', 'ผลตรวจ', 'บันทึกและข้อเสนอแนะ', 'วันที่ตรวจ'];
                  const dataRows = rows.map(r => [
                    r.id,
                    r.plot_name || '-',
                    r.result || '-',
                    r.note || '-',
                    dated(r.created_at)
                  ]);
                  exportCsv(`pakmaii-inspections-${new Date().toISOString().slice(0, 10)}.csv`, headers, dataRows);
                }
              }, icon('fileText', 13), ' ส่งออกผลตรวจ (CSV/Excel)')
            )
          );
        }

        if (!rows.length) {
          nodes.push(empty('ยังไม่มีบันทึกผลตรวจแปลง'));
        } else {
          let resultFilter = 'all';
          let reviewQuery = '';
          const reviewsHost = el('div', { className: 'cards-list' });
          const renderReviewsList = () => {
            const q = reviewQuery.trim().toLowerCase();
            const filtered = rows.filter(item => {
              const matchResult = resultFilter === 'all' || item.result === resultFilter;
              const matchQ = !q ||
                String(item.plot_name || '').toLowerCase().includes(q) ||
                String(item.farmer_name || '').toLowerCase().includes(q) ||
                String(item.note || '').toLowerCase().includes(q);
              return matchResult && matchQ;
            });
            if (!filtered.length) {
              reviewsHost.replaceChildren(empty('ไม่พบผลตรวจที่ตรงกับตัวกรอง'));
              return;
            }
            reviewsHost.replaceChildren(...filtered.map(item => {
              const isPass = item.result === 'ผ่าน';
              const pillClass = isPass ? 'pill success' : 'pill warn';
              const resultIcon = isPass ? icon('checkCircle', 12) : icon('alert', 12);
              return card(
                el('div', { className: 'row between' },
                  el('b', {}, item.plot_name),
                  el('span', { className: pillClass }, resultIcon, item.result)
                ),
                item.farmer_name ? el('p', { className: 'muted' }, `เกษตรกร: ${item.farmer_name}`) : null,
                el('p', { className: 'pre-line-text' }, item.note),
                item.evidence_id ? el('button', {
                  type: 'button',
                  className: 'link-btn',
                  onclick: () => openEvidenceViewer(item.evidence_id)
                }, icon('camera', 13), ' ดูภาพหลักฐานที่อัปโหลด') : null,
                el('small', { className: 'muted' }, `ผู้ตรวจ: ${item.reviewer_name || 'เจ้าหน้าที่ ICS'} • ${dated(item.created_at)}`)
              );
            }));
          };

          const reviewFilterBtns = [
            ['all', 'ทั้งหมด'],
            ['ผ่าน', 'ผ่าน'],
            ['ต้องแก้ไข', 'ต้องแก้ไข'],
            ['ติดตามเพิ่มเติม', 'ติดตามเพิ่มเติม']
          ].map(([key, label]) => {
            const btn = el('button', {
              type: 'button',
              className: `chip ${key === 'all' ? 'active' : ''}`,
              onclick: () => {
                resultFilter = key;
                reviewFilterBar.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderReviewsList();
              }
            }, label);
            return btn;
          });

          const reviewFilterBar = el('div', { className: 'ics-filter-bar' },
            el('div', { className: 'search-filter-box' },
              icon('search', 15),
              el('input', {
                type: 'search',
                placeholder: 'ค้นหาชื่อแปลง, เกษตรกร, หรือบันทึกผลตรวจ...',
                oninput: (e) => { reviewQuery = e.target.value; renderReviewsList(); }
              })
            ),
            el('div', { className: 'filter-chips-row' }, ...reviewFilterBtns)
          );

          renderReviewsList();
          nodes.push(reviewFilterBar, reviewsHost);
        }
      }
    } else if (tab === 'risks') {
      const rows = await api('/risks');
      nodes = [
        el('div', { className: 'notice' },
          el('b', {}, icon('alert', 15), ' สัญญาณความเสี่ยงแปลงปลูก (Risk Monitoring)'),
          el('p', {}, 'ระบบช่วยคัดกรองความเสี่ยงอัตโนมัติ เพื่อให้เจ้าหน้าที่ ICS จัดลำดับลงพื้นที่ตรวจแปลงเป้าหมายได้รวดเร็ว')
        )
      ];
      if (!rows.length) {
        nodes.push(empty('ไม่พบสัญญาณความเสี่ยงในแปลงของเกษตรกรที่คุณดูแล'));
      }
      for (const item of rows) {
        const isPending = item.type === 'pending';
        const box = card(
          el('div', { className: 'row between' },
            el('b', {}, item.plot_name),
            el('span', { className: `pill ${isPending ? 'warn' : 'danger'}` },
              isPending ? icon('clock', 12) : icon('alert', 12),
              isPending ? 'คำขอรอพิจารณา' : 'ไม่มีความเคลื่อนไหว'
            )
          ),
          item.farmer_name ? el('p', { className: 'muted' }, `เกษตรกร: ${item.farmer_name}`) : null,
          el('p', {}, isPending
            ? `มีคำขอปัจจัยการผลิต "${item.input_name || '-'}" รอการพิจารณาตรวจสอบ`
            : 'ไม่พบบันทึกกิจกรรมการเกษตรในแปลงนี้ติดต่อกันเกิน 14 วัน อาจเสี่ยงต่อการละเลยหรือแปลงขาดการดูแล'),
          el('div', { className: 'row mt-8' },
            isPending ? el('button', {
              type: 'button',
              className: 'secondary btn-sm',
              onclick: async () => { tab = 'approval'; renderTabs(); await loadTab(); }
            }, icon('clipboard', 13), ' ไปที่คำขออนุมัติ') : el('button', {
              type: 'button',
              className: 'secondary btn-sm',
              onclick: async () => { tab = 'reviews'; renderTabs(); await loadTab(); }
            }, icon('shield', 13), ' ลงบันทึกตรวจแปลง')
          )
        );
        nodes.push(box);
      }
    }
    if (!nodes.length) nodes = [empty()];
    $('#content').replaceChildren(...nodes);
  } catch (error) {
    if (!error.handled) {
      $('#content').replaceChildren(el('div', { className: 'notice' },
        el('b', {}, icon('alert', 15), ' โหลดข้อมูลไม่สำเร็จ'),
        el('p', {}, error.message),
        el('button', { type: 'button', className: 'secondary btn-sm', onclick: () => loadTab() }, icon('refresh', 14), ' ลองใหม่อีกครั้ง')
      ));
    }
  }
}

start();
