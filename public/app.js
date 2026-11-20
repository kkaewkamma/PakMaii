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
const roleLabels = {
  farmer: 'เกษตรกร (Farmer)',
  ics: 'เจ้าหน้าที่ตรวจประเมินภายใน (ICS)',
  admin: 'ผู้ดูแลระบบ (System Admin)'
};
const statusLabels = { active: 'เปิดใช้งาน', unlinked: 'รอผูก LINE', disabled: 'ระงับ', used: 'ใช้แล้ว', expired: 'หมดอายุ', revoked: 'เพิกถอนแล้ว' };

import { ICONS, icon } from './js/core/icons.js';

import { parseLocalIsoDate, formatLocalIsoDate, statusBadge, el, notify, inputField, selectField, card, empty, dated } from './js/core/dom.js';
import { exportCsv } from './js/core/api.js';
import { create14DayRhythmTrack } from './js/core/rhythm.js';

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
  ['farmers', 'เกษตรกรในดูแล', 'users'],
  ['plots', 'แปลงเกษตรกร', 'mapPin'],
  ['record', 'กิจกรรมสมาชิก', 'calendar'],
  ['approval', 'พิจารณาคำขอ', 'clipboard'],
  ['risks', 'ความเสี่ยง', 'alert'],
  ['reviews', 'ผลตรวจแปลง', 'shield'],
  ['lots', 'ล็อตผลผลิต', 'package']
];
const tabsIcsDemo = tabsIcs;
const tabsAdmin = [
  ['overview', 'ภาพรวมระบบ', 'sprout'],
  ['invites', 'คำเชิญลงทะเบียน', 'user'],
  ['users', 'ผู้ใช้งาน', 'users'],
  ['assignments', 'มอบหมาย Farmer', 'clipboard']
];


import { setToken, setConfig, setDemoUser } from './js/core/state.js';

const FARMER_SCREEN_TITLES = {
  home: 'หน้าหลัก',
  plots: 'แปลงปลูก',
  record: 'บันทึกกิจกรรม',
  approval: 'ขอใช้ปัจจัย',
  reviews: 'ผลการตรวจ',
  lots: 'ล็อตผลผลิต'
};

function setRoleBodyClass(role) {
  document.body.classList.remove('role-farmer', 'role-ics', 'role-admin', 'farmer-on-home');
  if (role) document.body.classList.add(`role-${role}`);
}

function updateShellHeader() {
  const brandEl = $('.header-brand');
  const subNavEl = $('#farmerSubNav');
  const titleEl = $('#farmerScreenTitle');
  const demoBtnEl = $('#demoToolsBtn');

  document.body.classList.toggle('farmer-on-home', me?.role === 'farmer' && tab === 'home');

  if (me?.role === 'farmer') {
    const isSubScreen = tab !== 'home';
    brandEl?.classList.toggle('hide', isSubScreen);
    subNavEl?.classList.toggle('hide', !isSubScreen);
    if (titleEl && isSubScreen) {
      titleEl.textContent = FARMER_SCREEN_TITLES[tab] || '';
    }
    demoBtnEl?.classList.toggle('hide', !demoUser);
  } else {
    brandEl?.classList.remove('hide');
    subNavEl?.classList.add('hide');
    demoBtnEl?.classList.add('hide');
  }
}

function clearSession() {
  token = null; me = null; plots = []; lastInvitation = null; demoUser = null; tab = 'home';
  setToken(null);
  setDemoUser(null);
  sessionStorage.removeItem('token');
  demoSession?.logout();
  setRoleBodyClass(null);
  updateShellHeader();
}

async function loadConfig() {
  if (config?.liffId || config?.development || config?.demoOnly) return config;
  const response = await fetch('/api/config', { cache: 'no-store' });
  if (!response.ok) throw new Error('โหลดคอนฟิกไม่สำเร็จ');
  config = await response.json();
  setConfig(config);
  return config;
}

import { ensureLiff } from './js/core/auth.js';

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
  setDemoUser(null);
  demoSession?.logout();
  sessionStorage.removeItem('admin_login');
  token = data.token;
  setToken(token);
  sessionStorage.setItem('token', token);
  tab = data.redirectTo || 'home';
  await start();
}

async function acceptDemoLogin(role, code) {
  clearSession();
  sessionStorage.removeItem('logged_out');
  demoUser = demoSession.login(role, code);
  setDemoUser(demoUser);
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
  setRoleBodyClass(null);
  updateShellHeader();
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
      roleButton('farmer', 'sprout', 'Farmer (เกษตรกร)', 'บันทึกแปลง ถ่ายรูป ขออนุมัติปัจจัย'),
      roleButton('ics', 'clipboard', 'ICS (ผู้ตรวจประเมิน)', 'ดูกราฟวงกลม ตรวจแปลง คัดกรองความเสี่ยง')),
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
    catch (error) {
      const msg = (error?.code === 'ADMIN_DEMO_FORBIDDEN' && config?.demoOnly)
        ? 'โหมด Demo รองรับเฉพาะบทบาทเกษตรกร (Farmer) และเจ้าหน้าที่ ICS (บัญชี Admin ใช้งานเฉพาะระบบจริง/Staging)'
        : error.message;
      notify(msg);
      codeInput.focus();
    }
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
    el('p', { className: 'muted quick-persona-sub' }, 'แตะที่ปุ่มรายชื่อด้านล่าง 1 ครั้ง เพื่อเข้าทดลองใช้งานได้ทันทีโดยไม่ต้องพิมพ์รหัส'),
    el('div', { className: 'quick-persona-grid' },
      el('button', {
        type: 'button',
        className: 'persona-card-btn',
        onclick: () => acceptDemoLogin('farmer', 'F-STG-001')
      },
        el('div', { className: 'persona-badge risk' }, 'เกษตรกร • แปลง A-03 (ขาดบันทึก 14 วัน)'),
        el('b', {}, 'คุณสมปอง คำภา (F-STG-001)'),
        el('small', {}, 'หมู่ 3 บ้านผักไหม • ข้าวหอมมะลิ 105 อินทรีย์ & ธนาคารน้ำใต้ดิน')
      ),
      el('button', {
        type: 'button',
        className: 'persona-card-btn',
        onclick: () => acceptDemoLogin('farmer', 'F-STG-002')
      },
        el('div', { className: 'persona-badge warn' }, 'เกษตรกร • แปลง B-01 (รออนุมัติปัจจัย)'),
        el('b', {}, 'คุณบัวผัน ศรีห้วยทับทัน (F-STG-002)'),
        el('small', {}, 'หมู่ 5 บ้านหนองสิม • ถั่วเหลืองอินทรีย์หลังนา & ปุ๋ยหมักชีวภาพ')
      ),
      el('button', {
        type: 'button',
        className: 'persona-card-btn persona-ics',
        onclick: () => acceptDemoLogin('ics', 'ICS-STG-001')
      },
        el('div', { className: 'persona-badge ics' }, 'เจ้าหน้าที่ ICS • หัวหน้าชุดตรวจประเมิน'),
        el('b', {}, 'คุณวิชัย ผักไหม (ICS-STG-001)'),
        el('small', {}, 'ดูกราฟวงกลม อนุมัติปัจจัยการผลิต และบันทึกผลตรวจแปลง')
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
  setRoleBodyClass(null);
  updateShellHeader();
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
    setRoleBodyClass(me.role);
    if (me.role === 'admin' && !tabsAdmin.some(item => item[0] === tab)) tab = 'overview';
    if (me.role !== 'admin' && !currentTabs().some(item => item[0] === tab)) tab = 'home';
    plots = me.role === 'admin' ? [] : await api('/plots');

    $('#welcome').textContent = `สวัสดี, ${me.name}`;
    const roleIconName = me.role === 'farmer' ? 'sprout' : (me.role === 'ics' ? 'clipboard' : 'shield');

    const switcherBar = demoUser ? el('div', { className: 'role-switcher-bar' },
      el('span', { className: 'switcher-label' }, icon('refresh', 13), ' สลับบทบาททดสอบ:'),
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

    const avatarIcon = roleIconName;
    const codeLabelPrefix = me.role === 'ics' ? 'รหัสเจ้าหน้าที่ ICS : ' : 'รหัสผู้ดูแลระบบ : ';
    const displayFullName = me.thai_name ? `${me.thai_name} (${me.name})` : (me.name || me.agency_code);
    const villageOrRole = me.village
      ? `${codeLabelPrefix}${me.agency_code || me.name} • ${me.village}`
      : `${codeLabelPrefix}${me.agency_code || me.name} • ${roleLabels[me.role] || me.role} (${statusLabels[me.status] || me.status})`;

    if (me.role === 'farmer') {
      // Farmer uses a consumer banking-app pattern: greeting lives inside Farmer Home,
      // Demo Tools live in the compact header sheet, and sub-screens get the full viewport.
      $('#identity').replaceChildren();
    } else {
      $('#identity').replaceChildren(
        el('div', { className: 'identity-bar' },
          el('div', { className: 'identity-info' },
            el('div', { className: `user-avatar avatar-${me.role}` }, icon(avatarIcon, 28)),
            el('div', { className: 'identity-meta' },
              el('div', { className: 'user-code' },
                demoUser ? el('span', { className: 'demo-badge' }, 'DEMO') : null,
                displayFullName
              ),
              el('div', { className: 'user-role-text' }, villageOrRole)
            )
          ),
          el('button', { type: 'button', id: 'logoutButton', className: 'secondary btn-sm', onclick: logout },
            icon('logOut', 14),
            demoUser ? 'ออกจากโหมดทดลอง' : 'ออกจากระบบ'
          )
        ),
        switcherBar
      );
    }

    renderTabs();
    await loadTab();
  } catch (error) {
    if (!error.handled) showState('เกิดข้อผิดพลาด', error.message, 'ลองใหม่', () => start());
  }
}

import { openEvidenceViewer, openPhotoPreviewModal, createPhotoUploader } from './js/core/photo.js';
import {
  buildFarmerHomeView,
  buildFarmerPlotsView,
  buildFarmerActivityWizard,
  buildFarmerActivityHistorySection,
  buildFarmerApprovalView,
  buildFarmerReviewsView,
  buildFarmerLotsView,
  openContactIcsDialog
} from './js/views/farmer.js';
import { showStoryPassport } from './js/views/passport.js';
import { buildIcsAnalyticsChartsPanel, openInteractiveTutorial, checkAndShowIpTutorial } from './js/views/tutorial.js';
import { openPitchGuide } from './js/views/pitchGuide.js';

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


function currentTabs() {
  return me.role === 'admin' ? tabsAdmin : me.role === 'ics' ? tabsIcs : tabsFarmer;
}

function applyFontScale(isLarge) {
  document.documentElement.classList.toggle('large-text', isLarge);
  const btn = $('#fontScaleToggle');
  if (btn) {
    btn.setAttribute('aria-pressed', isLarge ? 'true' : 'false');
    btn.textContent = isLarge ? 'ก ขนาดปกติ' : 'ก+ ตัวอักษรใหญ่';
    btn.classList.toggle('active', isLarge);
  }
}

function toggleLargeText() {
  const next = !document.documentElement.classList.contains('large-text');
  sessionStorage.setItem('pakmaii_large_text', next ? '1' : '0');
  applyFontScale(next);
  notify(next ? 'เปิดโหมดตัวอักษรใหญ่พิเศษ (อ่านง่ายสำหรับผู้สูงอายุ)' : 'กลับสู่ขนาดตัวอักษรปกติ');
  return next;
}

function openDemoToolsSheet() {
  $('.more-sheet-overlay')?.remove();
  const previousFocus = document.activeElement;
  const closeSheet = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKeyDown);
    if (previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus();
    }
  };
  const onKeyDown = (e) => {
    if (e.key === 'Escape') closeSheet();
  };
  document.addEventListener('keydown', onKeyDown);

  const personas = [
    { role: 'farmer', code: 'F-STG-001', label: 'เกษตรกร A-03 (F-STG-001)', sub: 'คุณสมปอง คำภา • แปลง A-03' },
    { role: 'farmer', code: 'F-STG-002', label: 'เกษตรกร B-01 (F-STG-002)', sub: 'คุณบัวผัน ศรีห้วยทับทัน • แปลง B-01' },
    { role: 'farmer', code: 'F-STG-003', label: 'เกษตรกร C-12 (F-STG-003)', sub: 'คุณทองมี แก้วกัลยา • แปลง C-12' },
    { role: 'ics', code: 'ICS-STG-001', label: 'ผู้ตรวจประเมิน ICS (ICS-STG-001)', sub: 'คุณวิชัย ผักไหม • ตรวจประเมินกลุ่ม' }
  ];

  const closeBtn = el('button', { type: 'button', className: 'ghost btn-sm', onclick: closeSheet, 'aria-label': 'ปิดเครื่องมือทดสอบ' }, 'ปิด');

  const sheet = el('div', {
    className: 'more-sheet demo-tools-sheet',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'เครื่องมือทดสอบระบบ Demo'
  },
    el('div', { className: 'more-sheet-header' },
      el('b', {}, icon('refresh', 16), ' เครื่องมือทดสอบ (Demo Tools)'),
      closeBtn
    ),
    el('div', { className: 'demo-tools-section-title' }, 'สลับบัญชีทดสอบ'),
    el('div', { className: 'more-sheet-nav' },
      ...personas.map(p => el('button', {
        type: 'button',
        className: `demo-persona-btn ${me?.agency_code === p.code ? 'active' : ''}`,
        onclick: async () => {
          closeSheet();
          tab = 'home';
          await acceptDemoLogin(p.role, p.code);
        }
      },
        el('strong', {}, p.label),
        el('small', {}, p.sub)
      ))
    ),
    el('div', { className: 'demo-tools-section-title mt-8' }, 'เครื่องมือนำเสนอและรีเซ็ต'),
    el('div', { className: 'more-sheet-footer' },
      el('button', {
        type: 'button',
        className: 'secondary',
        onclick: () => {
          closeSheet();
          openPitchGuide({
            onSelectPersona: (role, code) => acceptDemoLogin(role, code),
            onSwitchTab: async (tabId) => { tab = tabId; renderTabs(); await loadTab(); scrollToTop(); },
            onOpenPassport: (sampleLot) => showStoryPassport(sampleLot)
          });
        }
      }, icon('play', 15), ' เปิดบทสาธิตระบบ 3 นาที'),
      el('button', {
        type: 'button',
        className: 'secondary',
        onclick: () => {
          closeSheet();
          openInteractiveTutorial({ onSelectPersona: (role, code) => acceptDemoLogin(role, code) });
        }
      }, icon('info', 15), ' คู่มือแนะนำการใช้งาน'),
      el('button', {
        type: 'button',
        className: 'secondary',
        onclick: async () => {
          if (confirm('ต้องการรีเซ็ตข้อมูล Demo ทั้งหมดกลับเป็นค่าเริ่มต้นหรือไม่?\n(ข้อมูลแปลงและกิจกรรมที่คุณเพิ่มระหว่างทดลองจะถูกล้าง)')) {
            demoBackend?.reset();
            closeSheet();
            notify('รีเซ็ตข้อมูล Demo กลับเป็นค่าเริ่มต้นเรียบร้อย');
            await loadTab();
          }
        }
      }, icon('refresh', 15), ' รีเซ็ตข้อมูล Demo กลับค่าเริ่มต้น')
    )
  );

  const overlay = el('div', {
    className: 'more-sheet-overlay',
    onclick: (e) => { if (e.target === overlay) closeSheet(); }
  }, sheet);
  document.body.append(overlay);
  closeBtn.focus();
}

function initFontScaleToggle() {
  const saved = sessionStorage.getItem('pakmaii_large_text') === '1';
  applyFontScale(saved);
  const btn = $('#fontScaleToggle');
  if (btn) {
    btn.onclick = () => toggleLargeText();
  }
  const backBtn = $('#farmerBackBtn');
  if (backBtn) {
    backBtn.onclick = async () => {
      tab = 'home';
      renderTabs();
      await loadTab();
      scrollToTop();
    };
  }
  const demoBtn = $('#demoToolsBtn');
  if (demoBtn) {
    demoBtn.onclick = () => openDemoToolsSheet();
  }
  const pitchBtn = $('#pitchGuideBtn');
  if (pitchBtn) {
    pitchBtn.onclick = () => openPitchGuide({
      onSelectPersona: (role, code) => acceptDemoLogin(role, code),
      onSwitchTab: async (tabId) => {
        tab = tabId;
        renderTabs();
        await loadTab();
      },
      onOpenPassport: (sampleLot) => showStoryPassport(sampleLot)
    });
  }
  const offlineBadge = $('#offlineStatusBadge');
  if (offlineBadge) {
    offlineBadge.onclick = () => notify('ระบบพร้อมใช้งานออฟไลน์: ข้อมูลกิจกรรมแปลงและคำขอถูกเก็บในเครื่อง และจะเชื่อมโยงข้อมูลอัตโนมัติเมื่อพบสัญญาณ');
  }
  const tutBtn = $('#tutorialHelpBtn');
  if (tutBtn) {
    tutBtn.onclick = () => openInteractiveTutorial({
      onSelectPersona: (role, code) => acceptDemoLogin(role, code)
    });
  }
  checkAndShowIpTutorial({
    onSelectPersona: (role, code) => acceptDemoLogin(role, code)
  });
}

function scrollToTop() {
  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
}

function renderTabs() {
  const items = currentTabs();
  $('#tabs').replaceChildren(...items.map(([id, label, iconName]) =>
    el('button', {
      type: 'button',
      className: tab === id ? 'active' : '',
      'aria-current': tab === id ? 'page' : undefined,
      onclick: async () => { tab = id; renderTabs(); await loadTab(); }
    },
      icon(iconName || 'sprout', 15),
      label
    )
  ));
  $('#tabs').classList.remove('hide');
  updateShellHeader();
  renderMobileDock();
}

function openMoreSheet(secondaryItems) {
  $('.more-sheet-overlay')?.remove();
  const previousFocus = document.activeElement;
  const closeSheet = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKeyDown);
    if (previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus();
    }
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
        'aria-current': tab === id ? 'page' : undefined,
        onclick: async () => {
          closeSheet();
          if (tab !== id) {
            tab = id;
            renderTabs();
            await loadTab();
            scrollToTop();
          }
        }
      },
        icon(iconName || 'sprout', 18),
        el('span', {}, label)
      )
    )
  );

  const isLargeNow = document.documentElement.classList.contains('large-text');
  const fontToggleSheetBtn = el('button', {
    type: 'button',
    className: 'secondary',
    onclick: () => {
      const next = toggleLargeText();
      fontToggleSheetBtn.textContent = next ? 'ก กลับสู่ตัวอักษรขนาดปกติ' : 'ก+ ขยายตัวอักษรใหญ่พิเศษ (ผู้สูงอายุ)';
    }
  }, isLargeNow ? 'ก กลับสู่ตัวอักษรขนาดปกติ' : 'ก+ ขยายตัวอักษรใหญ่พิเศษ (ผู้สูงอายุ)');

  const contactOfficerBtn = me?.role === 'farmer' ? el('button', {
    type: 'button',
    className: 'secondary',
    onclick: () => {
      closeSheet();
      openContactIcsDialog(me);
    }
  }, icon('headset', 16), ' ติดต่อเจ้าหน้าที่ ICS') : null;

  const demoToolsSheetBtn = (me?.role === 'farmer' && demoUser) ? el('button', {
    type: 'button',
    className: 'secondary',
    onclick: () => {
      closeSheet();
      openDemoToolsSheet();
    }
  }, icon('refresh', 16), ' เครื่องมือทดสอบ (สลับบัญชี Demo)') : null;

  const accountActions = el('div', { className: 'more-sheet-footer' },
    el('div', { className: 'more-sheet-account' },
      el('b', {}, me?.thai_name ? `${me.thai_name} (${me.name})` : (me?.name || '-')),
      el('small', { className: 'muted' }, `${roleLabels[me?.role] || me?.role} • ${me?.agency_code || '-'}`)
    ),
    contactOfficerBtn,
    demoToolsSheetBtn,
    fontToggleSheetBtn,
    el('button', {
      type: 'button',
      className: 'secondary',
      onclick: () => { closeSheet(); logout(); }
    }, icon('logOut', 16), demoUser ? 'ออกจากโหมดทดลอง' : 'ออกจากระบบ')
  );

  const closeBtn = el('button', { type: 'button', className: 'ghost btn-sm', onclick: closeSheet, 'aria-label': 'ปิดเมนูเพิ่มเติม' }, 'ปิด');
  const sheet = el('div', {
    className: 'more-sheet',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'เมนูเพิ่มเติม'
  },
    el('div', { className: 'more-sheet-header' },
      el('b', {}, 'เมนูเพิ่มเติม'),
      closeBtn
    ),
    secondaryItems.length ? navList : null,
    accountActions
  );

  const overlay = el('div', {
    className: 'more-sheet-overlay',
    onclick: (e) => { if (e.target === overlay) closeSheet(); }
  }, sheet);
  document.body.append(overlay);
  closeBtn.focus();
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
    home: me.role === 'farmer' ? 'หน้าหลัก' : 'ภาพรวม',
    farmers: 'เกษตรกร',
    plots: me.role === 'ics' ? 'แปลง' : 'แปลงปลูก',
    record: 'บันทึก',
    approval: me.role === 'ics' ? 'คำขอ' : 'ขอปัจจัย',
    risks: 'จุดเสี่ยง',
    reviews: 'ผลตรวจ',
    lots: 'ล็อต',
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
      'aria-current': tab === id ? 'page' : undefined,
      onclick: async () => {
        if (tab !== id) {
          tab = id;
          renderTabs();
          await loadTab();
          scrollToTop();
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


import { loadInvites, loadUsers, loadAssignments, dataForm, auditValidationBadge, buildAuditLogsSection, loadAdminOverview } from './js/views/admin.js';

import { buildIcsReviewsView, buildIcsRisksView } from './js/views/ics.js';

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
          const actionRow = el('div', { className: 'row ics-action-row' });
          if (w.pendingApprovalId) {
            actionRow.append(
              el('button', {
                type: 'button',
                className: 'btn-sm btn-primary-ics',
                onclick: async () => { tab = 'approval'; renderTabs(); await loadTab(); }
              }, icon('clipboard', 13), ' พิจารณาคำขอ')
            );
          } else if (w.targetTab === 'reviews' || w.action === 'นัดตรวจแปลง' || w.action === 'บันทึกตรวจ') {
            actionRow.append(
              el('button', {
                type: 'button',
                className: 'btn-sm btn-secondary-ics',
                onclick: async () => { tab = 'reviews'; renderTabs(); await loadTab(); }
              }, icon('shield', 13), ' ' + (w.action || 'นัดตรวจแปลง')),
              el('button', {
                type: 'button',
                className: 'btn-sm btn-line-ics',
                onclick: () => sharePlotRiskToLine(w)
              }, icon('message', 13), ' แชร์ข้อความทาง LINE')
            );
          } else if (w.code === 'A-03' && w.severity === 'risk' && demoUser) {
            actionRow.append(
              el('button', {
                type: 'button',
                className: 'btn-sm btn-secondary-ics',
                onclick: () => acceptDemoLogin('farmer', 'F-STG-001')
              }, icon('user', 12), ' สลับเป็นเกษตรกร A-03'),
              el('button', {
                type: 'button',
                className: 'btn-sm btn-line-ics',
                onclick: () => sharePlotRiskToLine(w)
              }, icon('message', 13), ' แชร์ข้อความทาง LINE')
            );
          } else if (w.severity === 'risk') {
            actionRow.append(
              el('button', {
                type: 'button',
                className: 'btn-sm btn-secondary-ics',
                onclick: async () => { tab = w.targetTab || 'lots'; renderTabs(); await loadTab(); }
              }, icon('alert', 13), ' ' + w.action),
              el('button', {
                type: 'button',
                className: 'btn-sm btn-line-ics',
                onclick: () => sharePlotRiskToLine(w)
              }, icon('message', 13), ' แชร์ข้อความทาง LINE')
            );
          } else {
            actionRow.append(
              el('button', {
                type: 'button',
                className: 'btn-sm btn-secondary-ics',
                onclick: async () => { tab = w.targetTab || 'lots'; renderTabs(); await loadTab(); }
              }, icon('shield', 13), ' ' + w.action)
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
            ? risks.slice(0, 5).map(r => {
              const sev = r.severity || (r.type === 'pending' ? 'medium' : 'high');
              const tier = sev === 'high' ? 'risk' : sev === 'medium' ? 'warn' : 'normal';
              const badgeText = r.title || (r.type === 'pending' ? 'คำขอค้างตรวจ' : 'ขาดบันทึก >14 วัน');
              const detailLine = r.explanation || (r.type === 'pending'
                ? `ปัจจัย: ${r.input_name || '-'}`
                : 'ไม่พบบันทึกกิจกรรมเกิน 14 วัน');
              return el('div', { className: 'summary-feed-item' },
                el('div', { className: 'row between' },
                  el('b', {}, r.plot_name || '-'),
                  statusBadge(tier, badgeText)
                ),
                el('small', { className: 'muted' }, `${detailLine}${r.farmer_name ? ` • ${r.farmer_name}` : ''}`)
              );
            })
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

        const icsChartsPanel = buildIcsAnalyticsChartsPanel({
          totalPlots,
          normalPlotsCount,
          pendingInput,
          riskAlerts,
          groupReadiness,
          plots,
          activities,
          isDemo
        });

        let icsTaskHero = null;
        if (pendingInput > 0) {
          icsTaskHero = el('div', { className: 'ics-task-hero tone-pending' },
            el('div', { className: 'ics-task-hero-body' },
              el('div', { className: 'ics-task-hero-icon' }, icon('clipboard', 20)),
              el('div', { className: 'ics-task-hero-text' },
                el('h4', {}, `มีคำขอปัจจัยรอตรวจพิจารณา ${pendingInput} รายการ`),
                el('p', {}, 'เกษตรกรส่งแผนปัจจัยการผลิตเข้ามา • ตรวจสอบความสอดคล้องตามมาตรฐานเพื่ออนุมัติให้ใช้งาน')
              )
            ),
            el('button', {
              type: 'button',
              className: 'ics-task-hero-btn',
              onclick: async () => { tab = 'approval'; renderTabs(); await loadTab(); scrollToTop(); }
            }, icon('clipboard', 14), ' พิจารณาคำขอทันที')
          );
        } else if (riskAlerts > 0) {
          icsTaskHero = el('div', { className: 'ics-task-hero tone-risk' },
            el('div', { className: 'ics-task-hero-body' },
              el('div', { className: 'ics-task-hero-icon' }, icon('alert', 20)),
              el('div', { className: 'ics-task-hero-text' },
                el('h4', {}, `พบแปลงเสี่ยงที่ต้องติดตาม ${riskAlerts} จุด`),
                el('p', {}, 'มีแปลงที่ขาดการบันทึกเกิน 14 วัน หรือประวัติไม่สอดคล้องตามเกณฑ์อินทรีย์')
              )
            ),
            el('button', {
              type: 'button',
              className: 'ics-task-hero-btn secondary',
              onclick: async () => { tab = 'risks'; renderTabs(); await loadTab(); scrollToTop(); }
            }, icon('alert', 14), ' จัดการจุดเสี่ยง')
          );
        } else {
          icsTaskHero = el('div', { className: 'ics-task-hero tone-normal' },
            el('div', { className: 'ics-task-hero-body' },
              el('div', { className: 'ics-task-hero-icon' }, icon('check', 20)),
              el('div', { className: 'ics-task-hero-text' },
                el('h4', {}, 'ระบบมาตรฐานอินทรีย์กลุ่มเรียบร้อยดี'),
                el('p', {}, 'ไม่มีคำขอค้างตรวจ และสมาชิกในความดูแลปฏิบัติตามเกณฑ์ PGS ครบถ้วน')
              )
            )
          );
        }

        nodes = [
          icsTaskHero,
          icsHeroCard,
          kpiGrid,
          icsChartsPanel,
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
                  className: 'btn-sm btn-secondary-ics desktop-only',
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
        nodes = buildFarmerHomeView({
          me,
          plots,
          activities,
          approvals,
          lots,
          pendingCount,
          navigateTab: async (targetTab) => {
            tab = targetTab;
            renderTabs();
            await loadTab();
            scrollToTop();
          }
        });
      }

      if (demoUser && me.role !== 'farmer') {
        nodes.unshift(el('div', { className: 'notice demo-tip' },
          el('b', {}, icon('info', 15), ' ปลูกของดี — ระบบบริหารมาตรฐานสินค้าเกษตรอินทรีย์ วิสาหกิจชุมชนผักไหม'),
          'สำหรับเจ้าหน้าที่ ICS: ควบคุมมาตรฐานและคัดกรองความเสี่ยงรายแปลงได้ทันที เพื่อป้องกันไม่ให้ข้อผิดพลาดของสมาชิกส่งผลกระทบต่อการรับรองของกลุ่ม'
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
        nodes.push(...buildFarmerPlotsView({
          plots,
          reloadTab: () => loadTab(),
          navigateTab: async (targetTab) => { tab = targetTab; renderTabs(); await loadTab(); scrollToTop(); }
        }));
      } else {
        if (plots.length) {
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
        const buildIcsPlotCard = (plot) => {
          const conversionYear = plot.conversion_year || '';
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
        };

        if (!plots.length) {
          nodes.push(empty('ไม่พบแปลงปลูกของเกษตรกรในความดูแล'));
        } else {
          const cardsList = el('div', { className: 'cards-list' }, ...plots.map(buildIcsPlotCard));
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
                  ...(!filtered.length ? [empty('ไม่พบแปลงที่ตรงกับคำค้นหา')] : filtered.map(buildIcsPlotCard))
                );
              }
            });
            nodes.push(el('div', { className: 'search-filter-box' }, icon('search', 15), searchInput));
          }
          nodes.push(cardsList);
        }
      }
    } else if (tab === 'record') {
      const rows = await api('/activities');
      if (me.role === 'farmer') {
        nodes.push(
          buildFarmerActivityWizard({
            plots,
            plotSelect,
            reloadTab: () => loadTab(),
            navigateTab: async (targetTab) => { tab = targetTab; renderTabs(); await loadTab(); scrollToTop(); }
          }),
          ...buildFarmerActivityHistorySection({
            plots,
            activities: rows,
            navigateTab: async (targetTab) => { tab = targetTab; renderTabs(); await loadTab(); scrollToTop(); }
          })
        );
      } else {
        nodes.push(el('div', { className: 'notice' },
          el('b', {}, icon('calendar', 15), ' รายการกิจกรรมของเกษตรกรในความดูแล'),
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
                box.append(
                  el('div', { className: 'activity-photo-row mt-8' },
                    el('img', {
                      src: item.photo_url,
                      className: 'activity-photo-thumb',
                      alt: `ภาพกิจกรรม ${item.kind || ''}`.trim(),
                      onclick: () => openPhotoPreviewModal(item.photo_url, `${item.kind || 'กิจกรรม'} • ${item.plot_name || ''}`.trim())
                    }),
                    el('button', {
                      type: 'button',
                      className: 'link-btn',
                      onclick: () => openPhotoPreviewModal(item.photo_url, `${item.kind || 'กิจกรรม'} • ${item.plot_name || ''}`.trim())
                    }, icon('camera', 13), ' ดูภาพตัวอย่าง (ในเครื่อง Demo)')
                  )
                );
              }
            } catch {
              if (item.photo_url.startsWith('data:')) {
                box.append(
                  el('div', { className: 'activity-photo-row mt-8' },
                    el('img', {
                      src: item.photo_url,
                      className: 'activity-photo-thumb',
                      alt: `ภาพกิจกรรม ${item.kind || ''}`.trim(),
                      onclick: () => openPhotoPreviewModal(item.photo_url, `${item.kind || 'กิจกรรม'} • ${item.plot_name || ''}`.trim())
                    }),
                    el('button', {
                      type: 'button',
                      className: 'link-btn',
                      onclick: () => openPhotoPreviewModal(item.photo_url, `${item.kind || 'กิจกรรม'} • ${item.plot_name || ''}`.trim())
                    }, icon('camera', 13), ' ดูภาพตัวอย่าง (ในเครื่อง Demo)')
                  )
                );
              }
            }
          }
          nodes.push(box);
        }
      }
    } else if (tab === 'approval') {
      const rows = await api('/approvals');
      if (me.role === 'farmer') {
        nodes.push(...buildFarmerApprovalView({
          plots,
          rows,
          me,
          plotSelect,
          reloadTab: () => loadTab(),
          navigateTab: async (targetTab) => { tab = targetTab; renderTabs(); await loadTab(); scrollToTop(); }
        }));
      } else {
        const pendingCount = rows.filter(r => r.status === 'pending').length;
        const approvedCount = rows.filter(r => r.status === 'approved').length;
        const rejectedCount = rows.filter(r => r.status === 'rejected').length;

        nodes.push(el('div', { className: 'notice' },
          el('b', {}, icon('clipboard', 15), ' รายการคำขออนุมัติปัจจัยการผลิตของเกษตรกร'),
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
            const approveBtn = el('button', { type: 'button', className: 'btn-sm btn-choice-approve active' }, icon('check', 13), ' อนุมัติ');
            const rejectBtn = el('button', { type: 'button', className: 'btn-sm btn-choice-reject' }, icon('x', 13), ' ไม่อนุมัติ');
            approveBtn.onclick = () => {
              selectedStatus = 'approved';
              approveBtn.className = 'btn-sm btn-choice-approve active';
              rejectBtn.className = 'btn-sm btn-choice-reject';
            };
            rejectBtn.onclick = () => {
              selectedStatus = 'rejected';
              rejectBtn.className = 'btn-sm btn-choice-reject active';
              approveBtn.className = 'btn-sm btn-choice-approve';
            };

            const commentArea = el('textarea', { placeholder: 'ระบุความเห็น ข้อแนะนำ หรือเหตุผลประกอบ (จำเป็นกรณีไม่อนุมัติ)' });
            const confirmBtn = el('button', { type: 'submit', className: 'btn-sm btn-primary-ics btn-confirm-decision' }, 'บันทึกผลการพิจารณา');
            const decisionForm = el('form', { className: 'decision-box' },
              el('h4', {}, 'ตัดสินคำขอปัจจัยการผลิต'),
              el('div', { className: 'row mb-10' }, approveBtn, rejectBtn),
              el('label', {}, 'ความเห็น / ข้อเสนอแนะของเจ้าหน้าที่ ICS:', commentArea),
              el('div', { className: 'row mt-10' }, confirmBtn)
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
      }
    } else if (tab === 'lots') {
      const rows = await api('/lots');
      if (me.role === 'farmer') {
        nodes.push(...buildFarmerLotsView({
          plots,
          rows,
          plotSelect,
          reloadTab: () => loadTab(),
          navigateTab: async (targetTab) => { tab = targetTab; renderTabs(); await loadTab(); scrollToTop(); },
          onOpenPassport: (item) => showStoryPassport(item)
        }));
      } else {
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
      }
    } else if (tab === 'reviews') {
      if (me.role === 'farmer') {
        nodes = await buildFarmerReviewsView();
      } else {
        nodes = await buildIcsReviewsView({ plots, plotSelect });
      }
    } else if (tab === 'risks') {
      nodes = await buildIcsRisksView();
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

window.__pakMaiiLoadTab = () => loadTab();
window.__pakMaiiNavigateTab = async (targetTab) => {
  tab = targetTab;
  renderTabs();
  await loadTab();
};
window.__pakMaiiGetPlots = () => plots;
window.__pakMaiiStart = (forceLogin) => start(forceLogin);
window.__pakMaiiShowLogin = (dev) => showLogin(dev);
window.__pakMaiiShowState = (title, msg, label, act) => showState(title, msg, label, act);
window.__pakMaiiShowRegistration = (idToken) => showRegistration(idToken);
window.__pakMaiiOnSessionExpired = () => {
  clearSession();
  showState('เซสชันหมดอายุ', 'กรุณาเข้าสู่ระบบผ่าน LINE อีกครั้ง', 'เข้าสู่ระบบใหม่', () => start(true));
};

initFontScaleToggle();
start();
