import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const BASE_URL = 'http://localhost:4173/';
const OUT_DIR = path.join(process.cwd(), 'audit-screenshots', 'round2');

function parseArgs() {
  const phaseArg = process.argv.find(a => a.startsWith('--phase='));
  const scopeArg = process.argv.find(a => a.startsWith('--scope='));
  const phase = phaseArg ? phaseArg.split('=')[1] : 'before';
  const scope = scopeArg ? scopeArg.split('=')[1] : 'all';
  if (!['before', 'after'].includes(phase)) throw new Error(`Invalid phase: ${phase}`);
  if (!['approval', 'home', 'all'].includes(scope)) throw new Error(`Invalid scope: ${scope}`);
  return { phase, scope };
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
  await page.waitForTimeout(300);
}

async function navigateFarmerTab(page, tabId) {
  if (tabId === 'home') {
    const backBtn = page.locator('#farmerBackBtn');
    if (await backBtn.isVisible()) {
      await backBtn.click();
    } else {
      await page.locator('#mobile-dock .dock-btn:has-text("หน้าหลัก")').click();
    }
    await page.waitForSelector('#farmerPrimaryRecordBtn', { timeout: 6000 });
    await page.waitForTimeout(250);
    return;
  }

  if (['plots', 'record', 'approval'].includes(tabId)) {
    const dockMap = { plots: 'แปลงปลูก', record: 'บันทึก', approval: 'ขอปัจจัย' };
    await page.locator(`#mobile-dock .dock-btn:has-text("${dockMap[tabId]}")`).click();
  } else {
    const moreMap = { reviews: 'ผลตรวจแปลง', lots: 'ล็อตผลผลิต' };
    await page.locator('#mobile-dock .dock-btn:has-text("เพิ่มเติม")').click();
    await page.locator(`.more-sheet-item:has-text("${moreMap[tabId]}")`).click();
  }
  await page.waitForTimeout(300);
}

async function collectLayoutMetrics(page, label) {
  return page.evaluate((screenLabel) => {
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const scrollW = document.documentElement.scrollWidth;

    const headerButtons = [...document.querySelectorAll('#main-header button, #main-header a')]
      .filter(el => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      });
    const clippedHeaderButtons = headerButtons
      .map(el => ({ id: el.id || el.className, left: Math.round(el.getBoundingClientRect().left), right: Math.round(el.getBoundingClientRect().right) }))
      .filter(r => r.right > winW || r.left < 0);

    const dockEl = document.querySelector('#mobile-dock');
    const dockRect = dockEl ? dockEl.getBoundingClientRect() : null;
    const dockButtons = dockEl ? [...dockEl.querySelectorAll('.dock-btn')] : [];
    const clippedDockButtons = dockButtons
      .map(el => ({ text: el.textContent.trim(), left: Math.round(el.getBoundingClientRect().left), right: Math.round(el.getBoundingClientRect().right) }))
      .filter(r => r.right > winW || r.left < 0);

    const approvalForm = document.querySelector('#approvalForm');
    const contactCard = document.querySelector('.action-card-contact, #approvalContactBtn');
    const mainWrap = document.querySelector('main.wrap');
    const mainInnerW = mainWrap ? (mainWrap.getBoundingClientRect().width - parseFloat(getComputedStyle(mainWrap).paddingLeft) - parseFloat(getComputedStyle(mainWrap).paddingRight)) : winW;

    let formIsFullWidth = true;
    let formAndContactSideBySide = false;
    if (approvalForm && getComputedStyle(approvalForm).display !== 'none') {
      const fr = approvalForm.getBoundingClientRect();
      const formCard = approvalForm.closest('.approval-form-card') || approvalForm;
      const cardRect = formCard.getBoundingClientRect();
      const cardStyle = getComputedStyle(formCard);
      const cardInnerW = cardRect.width - parseFloat(cardStyle.paddingLeft) - parseFloat(cardStyle.paddingRight) - parseFloat(cardStyle.borderLeftWidth) - parseFloat(cardStyle.borderRightWidth);
      formIsFullWidth = cardRect.width >= mainInnerW * 0.9 && fr.width >= cardInnerW * 0.95;
      if (contactCard && getComputedStyle(contactCard).display !== 'none') {
        const cr = contactCard.getBoundingClientRect();
        const verticalOverlap = Math.min(fr.bottom, cr.bottom) > Math.max(fr.top, cr.top) + 10;
        formAndContactSideBySide = verticalOverlap && Math.abs(fr.left - cr.left) > 40;
      }
    }

    const nextGrid = document.querySelector('.next-action-grid');
    let nextGridColumns = null;
    if (nextGrid) {
      nextGridColumns = getComputedStyle(nextGrid).gridTemplateColumns;
    }

    return {
      screen: screenLabel,
      viewport: `${winW}x${winH}`,
      horizontalOverflow: scrollW > winW,
      scrollWidth: scrollW,
      scrollHeight: document.documentElement.scrollHeight,
      clippedHeaderButtons,
      clippedDockButtons,
      dockHeight: dockRect ? Math.round(dockRect.height) : 0,
      approvalFormVisible: Boolean(approvalForm && getComputedStyle(approvalForm).display !== 'none'),
      formIsFullWidth,
      formAndContactSideBySide,
      nextGridColumns
    };
  }, label);
}

async function runBefore(browser) {
  const ctx390 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p390 = await ctx390.newPage();
  await loginFarmer(p390);
  await p390.screenshot({ path: path.join(OUT_DIR, 'before-home-390.png') });
  const home390 = await collectLayoutMetrics(p390, 'before-home-390');

  await navigateFarmerTab(p390, 'approval');
  await p390.waitForSelector('.approval-hero-alert', { timeout: 6000 });
  await p390.screenshot({ path: path.join(OUT_DIR, 'before-approval-390.png') });
  await p390.screenshot({ path: path.join(OUT_DIR, 'before-approval-390-full.png'), fullPage: true });
  const approval390 = await collectLayoutMetrics(p390, 'before-approval-390');

  await navigateFarmerTab(p390, 'plots');
  await p390.screenshot({ path: path.join(OUT_DIR, 'before-plots-390.png') });
  const plots390 = await collectLayoutMetrics(p390, 'before-plots-390');

  await navigateFarmerTab(p390, 'lots');
  await p390.screenshot({ path: path.join(OUT_DIR, 'before-lots-390.png') });
  const lots390 = await collectLayoutMetrics(p390, 'before-lots-390');
  await ctx390.close();

  const ctx768 = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true });
  const p768 = await ctx768.newPage();
  await loginFarmer(p768);
  await navigateFarmerTab(p768, 'approval');
  await p768.waitForSelector('.approval-hero-alert', { timeout: 6000 });
  await p768.screenshot({ path: path.join(OUT_DIR, 'before-approval-768.png') });
  const approval768 = await collectLayoutMetrics(p768, 'before-approval-768');
  await ctx768.close();

  console.log('=== ROUND 2 BEFORE BASELINE METRICS ===');
  console.log(JSON.stringify({ home390, approval390, approval768, plots390, lots390 }, null, 2));
}

async function runAfter(browser, scope) {
  const viewports = [
    { name: '320x700', width: 320, height: 700, isMobile: true, hasTouch: true },
    { name: '360x800', width: 360, height: 800, isMobile: true, hasTouch: true },
    { name: '390x844', width: 390, height: 844, isMobile: true, hasTouch: true },
    { name: '430x932', width: 430, height: 932, isMobile: true, hasTouch: true },
    { name: '768x1024', width: 768, height: 1024, isMobile: false, hasTouch: true }
  ];

  const auditRows = [];
  const consoleErrors = [];

  for (const vp of viewports) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    const page = await ctx.newPage();
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(`${vp.name}: ${msg.text()}`); });
    await loginFarmer(page);

    if (scope === 'home' || scope === 'all') {
      const mHome = await collectLayoutMetrics(page, `home-${vp.name}`);
      auditRows.push(mHome);
      if (vp.name === '390x844') {
        await page.screenshot({ path: path.join(OUT_DIR, 'after-home-390.png') });
      } else if (vp.name === '320x700') {
        await page.screenshot({ path: path.join(OUT_DIR, 'after-home-320.png') });
      }
    }

    if (scope === 'approval' || scope === 'all') {
      await navigateFarmerTab(page, 'approval');
      await page.waitForSelector('.approval-hero-alert', { timeout: 6000 });
      const mApprovalStatus = await collectLayoutMetrics(page, `approval-status-${vp.name}`);
      auditRows.push(mApprovalStatus);
      if (vp.name === '390x844') {
        await page.screenshot({ path: path.join(OUT_DIR, 'after-approval-390.png') });
        await page.screenshot({ path: path.join(OUT_DIR, 'after-approval-390-full.png'), fullPage: true });
      } else if (vp.name === '768x1024') {
        await page.screenshot({ path: path.join(OUT_DIR, 'after-approval-768.png') });
      }

      const openFormBtn = page.locator('#openNewApprovalFormBtn');
      if (await openFormBtn.isVisible()) {
        await openFormBtn.click();
        await page.waitForSelector('#approvalForm', { timeout: 5000 });
        await page.waitForTimeout(250);
        const mApprovalForm = await collectLayoutMetrics(page, `approval-form-${vp.name}`);
        auditRows.push(mApprovalForm);
        if (vp.name === '390x844') {
          await page.screenshot({ path: path.join(OUT_DIR, 'after-approval-form-390.png') });
        } else if (vp.name === '768x1024') {
          await page.screenshot({ path: path.join(OUT_DIR, 'after-approval-form-768.png') });
        }
      }
    }

    if (scope === 'all') {
      await navigateFarmerTab(page, 'plots');
      const mPlots = await collectLayoutMetrics(page, `plots-${vp.name}`);
      auditRows.push(mPlots);
      if (vp.name === '390x844') {
        await page.screenshot({ path: path.join(OUT_DIR, 'after-plots-390.png') });
      }

      await navigateFarmerTab(page, 'record');
      const mRecord = await collectLayoutMetrics(page, `record-${vp.name}`);
      auditRows.push(mRecord);
      if (vp.name === '390x844') {
        await page.screenshot({ path: path.join(OUT_DIR, 'after-record-390.png') });
      }

      await navigateFarmerTab(page, 'reviews');
      const mReviews = await collectLayoutMetrics(page, `reviews-${vp.name}`);
      auditRows.push(mReviews);
      if (vp.name === '390x844') {
        await page.screenshot({ path: path.join(OUT_DIR, 'after-reviews-390.png') });
      }

      await navigateFarmerTab(page, 'lots');
      const mLots = await collectLayoutMetrics(page, `lots-${vp.name}`);
      auditRows.push(mLots);
      if (vp.name === '390x844') {
        await page.screenshot({ path: path.join(OUT_DIR, 'after-lots-390.png') });
      }
    }

    await ctx.close();
  }

  console.log(`=== ROUND 2 AFTER AUDIT (${scope}) ===`);
  console.log(JSON.stringify({ auditRows, consoleErrors }, null, 2));

  const failures = auditRows.filter(r =>
    r.horizontalOverflow ||
    r.clippedHeaderButtons.length > 0 ||
    r.clippedDockButtons.length > 0 ||
    r.formAndContactSideBySide ||
    (r.approvalFormVisible && !r.formIsFullWidth)
  );

  if (failures.length || consoleErrors.length) {
    console.error('ROUND 2 AUDIT FAILURES:', { failures, consoleErrors });
    process.exitCode = 1;
  }
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const { phase, scope } = parseArgs();
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    if (phase === 'before') await runBefore(browser);
    else await runAfter(browser, scope);
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('verify-round2-ux failed:', err);
  process.exit(1);
});
