// Demo Readiness Verification Sprint — real browser interactions (local or live).
// Usage: node scripts/demo-readiness-sprint.js --base=http://localhost:4173 --tag=local
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const BASE = arg('base', 'http://localhost:4173').replace(/\/$/, '');
const TAG = arg('tag', 'local');
const OUT = path.join(process.cwd(), 'audit-screenshots', 'demo-sprint', TAG);
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const issues = [];
const consoleErrors = [];
const step = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`); };

async function metrics(page) {
  return page.evaluate(() => {
    const w = innerWidth;
    const clipped = [...document.querySelectorAll('#content button, #content a, #main-header button, #mobile-dock button')]
      .filter(e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return s.display !== 'none' && r.width > 0 && (r.right > w + 1 || r.left < -1); })
      .map(e => (e.id || e.textContent.trim()).slice(0, 40));
    const smallTargets = [...document.querySelectorAll('#content button, #mobile-dock button')]
      .filter(e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return s.display !== 'none' && r.width > 0 && r.height > 0 && r.height < 40; })
      .map(e => `${(e.id || e.textContent.trim()).slice(0, 30)}(${Math.round(e.getBoundingClientRect().height)}px)`);
    return { overflowX: document.documentElement.scrollWidth > w, scrollH: document.documentElement.scrollHeight, viewH: innerHeight, clipped, smallTargets };
  });
}

async function shoot(page, name) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const m = await metrics(page);
  if (m.overflowX) issues.push(`${name}: horizontal overflow`);
  if (m.clipped.length) issues.push(`${name}: clipped ${m.clipped.join(', ')}`);
  return m;
}

async function loginDemo(page, role, code) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const skip = page.locator('#tutorialSkipBtn');
  if (await skip.isVisible().catch(() => false)) await skip.click();
  if (role === 'ics') await page.click('#demoRole-ics');
  await page.fill('#demoCode', code);
  await page.click('#demoLoginButton');
  await page.waitForFunction(() => /role-(farmer|ics)/.test(document.body.className), null, { timeout: 10000 });
  await page.waitForTimeout(400);
}

async function switchPersona(page, code) {
  // Farmer shell: Demo Tools button; ICS shell: quick switcher pill.
  const demoBtn = page.locator('#demoToolsBtn');
  if (await demoBtn.isVisible().catch(() => false)) {
    await demoBtn.click();
    await page.locator(`.demo-persona-btn:has-text("${code}")`).click();
  } else {
    await page.locator(`.switcher-pill:has-text("${code}")`).first().click();
  }
  await page.waitForTimeout(700);
}

async function farmerTab(page, tabId) {
  const dock = { home: 'หน้าหลัก', plots: 'แปลงปลูก', record: 'บันทึก', approval: 'ขอปัจจัย' };
  if (dock[tabId]) {
    await page.locator(`#mobile-dock .dock-btn:has-text("${dock[tabId]}")`).first().click();
  } else {
    const more = { reviews: 'ผลตรวจแปลง', lots: 'ล็อตผลผลิต' };
    await page.locator('#mobile-dock .dock-btn:has-text("เพิ่มเติม")').click();
    await page.locator(`.more-sheet-item:has-text("${more[tabId]}")`).click();
  }
  await page.waitForTimeout(500);
}

const browser = await chromium.launch({ channel: 'msedge' });
const uniqueInput = `ปุ๋ยหมักทดสอบเดโม ${Date.now().toString().slice(-5)}`;
const screenMetrics = {};

try {
  // ---------- Part A: Farmer screens at 390x844 and 360x800 ----------
  for (const vp of [{ w: 390, h: 844 }, { w: 360, h: 800 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(`${vp.w}: ${m.text()}`); });
    page.on('pageerror', e => consoleErrors.push(`${vp.w}: pageerror ${e.message}`));
    await loginDemo(page, 'farmer', 'F-STG-001');
    const sfx = `${vp.w}`;
    screenMetrics[`home-${sfx}`] = await shoot(page, `home-${sfx}`);
    for (const t of ['plots', 'record', 'approval', 'reviews', 'lots']) {
      await farmerTab(page, t);
      screenMetrics[`${t}-${sfx}`] = await shoot(page, `${t}-${sfx}`);
    }
    await farmerTab(page, 'approval');
    await page.click('#openNewApprovalFormBtn');
    await page.waitForSelector('#approvalForm');
    screenMetrics[`approval-form-${sfx}`] = await shoot(page, `approval-form-${sfx}`);
    await ctx.close();
  }

  // ---------- Part B: Farmer -> ICS -> Farmer workflow + persistence ----------
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(`flow: ${m.text()}`); });
  page.on('pageerror', e => consoleErrors.push(`flow: pageerror ${e.message}`));

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
  await loginDemo(page, 'farmer', 'F-STG-001');
  step('B1 Farmer login F-STG-001', await page.locator('.farmer-home-greeting').isVisible());

  // Activity record
  await farmerTab(page, 'record');
  await page.click('#wizardNext1Btn');
  await page.fill('textarea[name="details"]', 'เดโมบันทึกกิจกรรมสด');
  await page.click('#wizardNext2Btn');
  await page.click('#recordSubmitBtn');
  const toastRec = await page.locator('#toast').textContent({ timeout: 5000 }).catch(() => '');
  step('B2 Farmer records activity', /บันทึกกิจกรรมสำเร็จ/.test(toastRec), toastRec?.trim());

  // New approval request
  await farmerTab(page, 'approval');
  await page.click('#openNewApprovalFormBtn');
  await page.fill('#approvalForm [name="input_name"]', uniqueInput);
  await page.fill('#approvalForm [name="details"]', 'สูตรทดสอบสำหรับเดโม อัตรา 100 กก./ไร่');
  await page.locator('#approvalForm button[type="submit"]').click();
  await page.waitForTimeout(800);
  const afterSubmit = await page.locator('#content').innerText();
  step('B3 Farmer submits new input request', afterSubmit.includes(uniqueInput), 'request visible in history');

  // Persistence on refresh
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const stillLogged = await page.locator('.farmer-home-greeting').isVisible().catch(() => false);
  step('B4 Session persists after refresh', stillLogged);
  await farmerTab(page, 'approval');
  step('B5 Request persists after refresh', (await page.locator('#content').innerText()).includes(uniqueInput));
  await farmerTab(page, 'home');
  const homeBanner = await page.locator('.farmer-status-banner').innerText().catch(() => '');
  step('B6 Home status banner reflects pending request', /รอพิจารณา/.test(homeBanner), homeBanner.replace(/\s+/g, ' ').slice(0, 80));

  // Switch to ICS
  await switchPersona(page, 'ICS-STG-001');
  const icsWelcome = await page.locator('#welcome').innerText();
  step('B7 Switch to ICS via Demo Tools', /ICS/.test(icsWelcome), icsWelcome);
  await shoot(page, 'ics-home-390');
  await page.locator('#mobile-dock .dock-btn:has-text("คำขอ")').first().click();
  await page.waitForTimeout(700);
  const listItem = page.locator(`.split-list-pane :text("${uniqueInput}")`).first();
  const icsSees = await listItem.isVisible().catch(() => false);
  step('B8 ICS sees farmer request', icsSees);
  if (icsSees) {
    await listItem.click();
    await page.waitForTimeout(400);
    await page.locator('.decision-box textarea').fill('อนุมัติสำหรับเดโม');
    await page.locator('.decision-box button[type="submit"]').click();
    const t = await page.locator('#toast').textContent({ timeout: 5000 }).catch(() => '');
    step('B9 ICS approves request', /อนุมัติ/.test(t || ''), t?.trim());
  }
  await shoot(page, 'ics-approval-390');

  // Back to farmer and refresh
  await switchPersona(page, 'F-STG-001');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const homeBannerAfter = await page.locator('.farmer-status-banner').innerText().catch(() => '');
  await farmerTab(page, 'approval');
  const heroText = await page.locator('.approval-hero-alert').innerText().catch(() => '');
  step('B10 Farmer hero & Home flip to approved after ICS review + refresh',
    heroText.includes(uniqueInput) && /ผ่านการอนุมัติ/.test(heroText) && /ผ่านการอนุมัติ/.test(homeBannerAfter),
    `hero="${heroText.replace(/\s+/g, ' ').slice(0, 70)}" home="${homeBannerAfter.replace(/\s+/g, ' ').slice(0, 50)}"`);
  await shoot(page, 'farmer-after-ics-390');

  // ICS review data cross-role (lots passport)
  await farmerTab(page, 'lots');
  await page.locator('.passport-trigger-btn').first().click();
  step('B11 Lot story passport opens', await page.locator('.passport-card').isVisible().catch(() => false));
  await page.keyboard.press('Escape');

  // ---------- Part C: Admin path ----------
  await page.locator('#mobile-dock .dock-btn:has-text("เพิ่มเติม")').click();
  await page.locator('button:has-text("ออกจากโหมดทดลอง")').first().click();
  await page.waitForSelector('#demoLoginForm', { timeout: 8000 });
  const adminRadio = await page.locator('#demoRole-admin').count();
  const adminBtn = await page.locator('#adminLoginButton').count();
  await page.fill('#demoCode', 'ADMIN-STG-001');
  await page.click('#demoLoginButton');
  await page.waitForTimeout(600);
  const adminToast = (await page.locator('#toast').textContent().catch(() => '')) || '';
  step('C1 Admin demo access', false, `demoRole-admin=${adminRadio}, adminLoginButton=${adminBtn}, demo code response="${adminToast.trim()}"`);
  await shoot(page, 'login-after-admin-attempt-390');
  await ctx.close();
} catch (err) {
  step('SCRIPT', false, err.message.split('\n')[0]);
} finally {
  await browser.close();
}

console.log('=== SCREEN METRICS ===');
console.log(JSON.stringify(screenMetrics, null, 1));
console.log('=== ISSUES ===', JSON.stringify(issues));
console.log('=== CONSOLE ERRORS ===', JSON.stringify(consoleErrors));
