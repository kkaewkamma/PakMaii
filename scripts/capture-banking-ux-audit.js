import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const BASE_URL = 'http://localhost:4173/';
const OUT_DIR = path.join(process.cwd(), 'audit-screenshots', 'banking-ux');

function parsePhase() {
  const arg = process.argv.find(a => a.startsWith('--phase='));
  const phase = arg ? arg.split('=')[1] : 'before';
  if (phase !== 'before' && phase !== 'after') {
    throw new Error(`Unsupported phase: ${phase}`);
  }
  return phase;
}

async function loginFarmer(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle' });

  const skip = page.locator('button:has-text("ข้าม"), #tutorialCloseBtn, #tutorialSkipBtn');
  if (await skip.count() > 0 && await skip.first().isVisible()) {
    await skip.first().click();
    await page.waitForTimeout(200);
  }

  await page.fill('#demoCode', 'F-STG-001');
  await page.click('#demoLoginButton');
  await page.waitForSelector('#farmerPrimaryRecordBtn', { timeout: 10000 });
  await page.waitForTimeout(350);
}

async function collectViewportMetrics(page, viewportName) {
  return page.evaluate((vpName) => {
    const winW = window.innerWidth;
    const docScrollW = document.documentElement.scrollWidth;
    const headerButtons = [...document.querySelectorAll('#main-header button, #main-header a')]
      .filter(el => {
        const s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
      });
    const clippedHeaderButtons = headerButtons
      .map(el => {
        const r = el.getBoundingClientRect();
        return { id: el.id || el.className, left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) };
      })
      .filter(r => r.right > winW || r.left < 0);

    const tabsEl = document.querySelector('#tabs');
    const tabsVisible = tabsEl ? (getComputedStyle(tabsEl).display !== 'none' && tabsEl.getBoundingClientRect().width > 0) : false;

    const dockEl = document.querySelector('#mobile-dock');
    const dockVisible = dockEl ? (getComputedStyle(dockEl).display !== 'none' && dockEl.getBoundingClientRect().height > 0) : false;

    const switcherEl = document.querySelector('.role-switcher-bar');
    const switcherVisible = switcherEl ? (getComputedStyle(switcherEl).display !== 'none' && switcherEl.getBoundingClientRect().height > 0) : false;

    const heroIdentityEl = document.querySelector('#identity');
    const identityHeight = heroIdentityEl ? Math.round(heroIdentityEl.getBoundingClientRect().height) : 0;

    const contentEl = document.querySelector('#content');
    const contentCards = contentEl ? [...contentEl.children].filter(el => getComputedStyle(el).display !== 'none').length : 0;

    return {
      viewport: vpName,
      innerWidth: winW,
      scrollWidth: docScrollW,
      horizontalOverflow: docScrollW > winW,
      scrollHeight: document.documentElement.scrollHeight,
      clippedHeaderButtons,
      visibleHeaderButtonsCount: headerButtons.length,
      tabsSidebarVisible: tabsVisible,
      mobileDockVisible: dockVisible,
      roleSwitcherVisible: switcherVisible,
      identityHeight,
      topLevelContentSections: contentCards
    };
  }, viewportName);
}

async function runBefore(browser) {
  const consoleErrors = [];

  // 390x844 Mobile Baseline
  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobilePage = await mobileCtx.newPage();
  mobilePage.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(`mobile: ${msg.text()}`); });
  await loginFarmer(mobilePage);

  await mobilePage.screenshot({ path: path.join(OUT_DIR, 'before-farmer-home-390.png') });
  await mobilePage.screenshot({ path: path.join(OUT_DIR, 'before-farmer-home-390-full.png'), fullPage: true });
  const metrics390 = await collectViewportMetrics(mobilePage, '390x844');
  await mobileCtx.close();

  // 1280x800 Desktop Baseline
  const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const desktopPage = await desktopCtx.newPage();
  desktopPage.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(`desktop: ${msg.text()}`); });
  await loginFarmer(desktopPage);

  await desktopPage.screenshot({ path: path.join(OUT_DIR, 'before-farmer-home-1280.png') });
  const metrics1280 = await collectViewportMetrics(desktopPage, '1280x800');
  await desktopCtx.close();

  console.log('=== BEFORE BASELINE METRICS ===');
  console.log(JSON.stringify({ metrics390, metrics1280, consoleErrors }, null, 2));
}

async function runAfter(browser) {
  const viewports = [
    { name: '320x700', width: 320, height: 700, isMobile: true, hasTouch: true },
    { name: '360x800', width: 360, height: 800, isMobile: true, hasTouch: true },
    { name: '390x844', width: 390, height: 844, isMobile: true, hasTouch: true },
    { name: '430x932', width: 430, height: 932, isMobile: true, hasTouch: true },
    { name: '768x1024', width: 768, height: 1024, isMobile: false, hasTouch: true },
    { name: '1280x800', width: 1280, height: 800, isMobile: false, hasTouch: false }
  ];

  const results = [];
  const consoleErrors = [];

  for (const vp of viewports) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    const page = await ctx.newPage();
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(`${vp.name}: ${msg.text()}`); });
    await loginFarmer(page);
    const metrics = await collectViewportMetrics(page, vp.name);
    results.push(metrics);

    if (vp.name === '390x844') {
      await page.screenshot({ path: path.join(OUT_DIR, 'after-farmer-home-390.png') });
      await page.screenshot({ path: path.join(OUT_DIR, 'after-farmer-home-390-full.png'), fullPage: true });

      // Demo Tools modal
      await page.click('#demoToolsBtn');
      await page.waitForSelector('[aria-label="เครื่องมือทดสอบระบบ Demo"]', { timeout: 5000 });
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(OUT_DIR, 'after-farmer-demo-tools-390.png') });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    } else if (vp.name === '1280x800') {
      await page.screenshot({ path: path.join(OUT_DIR, 'after-farmer-home-1280.png') });
    }

    // Verify sub-screen header bounds on all viewports
    await page.locator('.farmer-shortcut-btn:has-text("แปลงของฉัน")').click();
    await page.waitForSelector('#farmerSubNav:not(.hide)', { timeout: 5000 });
    await page.waitForTimeout(250);
    const subMetrics = await collectViewportMetrics(page, `${vp.name}-subscreen`);
    metrics.subscreenHorizontalOverflow = subMetrics.horizontalOverflow;
    metrics.subscreenClippedHeaderButtons = subMetrics.clippedHeaderButtons;
    if (vp.name === '390x844') {
      await page.screenshot({ path: path.join(OUT_DIR, 'after-farmer-subscreen-390.png') });
    }

    await ctx.close();
  }

  console.log('=== AFTER MULTI-VIEWPORT AUDIT ===');
  console.log(JSON.stringify({ results, consoleErrors }, null, 2));

  const failedOverflow = results.filter(r => r.horizontalOverflow || r.subscreenHorizontalOverflow);
  const failedClipping = results.filter(r => r.clippedHeaderButtons.length > 0 || r.subscreenClippedHeaderButtons.length > 0);
  if (failedOverflow.length || failedClipping.length || consoleErrors.length) {
    console.error('AUDIT FAILED:', { failedOverflow, failedClipping, consoleErrors });
    process.exitCode = 1;
  }
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const phase = parsePhase();
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    if (phase === 'before') await runBefore(browser);
    else await runAfter(browser);
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('capture-banking-ux-audit error:', err);
  process.exit(1);
});
