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
function empty(message = 'ยังไม่มีข้อมูล') {
  return card(el('div', { className: 'empty-box' },
    el('div', { className: 'empty-icon-wrap' }, icon('leaf', 24)),
    el('p', { className: 'empty-text' }, message)
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
    el('div', { className: 'quick-persona-title' }, 'เลือกบัญชีจำลองตามกรณีศึกษา (Demo Personas)'),
    el('div', { className: 'quick-persona-grid' },
      el('button', {
        type: 'button',
        className: 'persona-card-btn',
        onclick: () => acceptDemoLogin('farmer', 'F-STG-001')
      },
        el('div', { className: 'persona-badge risk' }, 'แปลง A-03 • ขาดบันทึก 14 วัน'),
        el('b', {}, 'เกษตรกร 01 (F-STG-001)'),
        el('small', {}, 'ทดสอบการบันทึกกิจกรรมเพื่อแก้ไขความเสี่ยงของแปลง')
      ),
      el('button', {
        type: 'button',
        className: 'persona-card-btn',
        onclick: () => acceptDemoLogin('farmer', 'F-STG-002')
      },
        el('div', { className: 'persona-badge warn' }, 'แปลง B-01 • รออนุมัติปัจจัย'),
        el('b', {}, 'เกษตรกร 02 (F-STG-002)'),
        el('small', {}, 'ยื่นคำขอสูตรปุ๋ยหมักอินทรีย์ทำเองก่อนใช้งานจริง')
      ),
      el('button', {
        type: 'button',
        className: 'persona-card-btn persona-ics',
        onclick: () => acceptDemoLogin('ics', 'ICS-STG-001')
      },
        el('div', { className: 'persona-badge ics' }, 'ผู้ตรวจรับรอง ICS'),
        el('b', {}, 'เจ้าหน้าที่ ICS (ICS-STG-001)'),
        el('small', {}, 'ตรวจสอบ Priority Watch-list อนุมัติปัจจัย และประเมินแปลง')
      )
    )
  );

  $('#identity').replaceChildren(el('div', { className: 'login-card' },
    quickPersonas,
    el('div', { className: 'login-divider' }, el('span', {}, 'หรือเลือกรหัสประจำตัวด้วยตนเอง')),
    el('p', { className: 'muted login-lead' }, 'เลือกบทบาท แล้วแตะรหัสตัวอย่างเพื่อทดลองระบบ'),
    form,
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
    if (me.role === 'admin' && !tabsAdmin.some(item => item[0] === tab)) tab = 'invites';
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
  const voiceBtn = el('button', {
    type: 'button',
    className: 'voice-btn',
    title: 'กดเพื่อพูดภาษาไทย แปลงเป็นข้อความอัตโนมัติ'
  }, icon('refresh', 13), ' บันทึกด้วยเสียง (Speech-to-Text)');

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;

  function simulateVoiceFallback() {
    const samples = [
      'ฉีดพ่นน้ำหมักสะเดาไล่แมลง แปลงข้าวหอมมะลิช่วงเช้า 20 ลิตร ตามสูตรที่ได้รับอนุมัติ',
      'ตรวจสภาพความชื้นดินและระดับน้ำในแปลงข้าวหอมมะลิ ปริมาณน้ำปกติ',
      'ปล่อยแหนแดงบำรุงดินตรึงไนโตรเจน 5 กิโลกรัมทั่วแปลง',
      'ไถกลบปอเทืองอายุ 90 วัน เพื่อเตรียมแปลงปลูกถั่วเหลืองอินทรีย์รอบถัดไป'
    ];
    const picked = samples[Math.floor(Math.random() * samples.length)];
    textarea.value = (textarea.value ? textarea.value + ' ' : '') + picked;
    notify(`บันทึกข้อความจากเสียง: "${picked}"`);
  }

  if (SpeechRec) {
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
        const transcript = e.results[0][0].transcript;
        textarea.value = (textarea.value ? textarea.value + ' ' : '') + transcript;
        notify(`แปลงเสียงสำเร็จ: "${transcript}"`);
      };

      recognition.onerror = () => {
        simulateVoiceFallback();
      };

      recognition.onend = () => {
        voiceBtn.classList.remove('recording');
        voiceBtn.replaceChildren(icon('refresh', 13), document.createTextNode(' บันทึกด้วยเสียง (Speech-to-Text)'));
      };
    } catch {}
  }

  voiceBtn.onclick = () => {
    if (recognition) {
      try { recognition.start(); }
      catch { simulateVoiceFallback(); }
    } else {
      simulateVoiceFallback();
    }
  };

  return el('div', { className: 'voice-mic-bar' }, voiceBtn);
}

function createPhotoUploader(photoUrlInput) {
  const fileInput = el('input', { type: 'file', accept: 'image/*', className: 'hide' });
  const previewImg = el('img', { className: 'photo-preview-img hide', alt: 'ตัวอย่างหลักฐานภาพถ่าย' });
  const previewWrap = el('div', { className: 'photo-preview-wrap' });

  const uploadBtn = el('button', {
    type: 'button',
    className: 'secondary btn-sm',
    onclick: () => fileInput.click()
  }, icon('camera', 13), ' อัปโหลดหลักฐานภาพถ่าย');

  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      previewImg.src = dataUrl;
      previewImg.classList.remove('hide');
      if (photoUrlInput) photoUrlInput.value = dataUrl;
      notify('โหลดรูปภาพหลักฐานเรียบร้อย');
    };
    reader.readAsDataURL(file);
  };

  previewWrap.append(uploadBtn, fileInput, previewImg);
  return previewWrap;
}

function showStoryPassport(lot) {
  const overlay = el('div', { className: 'passport-overlay' });
  const card = el('div', { className: 'passport-card' },
    el('div', { className: 'passport-header' },
      el('span', { className: 'passport-badge' }, 'ใบรับรองการตรวจสอบย้อนกลับ (Traceability Certificate)'),
      el('h3', { className: 'passport-title' }, 'ล็อตผลผลิต ' + (lot.code || lot.lot_code || 'L-12')),
      el('small', { className: 'passport-subtitle' }, 'วิสาหกิจชุมชนเกษตรอินทรีย์ตำบลผักไหม จ.ศรีสะเกษ')
    ),
    el('div', { className: 'passport-body' },
      el('div', { className: 'passport-row' },
        el('b', {}, 'ชนิดผลผลิต:'),
        el('span', {}, lot.crop || 'ข้าวหอมมะลิ 105 & ถั่วเหลืองอินทรีย์')
      ),
      el('div', { className: 'passport-row' },
        el('b', {}, 'แปลงต้นทาง:'),
        el('span', {}, lot.linked_plots || 'แปลง A-03, A-04 (ผ่านการตรวจรับรอง ICS)')
      ),
      el('div', { className: 'passport-row' },
        el('b', {}, 'ปริมาณสุทธิ:'),
        el('span', {}, lot.total_bags_or_kg || `${lot.quantity} กก.`)
      ),
      el('div', { className: 'passport-row' },
        el('b', {}, 'การควบคุมปัจจัยการผลิต:'),
        el('span', {}, 'ได้รับอนุมัติสูตรอินทรีย์ 100% ปลอดสารเคมีสังเคราะห์')
      ),
      el('div', { className: 'passport-row' },
        el('b', {}, 'การรับรองมาตรฐาน:'),
        el('span', { className: 'badge-normal' }, 'ผ่านการตรวจประเมิน PGS & ICS ครบถ้วน')
      ),
      el('div', { className: 'passport-qr' },
        el('div', { className: 'passport-qr-icon' }, icon('shield', 28)),
        el('b', {}, 'การยืนยันความถูกต้องผ่านระบบกลุ่ม (Chain of Custody)'),
        el('p', { className: 'muted passport-qr-desc' }, lot.story_highlights || 'ผลผลิตอินทรีย์ผ่านการรับรองระบบควบคุมภายใน (Internal Control System: ICS) วิสาหกิจชุมชนตำบลผักไหม จ.ศรีสะเกษ')
      ),
      el('button', {
        type: 'button',
        className: 'passport-close-btn',
        onclick: () => overlay.remove()
      }, 'ปิดหน้าต่างใบรับรอง')
    )
  );
  overlay.append(card);
  document.body.append(overlay);
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

async function loadTab() {
  try {
    if (me.role !== 'admin') plots = await api('/plots');
    let nodes = [];
    if (tab === 'invites') nodes = await loadInvites();
    else if (tab === 'users') nodes = await loadUsers();
    else if (tab === 'assignments') nodes = await loadAssignments();
    else if (tab === 'home') {
      const [activities, approvals, lots, revs] = await Promise.all([
        api('/activities'),
        api('/approvals'),
        api('/lots'),
        api('/reviews').catch(() => [])
      ]);
      const pendingCount = approvals.filter(item => item.status === 'pending').length;

      if (me.role === 'ics') {
        const [metrics, watchlist] = (demoBackend && demoUser)
          ? await Promise.all([api('/metrics').catch(() => null), api('/watchlist').catch(() => [])])
          : [null, []];
        const totalMembers = metrics?.totalMembers ?? 65;
        const totalPlots = metrics?.totalPlots ?? 120;
        const pendingInput = metrics?.pendingInputRequests ?? (pendingCount || 8);
        const riskAlerts = metrics?.riskAlerts ?? 12;
        const groupReadiness = metrics?.groupReadiness ?? 86;
        const watchRows = (watchlist && watchlist.length) ? watchlist : [
          { code: 'A-03', farmer: 'Demo Farmer 01', crop: 'ข้าวหอมมะลิ 105', conversion: 'Year 1', status: 'ขาดการบันทึกกิจกรรม 14 วัน', severity: 'risk', action: 'ติดตามด่วน', targetTab: 'record' },
          { code: 'B-01', farmer: 'Demo Farmer 02', crop: 'ถั่วเหลืองอินทรีย์แฟร์เทรด', conversion: 'Year 2', status: 'มีคำขอปัจจัยการผลิตรออนุมัติ', severity: 'warning', action: 'พิจารณาคำขอ', targetTab: 'approval' },
          { code: 'C-12', farmer: 'Demo Farmer 03', crop: 'ปอเทือง (Sunn Hemp)', conversion: 'Year 1', status: 'ประวัติไม่สอดคล้อง', severity: 'risk', action: 'นัดตรวจแปลง', targetTab: 'reviews' },
          { code: 'D-05', farmer: 'Demo Farmer 04', crop: 'ข้าวหอมมะลิอินทรีย์', conversion: 'Certified EU Organic', status: 'ปกติ (ผ่านเกณฑ์อินทรีย์)', severity: 'normal', action: 'ดูใบรับรอง', targetTab: 'lots' }
        ];

        const readinessFillClass = groupReadiness >= 95 ? 'fill-98' : groupReadiness >= 92 ? 'fill-94' : groupReadiness >= 89 ? 'fill-90' : 'fill-86';

        nodes = [
          el('div', { className: 'grid' },
            card(
              el('div', { className: 'stat-label' }, icon('users', 14), 'สมาชิกกลุ่มเกษตรกร'),
              el('div', { className: 'stat' }, `${totalMembers} ราย`),
              el('small', { className: 'muted' }, 'วิสาหกิจชุมชนผักไหม')
            ),
            card(
              el('div', { className: 'stat-label' }, icon('mapPin', 14), 'แปลงปลูกทั้งหมด'),
              el('div', { className: 'stat' }, `${totalPlots} แปลง`),
              el('small', { className: 'muted' }, 'รวมพื้นที่ 380 ไร่')
            ),
            card(
              el('div', { className: 'stat-label' }, icon('clock', 14), 'คำขอปัจจัยรอตรวจ'),
              el('div', { className: 'stat stat-amber' }, `${pendingInput} รายการ`),
              el('small', { className: 'muted' }, 'สูตรปุ๋ย/น้ำหมักอินทรีย์')
            ),
            card(
              el('div', { className: 'stat-label' }, icon('alert', 14), 'สัญญาณความเสี่ยง'),
              el('div', { className: 'stat stat-rose' }, `${riskAlerts} จุด`),
              el('small', { className: 'muted' }, 'ขาดบันทึก / ไม่สอดคล้อง')
            ),
            card(
              el('div', { className: 'stat-label' }, icon('shield', 14), 'ความพร้อมรับรองกลุ่ม (ICS)'),
              el('div', { className: 'stat stat-primary' }, `${groupReadiness}%`),
              el('div', { className: 'readiness-bar-box' },
                el('div', { className: `readiness-bar-fill ${readinessFillClass}` })
              )
            )
          ),
          el('div', { className: 'card watchlist-card' },
            el('div', { className: 'row between' },
              el('h3', {}, icon('alert', 16), ' Priority Watch-list: การเฝ้าระวังและบริหารความเสี่ยงรายแปลง'),
              el('span', { className: 'pill warn' }, 'การควบคุมความเสี่ยงเพื่อรักษามาตรฐานกลุ่ม')
            ),
            el('p', { className: 'muted card-lead' }, 'ระบบคัดกรองแปลงที่ต้องการการดูแลเร่งด่วน (ขาดการบันทึกเกิน 14 วัน / รออนุมัติปัจจัยการผลิต / ประวัติไม่สอดคล้อง) เพื่อให้เจ้าหน้าที่ ICS ติดตามได้ทันที'),
            el('div', { className: 'watchlist-table-wrap' },
              el('table', { className: 'watchlist-table' },
                el('thead', {},
                  el('tr', {},
                    el('th', {}, 'รหัสแปลง'),
                    el('th', {}, 'เกษตรกรผู้ดูแล'),
                    el('th', {}, 'พืช & ระยะปรับเปลี่ยน'),
                    el('th', {}, 'สถานะความเสี่ยง'),
                    el('th', {}, 'การดำเนินการ')
                  )
                ),
                el('tbody', {},
                  ...watchRows.map(w => {
                    const badgeClass = w.severity === 'risk' ? 'badge-risk' : w.severity === 'warning' ? 'badge-warning' : 'badge-normal';
                    const badgePrefix = w.severity === 'risk' ? '● ' : w.severity === 'warning' ? '● ' : '● ';
                    const actionCell = el('div', { className: 'row' });

                    if (w.pendingApprovalId) {
                      actionCell.append(
                        el('button', {
                          type: 'button',
                          className: 'btn-sm',
                          onclick: async () => {
                            try {
                              await api(`/approvals/${w.pendingApprovalId}`, 'PATCH', {
                                status: 'approved',
                                comment: 'อนุมัติสูตรปุ๋ยหมักอินทรีย์ตามเกณฑ์มาตรฐาน PGS & ICS'
                              });
                              notify(`อนุมัติคำขอปัจจัยแปลง ${w.code} เรียบร้อย`);
                              await loadTab();
                            } catch (err) {
                              if (!err.handled) notify(err.message);
                            }
                          }
                        }, icon('check', 13), ' อนุมัติทันที'),
                        el('button', {
                          type: 'button',
                          className: 'secondary btn-sm',
                          onclick: async () => { tab = 'approval'; renderTabs(); await loadTab(); }
                        }, 'ตรวจสอบ')
                      );
                    } else if (w.code === 'C-12' && w.severity === 'risk') {
                      actionCell.append(
                        el('button', {
                          type: 'button',
                          className: 'btn-sm',
                          onclick: async () => {
                            try {
                              await api('/reviews', 'POST', {
                                plot_id: w.plot_id || 3,
                                result: 'ผ่าน',
                                note: 'ตรวจแปลง C-12 เรียบร้อย เกษตรกรไถกลบปอเทืองตามเกณฑ์มาตรฐาน PGS'
                              });
                              notify('บันทึกผลตรวจแปลง C-12 ผ่านเกณฑ์เรียบร้อย');
                              await loadTab();
                            } catch (err) {
                              if (!err.handled) notify(err.message);
                            }
                          }
                        }, icon('shield', 13), ' ยืนยันผลตรวจผ่าน'),
                        el('button', {
                          type: 'button',
                          className: 'secondary btn-sm',
                          onclick: async () => { tab = 'reviews'; renderTabs(); await loadTab(); }
                        }, 'บันทึกตรวจ')
                      );
                    } else if (w.code === 'A-03' && w.severity === 'risk' && demoUser) {
                      actionCell.append(
                        el('button', {
                          type: 'button',
                          className: 'btn-sm secondary',
                          onclick: () => acceptDemoLogin('farmer', 'F-STG-001')
                        }, icon('user', 12), ' สลับเป็นเกษตรกร A-03')
                      );
                    } else {
                      actionCell.append(
                        el('button', {
                          type: 'button',
                          className: 'btn-sm secondary',
                          onclick: async () => { tab = w.targetTab || 'lots'; renderTabs(); await loadTab(); }
                        }, w.action)
                      );
                    }

                    return el('tr', {},
                      el('td', {}, el('b', { className: 'plot-code-tag' }, w.code)),
                      el('td', {}, w.farmer),
                      el('td', {}, `${w.crop} (${w.conversion})`),
                      el('td', {}, el('span', { className: badgeClass }, badgePrefix + w.status)),
                      el('td', {}, actionCell)
                    );
                  })
                )
              )
            )
          )
        ];
      } else {
        const myPlot = plots[0];
        const since14 = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
        const hasRecentAct = activities.some(a => a.activity_date >= since14);
        const hasPendingApp = pendingCount > 0;
        const statusBannerClass = !hasRecentAct ? 'farmer-status-card risk' : hasPendingApp ? 'farmer-status-card warn' : 'farmer-status-card normal';
        const statusTitle = !hasRecentAct
          ? `แจ้งเตือนการปฏิบัติงาน: แปลง ${myPlot?.plot_code || ''} ขาดการบันทึกกิจกรรมเกิน 14 วัน`
          : hasPendingApp
            ? `สถานะแปลง ${myPlot?.plot_code || ''}: มีคำขออนุมัติปัจจัยการผลิตรอการพิจารณาจาก ICS`
            : `สถานะแปลง ${myPlot?.plot_code || ''}: ปกติ — สอดคล้องกับมาตรฐานเกษตรอินทรีย์ครบถ้วน`;
        const statusDesc = !hasRecentAct
          ? 'ระบบตรวจพบการเว้นว่างการบันทึกกิจกรรม กรุณาบันทึกข้อมูลการเพาะปลูกล่าสุดเพื่อรักษามาตรฐานกลุ่มวิสาหกิจชุมชน'
          : hasPendingApp
            ? 'คำขอปัจจัยการผลิตอยู่ระหว่างการตรวจสอบโดยเจ้าหน้าที่ ICS ก่อนอนุญาตให้นำไปใช้ในแปลง'
            : 'ข้อมูลการเพาะปลูกและประวัติปัจจัยการผลิตได้รับการรับรอง พร้อมสำหรับการตรวจประเมินประจำรอบ';

        const statIcons = {
          'แปลงปลูก': 'mapPin',
          'กิจกรรม': 'calendar',
          'คำขอรอพิจารณา': 'clock',
          'ล็อตผลผลิต': 'package',
          'ผลตรวจแปลง': 'shield'
        };
        nodes = [
          el('div', { className: statusBannerClass },
            el('div', { className: 'farmer-status-header' },
              el('b', {}, statusTitle),
              myPlot?.conversion_year ? el('span', { className: 'pill' }, myPlot.conversion_year) : null
            ),
            el('p', {}, statusDesc),
            el('div', { className: 'row' },
              el('button', {
                type: 'button',
                className: 'btn-sm',
                onclick: async () => { tab = 'record'; renderTabs(); await loadTab(); }
              }, icon('calendar', 14), ' บันทึกกิจกรรมในแปลง'),
              el('button', {
                type: 'button',
                className: 'secondary btn-sm',
                onclick: async () => { tab = 'approval'; renderTabs(); await loadTab(); }
              }, icon('clipboard', 14), ' ขออนุมัติปัจจัยการผลิต'),
              el('button', {
                type: 'button',
                className: 'secondary btn-sm',
                onclick: async () => { tab = 'reviews'; renderTabs(); await loadTab(); }
              }, icon('shield', 14), ' ประวัติการตรวจประเมิน')
            )
          ),
          el('div', { className: 'grid' },
            [['แปลงปลูก', plots.length],
             ['กิจกรรม', activities.length],
             ['คำขอรอพิจารณา', pendingCount],
             ['ล็อตผลผลิต', lots.length],
             ['ผลตรวจแปลง', revs.length]].map(([label, count]) =>
              card(
                el('div', { className: 'stat-label' }, icon(statIcons[label] || 'sprout', 14), label),
                el('div', { className: 'stat' }, count)
              )
            )
          )
        ];
      }

      if (demoUser) {
        nodes.unshift(el('div', { className: 'notice demo-tip' },
          el('b', {}, icon('info', 15), ' ปลูกของดี — ระบบบริหารมาตรฐานสินค้าเกษตรอินทรีย์ วิสาหกิจชุมชนผักไหม'),
          me.role === 'farmer'
            ? 'สำหรับเกษตรกร: บันทึกกิจกรรมการเกษตรสะดวกรวดเร็ว ลดภาระงานเอกสารซ้ำซ้อน พร้อมระบบยื่นขออนุมัติปัจจัยการผลิตก่อนใช้จริง'
            : 'สำหรับเจ้าหน้าที่ ICS: ควบคุมมาตรฐานและคัดกรองความเสี่ยงรายแปลงแบบ Real-time เพื่อป้องกันไม่ให้ข้อผิดพลาดของสมาชิกส่งผลกระทบต่อการรับรองของกลุ่ม'
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
      if (!plots.length) {
        nodes.push(empty(me.role === 'farmer' ? 'ยังไม่มีแปลงปลูก เริ่มต้นด้วยการเพิ่มแปลงแรกด้านบน' : 'ไม่พบแปลงปลูกของเกษตรกรในความดูแล'));
      }
      for (const plot of plots) {
        const conversionYear = plot.conversion_year || 'Year 1';

        if (me.role !== 'farmer') {
          nodes.push(card(
            el('div', { className: 'row between' },
              el('b', {}, `${plot.plot_code ? `[${plot.plot_code}] ` : ''}${plot.name}`),
              el('span', { className: 'pill success' }, icon('leaf', 11), plot.crop)
            ),
            el('div', { className: 'plot-badges-row' },
              el('span', { className: 'pill' }, 'ระยะปรับเปลี่ยน: ' + conversionYear),
              el('span', { className: 'badge-normal' }, 'ระบบควบคุมภายใน PGS & ICS')
            ),
            el('p', {}, `ขนาดพื้นที่: ${plot.area || 'ไม่ระบุ'}`),
            el('p', { className: 'muted' }, `เจ้าของแปลง: ${plot.owner || '-'}`),
            el('div', { className: 'row' },
              el('button', {
                type: 'button',
                className: 'secondary btn-sm',
                onclick: async () => { tab = 'reviews'; renderTabs(); await loadTab(); }
              }, icon('shield', 13), ' บันทึกผลตรวจแปลงนี้')
            )
          ));
          continue;
        }

        let editBox = null;
        const toggleBtn = el('button', { type: 'button', className: 'secondary btn-sm' }, icon('edit', 13), ' แก้ไขแปลง');
        const box = card(
          el('div', { className: 'row between' },
            el('b', {}, `${plot.plot_code ? `[${plot.plot_code}] ` : ''}${plot.name}`),
            el('span', { className: 'pill success' }, icon('leaf', 11), plot.crop)
          ),
          el('div', { className: 'plot-badges-row' },
            el('span', { className: 'pill' }, 'ระยะปรับเปลี่ยน: ' + conversionYear),
            el('span', { className: 'badge-normal' }, 'มาตรฐานอินทรีย์กลุ่มผักไหม')
          ),
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

        nodes.push(box);
      }
    } else if (tab === 'record') {
      const rows = await api('/activities');
      if (me.role === 'farmer') {
        if (plots.length) {
          const todayIso = new Date().toISOString().slice(0, 10);
          const detailsArea = el('textarea', { name: 'details', required: true, placeholder: 'ระบุการปฏิบัติงาน เช่น ชนิดปุ๋ยอินทรีย์ อัตราส่วน แหนแดง ปอเทือง สภาพแปลง หรือปัญหาที่พบ' });
          const photoInput = el('input', { name: 'photo_url', type: 'url', placeholder: 'https:// หรือใช้ปุ่มอัปโหลดภาพหลักฐาน' });

          const quickPresets = [
            { label: 'ปลูกข้าวหอมมะลิ 105', kind: 'ปลูก', details: 'ปลูกข้าวหอมมะลิ 105 อินทรีย์ ตามมาตรฐานกลุ่มวิสาหกิจชุมชนผักไหม' },
            { label: 'ปลูกถั่วเหลืองอินทรีย์หลังนา', kind: 'ปลูก', details: 'ปลูกถั่วเหลืองอินทรีย์แฟร์เทรดหลังนา บำรุงดินและเพิ่มไนโตรเจนตามธรรมชาติ' },
            { label: 'ปล่อยแหนแดงบำรุงดิน', kind: 'ใส่ปุ๋ย', details: 'ปล่อยแหนแดง (Azolla) ในแปลงนา เพื่อตรึงไนโตรเจนและคลุมวัชพืชแทนสารเคมี' },
            { label: 'ไถกลบปอเทือง (90 วัน)', kind: 'กำจัดวัชพืช', details: 'ไถกลบปอเทืองอายุ 90 วัน เพื่อเป็นปุ๋ยพืชสดบำรุงดินก่อนทำนา' },
            { label: 'พ่นปุ๋ยหมักอินทรีย์', kind: 'ใส่ปุ๋ย', details: 'ฉีดพ่นปุ๋ยหมักอินทรีย์สูตรใบสะเดาและจุลินทรีย์หน่อกล้วยที่ผ่านการอนุมัติแล้ว' },
            { label: 'ตรวจแนวกันชนแปลงอินทรีย์', kind: 'ป้องกันกำจัดศัตรูพืช', details: 'ตรวจสอบแนวกันชนรอบแปลงและกำจัดวัชพืชด้วยแรงงาน ปลอดสารเคมีสังเคราะห์ 100%' }
          ];

          const chipsGrid = el('div', { className: 'quick-chips-grid' },
            quickPresets.map(preset =>
              el('button', {
                type: 'button',
                className: 'chip-btn',
                onclick: () => {
                  const form = $('#recordForm');
                  if (form) {
                    const kindSelect = form.querySelector('select[name="kind"]');
                    if (kindSelect) kindSelect.value = preset.kind;
                    detailsArea.value = preset.details;
                    notify(`เลือกกิจกรรม: "${preset.label}"`);
                  }
                }
              }, preset.label)
            )
          );

          const formNode = dataForm('recordForm', [
            el('h3', {}, icon('calendar', 16), ' บันทึกกิจกรรมในแปลงปลูก (Daily Farm Log)'),
            el('small', { className: 'muted helper-label' }, 'เลือกกิจกรรมมาตรฐาน หรือกดปุ่มบันทึกด้วยเสียงภาษาไทย:'),
            chipsGrid,
            plotSelect(),
            selectField('kind', 'ประเภทกิจกรรม', ['ปลูก', 'ให้น้ำ', 'ใส่ปุ๋ย', 'กำจัดวัชพืช', 'ป้องกันกำจัดศัตรูพืช', 'เก็บเกี่ยว', 'อื่นๆ'].map(value => ({ value, label: value }))),
            inputField('activity_date', 'วันที่ทำกิจกรรม', 'date', true, todayIso),
            el('label', {},
              'รายละเอียดกิจกรรม',
              detailsArea,
              createVoiceInput(detailsArea)
            ),
            el('label', {},
              'ลิงก์รูปภาพหลักฐาน HTTPS (ถ้ามี)',
              photoInput,
              createPhotoUploader(photoInput)
            ),
          ], 'บันทึกกิจกรรมเข้าสู่ระบบ', '/activities');

          nodes.push(formNode);
        } else {
          nodes.push(el('div', { className: 'notice' }, 'กรุณาเพิ่มแปลงปลูกก่อน จึงจะสามารถบันทึกกิจกรรมได้'));
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
        if (item.photo_url) {
          try {
            const url = new URL(item.photo_url);
            if (url.protocol === 'https:' || item.photo_url.startsWith('data:')) {
              box.append(el('a', { href: item.photo_url, target: '_blank', rel: 'noopener noreferrer', className: 'link-btn' }, icon('camera', 13), ' ดูภาพหลักฐาน'));
            }
          } catch {
            if (item.photo_url.startsWith('data:')) {
              box.append(el('a', { href: item.photo_url, target: '_blank', rel: 'noopener noreferrer', className: 'link-btn' }, icon('camera', 13), ' ดูภาพหลักฐาน'));
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
              details: 'สูตร: ใบสะเดา + พริก + กากน้ำตาล หมัก 7 วัน ใช้ป้องกันหนอนเจาะฝักและเพลี้ยไฟ ปลอดสารเคมีสังเคราะห์ 100%'
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
            el('h3', {}, icon('clipboard', 16), ' ส่งคำขออนุมัติปัจจัยการผลิตก่อนใช้จริง (Input Approval)'),
            formulaBtns,
            plotSelect(),
            el('label', {}, 'ชื่อปัจจัยการผลิต', inputNameField),
            el('label', {}, 'ส่วนประกอบ สูตรการผลิต และวิธีใช้', detailsField),
          ], 'ยื่นคำขอให้ ICS ตรวจสอบ', '/approvals'));
        } else {
          nodes.push(el('div', { className: 'notice' }, 'กรุณาเพิ่มแปลงปลูกก่อน จึงจะสามารถส่งคำขออนุมัติปัจจัยการผลิตได้'));
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

        // ICS inline decision UI
        if (me.role === 'ics' && isPending) {
          let decisionForm = null;
          const quickApproveBtn = el('button', {
            type: 'button',
            className: 'btn-sm',
            onclick: async () => {
              try {
                await api(`/approvals/${item.id}`, 'PATCH', {
                  status: 'approved',
                  comment: 'ผ่านเกณฑ์มาตรฐานเกษตรอินทรีย์ PGS อนุญาตให้ใช้ในแปลงได้'
                });
                notify(`อนุมัติ "${item.input_name}" เรียบร้อย`);
                await loadTab();
              } catch (err) {
                if (!err.handled) notify(err.message);
              }
            }
          }, icon('check', 13), ' อนุมัติทันที');

          const openDecideBtn = el('button', { type: 'button', className: 'secondary btn-sm' }, icon('clipboard', 13), ' ระบุความเห็น / ไม่อนุมัติ');
          const actionRow = el('div', { className: 'row mt-10' }, quickApproveBtn, openDecideBtn);
          box.append(actionRow);

          openDecideBtn.onclick = () => {
            if (decisionForm) { decisionForm.remove(); decisionForm = null; actionRow.classList.remove('hide'); return; }
            actionRow.classList.add('hide');

            let selectedStatus = 'approved';
            const approveBtn = el('button', { type: 'button', className: 'btn-sm' }, icon('check', 13), ' อนุมัติ');
            const rejectBtn = el('button', { type: 'button', className: 'secondary btn-sm' }, icon('x', 13), ' ไม่อนุมัติ');

            approveBtn.onclick = () => { selectedStatus = 'approved'; approveBtn.className = 'btn-sm'; rejectBtn.className = 'secondary btn-sm'; };
            rejectBtn.onclick = () => { selectedStatus = 'rejected'; rejectBtn.className = 'btn-sm danger-btn'; approveBtn.className = 'secondary btn-sm'; };

            const commentArea = el('textarea', { placeholder: 'ระบุความเห็น ข้อแนะนำ หรือเหตุผลประกอบ เช่น อนุญาตให้ใช้สูตรใบสะเดาหมัก 7 วัน อัตรา 50 ซีซี ต่อน้ำ 20 ลิตร' });
            const confirmBtn = el('button', { type: 'submit', className: 'btn-sm' }, 'บันทึกผลการพิจารณา');
            const cancelBtn = el('button', {
              type: 'button',
              className: 'secondary btn-sm',
              onclick: () => { decisionForm.remove(); decisionForm = null; actionRow.classList.remove('hide'); }
            }, 'ยกเลิก');

            decisionForm = el('form', { className: 'decision-box' },
              el('h4', {}, 'ผลการพิจารณาคำขอปัจจัยการผลิต'),
              el('div', { className: 'row mb-10' }, approveBtn, rejectBtn),
              el('label', {}, 'ความเห็น / ข้อเสนอแนะของเจ้าหน้าที่ ICS:', commentArea),
              el('div', { className: 'row' }, confirmBtn, cancelBtn)
            );

            decisionForm.addEventListener('submit', async e => {
              e.preventDefault();
              confirmBtn.disabled = true;
              try {
                await api(`/approvals/${item.id}`, 'PATCH', {
                  status: selectedStatus,
                  comment: commentArea.value.trim() || undefined,
                });
                notify(`บันทึกผลการพิจารณาเป็น "${selectedStatus === 'approved' ? 'อนุมัติ' : 'ไม่อนุมัติ'}" เรียบร้อย`);
                await loadTab();
              } catch (err) {
                if (!err.handled) notify(err.message);
                confirmBtn.disabled = false;
              }
            });

            box.append(decisionForm);
          };
        }

        nodes.push(box);
      }
    } else if (tab === 'lots') {
      const rows = await api('/lots');
      if (me.role === 'farmer') {
        if (plots.length) {
          const todayIso = new Date().toISOString().slice(0, 10);
          nodes.push(dataForm('lotForm', [
            el('h3', {}, icon('package', 16), ' เพิ่มล็อตผลผลิตใหม่ (Lot Traceability)'),
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
        el('b', {}, icon('package', 15), ' การตรวจสอบย้อนกลับระดับแปลงสู่ล็อตผลผลิต (Lot Traceability)'),
        el('p', { className: 'muted' }, 'เชื่อมโยงข้อมูลตั้งแต่แปลงปลูก ➔ ประวัติกิจกรรม ➔ ปัจจัยการผลิตที่อนุมัติ ➔ การรับรองโดยเจ้าหน้าที่ ICS'),
        el('small', { className: 'muted' }, `รวมทั้งหมด ${rows.length} ล็อตผลผลิต`)
      ));

      if (!rows.length) nodes.push(empty('ยังไม่มีข้อมูลล็อตผลผลิต'));

      for (const item of rows) {
        const box = card(
          el('div', { className: 'row between' },
            el('b', { className: 'lot-title-text' }, `ล็อต ${item.code || item.lot_code}`),
            el('span', { className: 'badge-normal' }, icon('checkCircle', 11), ' ผ่านการตรวจรับรอง ICS')
          ),
          el('p', {}, `ชนิดผลผลิต: ${item.crop}`),
          el('p', {}, `แปลงต้นทาง: ${item.linked_plots ? item.linked_plots : item.plot_name} ${item.farmer ? `• เกษตรกร: ${item.farmer}` : ''}`),
          el('p', { className: 'muted' }, `ปริมาณ: ${item.total_bags_or_kg || `${item.quantity} กก.`} • เก็บเกี่ยวเมื่อ: ${dated(item.harvest_date)}`),
          el('div', { className: 'row mt-12' },
            el('button', {
              type: 'button',
              className: 'btn-sm passport-trigger-btn',
              onclick: () => showStoryPassport(item)
            }, 'เปิดดูใบรับรอง Traceability Certificate')
          )
        );
        nodes.push(box);
      }
    } else if (tab === 'reviews') {
      const rows = await api('/reviews');
      if (me.role === 'ics') {
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

          nodes.push(dataForm('reviewForm', [
            el('h3', {}, icon('shield', 16), ' บันทึกผลการตรวจประเมินแปลง (ICS Inspection)'),
            plotSelect(),
            selectField('result', 'ผลการตรวจประเมิน', [
              { value: 'ผ่าน', label: 'ผ่านเกณฑ์มาตรฐานเกษตรอินทรีย์' },
              { value: 'ต้องแก้ไข', label: 'ต้องแก้ไขปรับปรุง' },
              { value: 'ติดตามเพิ่มเติม', label: 'ต้องติดตามเพิ่มเติม' },
            ]),
            checklistBox,
            el('label', {}, 'บันทึกผลตรวจและข้อเสนอแนะ', noteArea),
          ], 'บันทึกผลการตรวจรับรองแปลง', '/reviews'));
        } else {
          nodes.push(el('div', { className: 'notice' }, 'ไม่พบแปลงปลูกที่สามารถตรวจได้'));
        }
      }

      nodes.push(el('div', { className: 'notice' },
        el('b', {}, icon('shield', 15), me.role === 'farmer' ? ' ประวัติผลการตรวจประเมินแปลงจากเจ้าหน้าที่ ICS' : ' ประวัติการตรวจประเมินแปลงทั้งหมด'),
        el('p', { className: 'muted' }, me.role === 'farmer' ? 'รายงานผลการตรวจรับรองแปลงอินทรีย์โดยเจ้าหน้าที่ ICS ประจำกลุ่มของคุณ' : `บันทึกแล้วทั้งหมด ${rows.length} ครั้ง`)
      ));

      if (!rows.length) {
        nodes.push(empty(me.role === 'farmer' ? 'ยังไม่มีประวัติการตรวจประเมินแปลงจากเจ้าหน้าที่ ICS' : 'ยังไม่มีบันทึกผลตรวจแปลง'));
      }

      for (const item of rows) {
        const isPass = item.result === 'ผ่าน';
        const pillClass = isPass ? 'pill success' : 'pill warn';
        const resultIcon = isPass ? icon('checkCircle', 12) : icon('alert', 12);
        const box = card(
          el('div', { className: 'row between' },
            el('b', {}, item.plot_name),
            el('span', { className: pillClass }, resultIcon, item.result)
          ),
          item.farmer_name ? el('p', { className: 'muted' }, `เกษตรกร: ${item.farmer_name}`) : null,
          el('p', { className: 'pre-line-text' }, item.note),
          el('small', { className: 'muted' }, `ผู้ตรวจ: ${item.reviewer_name || 'เจ้าหน้าที่ ICS'} • ${dated(item.created_at)}`)
        );
        nodes.push(box);
      }
    }
            checklistBox,
            el('label', {}, 'บันทึกผลตรวจและข้อเสนอแนะ', noteArea),
          ], 'บันทึกผลการตรวจรับรองแปลง', '/reviews'));
        } else {
          nodes.push(el('div', { className: 'notice' }, 'ไม่พบแปลงปลูกที่สามารถตรวจได้'));
        }
      }

      nodes.push(el('div', { className: 'notice' },
        el('b', {}, icon('shield', 15), me.role === 'farmer' ? ' ประวัติผลการตรวจประเมินแปลงจากเจ้าหน้าที่ ICS' : ' ประวัติการตรวจประเมินแปลงทั้งหมด'),
        el('p', { className: 'muted' }, me.role === 'farmer' ? 'รายงานผลการตรวจรับรองแปลงอินทรีย์โดยเจ้าหน้าที่ ICS ประจำกลุ่มของคุณ' : `บันทึกแล้วทั้งหมด ${rows.length} ครั้ง`)
      ));

      if (!rows.length) {
        nodes.push(empty(me.role === 'farmer' ? 'ยังไม่มีประวัติการตรวจประเมินแปลงจากเจ้าหน้าที่ ICS' : 'ยังไม่มีบันทึกผลตรวจแปลง'));
      }

      for (const item of rows) {
        const isPass = item.result === 'ผ่าน';
        const pillClass = isPass ? 'pill success' : 'pill warn';
        const resultIcon = isPass ? icon('checkCircle', 12) : icon('alert', 12);
        const box = card(
          el('div', { className: 'row between' },
            el('b', {}, item.plot_name),
            el('span', { className: pillClass }, resultIcon, item.result)
          ),
          item.farmer_name ? el('p', { className: 'muted' }, `เกษตรกร: ${item.farmer_name}`) : null,
          el('p', { className: 'pre-line-text' }, item.note),
          el('small', { className: 'muted' }, `ผู้ตรวจ: ${item.reviewer_name || 'เจ้าหน้าที่ ICS'} • ${dated(item.created_at)}`)
        );
        nodes.push(box);
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
    if (!error.handled) $('#content').replaceChildren(el('div', { className: 'notice' }, error.message));
  }
}

start();
