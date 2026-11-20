'use strict';

export const $ = selector => document.querySelector(selector);
export const $$ = selector => Array.from(document.querySelectorAll(selector));

export const roleLabels = {
  farmer: 'เกษตรกร (Farmer)',
  ics: 'เจ้าหน้าที่ตรวจประเมินภายใน (ICS)',
  admin: 'ผู้ดูแลระบบ (System Admin)'
};
export const statusLabels = { active: 'เปิดใช้งาน', unlinked: 'รอผูก LINE', disabled: 'ระงับ', used: 'ใช้แล้ว', expired: 'หมดอายุ', revoked: 'เพิกถอนแล้ว' };

// Demo store is client-side only (public/demo.js); it never issues server sessions.
export const demoApi = window.ReadyToGrowDemo || null;
export const demoBackend = demoApi ? demoApi.createDemoBackend() : null;
export const demoSession = demoBackend ? demoApi.createDemoSession(demoBackend, sessionStorage) : null;

export let token = sessionStorage.getItem('token');
export let me = null;
export let plots = [];
export let tab = 'home';
export let lastInvitation = null;
export let config = null;
export let liffInitPromise = null;
export let demoUser = null;
export let loginRole = 'farmer';

export function setToken(v) { token = v; }
export function setMe(v) { me = v; }
export function setPlots(v) { plots = v; }
export function setTab(v) { tab = v; }
export function setLastInvitation(v) { lastInvitation = v; }
export function setConfig(v) { config = v; }
export function setLiffInitPromise(v) { liffInitPromise = v; }
export function setDemoUser(v) { demoUser = v; }
export function setLoginRole(v) { loginRole = v; }

export const state = {
  get token() { return token || sessionStorage.getItem('token'); },
  set token(v) { setToken(v); },
  get me() { return me; },
  set me(v) { setMe(v); },
  get plots() { return plots; },
  set plots(v) { setPlots(v); },
  get tab() { return tab; },
  set tab(v) { setTab(v); },
  get config() { return config; },
  set config(v) { setConfig(v); },
  get demoUser() { return demoUser || (demoSession && !token ? demoSession.restore() : null); },
  set demoUser(v) { setDemoUser(v); },
  get loginRole() { return loginRole; },
  set loginRole(v) { setLoginRole(v); }
};

export const tabsFarmer = [
  ['home', 'ภาพรวม', 'sprout'],
  ['plots', 'แปลงปลูก', 'mapPin'],
  ['record', 'บันทึกกิจกรรม', 'calendar'],
  ['approval', 'คำขอปัจจัย', 'clipboard'],
  ['reviews', 'ผลตรวจแปลง', 'shield'],
  ['lots', 'ล็อตผลผลิต', 'package']
];

export const tabsIcs = [
  ['home', 'ภาพรวม', 'sprout'],
  ['farmers', 'เกษตรกรในดูแล', 'users'],
  ['plots', 'แปลงเกษตรกร', 'mapPin'],
  ['record', 'กิจกรรมสมาชิก', 'calendar'],
  ['approval', 'พิจารณาคำขอ', 'clipboard'],
  ['risks', 'ความเสี่ยง', 'alert'],
  ['reviews', 'ผลตรวจแปลง', 'shield'],
  ['lots', 'ล็อตผลผลิต', 'package']
];

export const tabsIcsDemo = tabsIcs;

export const tabsAdmin = [
  ['overview', 'ภาพรวมระบบ', 'sprout'],
  ['invites', 'คำเชิญลงทะเบียน', 'user'],
  ['users', 'ผู้ใช้งาน', 'users'],
  ['assignments', 'มอบหมาย Farmer', 'clipboard']
];
