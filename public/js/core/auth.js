'use strict';

import {
  token, setToken,
  me, setMe,
  plots, setPlots,
  tab, setTab,
  lastInvitation, setLastInvitation,
  liffInitPromise, setLiffInitPromise,
  demoUser, setDemoUser,
  loginRole, setLoginRole,
  demoSession,
  $
} from './state.js';
import { loadConfig, api } from './api.js';
import { el, notify, inputField } from './dom.js';

export function clearSession() {
  setToken(null);
  setMe(null);
  setPlots([]);
  setLastInvitation(null);
  setDemoUser(null);
  demoUser = null;
  setTab('home');
  sessionStorage.removeItem('token');
  demoSession?.logout();
}

export async function ensureLiff() {
  const cfg = await loadConfig();
  if (cfg.development) return null;
  if (!cfg.liffId) throw new Error('ยังไม่ได้ตั้งค่า LIFF ID สำหรับ environment นี้');
  for (let i = 0; i < 20 && !window.liff; i++) await new Promise(r => setTimeout(r, 100));
  if (!window.liff) throw new Error('โหลด LINE LIFF SDK ไม่สำเร็จ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่');
  liffInitPromise ||= window.liff.init({ liffId: cfg.liffId });
  await liffInitPromise;
  return window.liff;
}

export async function acceptLogin(data) {
  setDemoUser(null);
  demoUser = null;
  demoSession?.logout();
  sessionStorage.removeItem('admin_login');
  setToken(data.token);
  sessionStorage.setItem('token', data.token);
  setTab(data.redirectTo || 'home');
  if (typeof window.__pakMaiiStart === 'function') {
    await window.__pakMaiiStart();
  }
}

export async function acceptDemoLogin(role, code) {
  clearSession();
  sessionStorage.removeItem('logged_out');
  const user = demoSession.login(role, code);
  setDemoUser(user);
  demoUser = user;
  setLoginRole(user.role);
  setTab('home');
  if (typeof window.__pakMaiiStart === 'function') {
    await window.__pakMaiiStart();
  }
}

export async function logout() {
  try {
    if (token) await api('/logout', 'POST', {});
  } catch (error) {
    if (!error.handled) notify(error.message);
  } finally {
    clearSession();
    sessionStorage.removeItem('admin_login');
    sessionStorage.setItem('logged_out', '1');
    sessionStorage.removeItem('logged_out');
    notify('ออกจากระบบแล้ว');
    const cfg = await loadConfig().catch(() => null);
    if (typeof window.__pakMaiiShowLogin === 'function') {
      window.__pakMaiiShowLogin(Boolean(cfg?.development));
    }
  }
}

export async function completeLineLogin(liff) {
  sessionStorage.removeItem('admin_login');
  const idToken = liff.getIDToken();
  if (!idToken) {
    if (typeof window.__pakMaiiShowState === 'function') {
      return window.__pakMaiiShowState('ไม่พบ LINE Identity', 'กรุณาเปิด LIFF พร้อมสิทธิ์ openid', 'กลับหน้าเข้าสู่ระบบ', () => window.__pakMaiiStart?.(true));
    }
    return;
  }
  try {
    return await acceptLogin(await api('/login', 'POST', { idToken }));
  } catch (error) {
    if (error.code === 'REGISTRATION_REQUIRED') {
      if (typeof window.__pakMaiiShowRegistration === 'function') {
        return window.__pakMaiiShowRegistration(idToken);
      }
    }
    if (!error.handled && typeof window.__pakMaiiShowState === 'function') {
      window.__pakMaiiShowState('เข้าสู่ระบบไม่สำเร็จ', error.status === 403 ? 'บัญชีถูกปิดหรือยังไม่พร้อมใช้งาน' : error.message, 'กลับหน้าเข้าสู่ระบบ', () => window.__pakMaiiStart?.(true));
    }
  }
}

// Admin keeps the original LINE Login (LIFF) flow; flag survives the LINE redirect.
export async function adminLineLogin() {
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

export function showAdminLogin(development) {
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
        if (!idToken) {
          if (typeof window.__pakMaiiShowState === 'function') {
            return window.__pakMaiiShowState('ไม่พบ LINE Identity', 'กรุณาเปิด LIFF พร้อมสิทธิ์ openid');
          }
          return;
        }
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
        if (typeof window.__pakMaiiShowRegistration === 'function') {
          return window.__pakMaiiShowRegistration(liff?.getIDToken());
        }
      }
      if (!error.handled) notify(error.status === 403 ? 'บัญชีถูกปิดหรือยังไม่พร้อมใช้งาน' : error.message);
    }
  });
  $('#identity').replaceChildren(el('div', { className: 'notice' }, el('b', {}, 'เข้าสู่ระบบ Ready to Grow'), form,
    el('small', {}, development ? 'Development Mode เฉพาะ localhost' : 'Farmer, ICS และ Admin ใช้ LINE Login'),
    el('p', {}, el('button', { type: 'button', className: 'link-btn', onclick: () => window.__pakMaiiShowLogin?.(development) }, '← กลับไปหน้า Demo'))));
}
