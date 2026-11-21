import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function main() {
  const browser = await chromium.launch({ channel: 'msedge' });
  const outDir = path.join(process.cwd(), 'audit-screenshots', 'sprint-audit');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const errors = [];

  // 1. Desktop Test (1280x800)
  const desktopPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  desktopPage.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  await desktopPage.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  try {
    const skip = desktopPage.locator('button:has-text("ข้าม"), #tutorialCloseBtn');
    if (await skip.count() > 0 && await skip.first().isVisible()) await skip.first().click();
  } catch {}

  // Login as ICS on Desktop
  if (await desktopPage.locator('#demoCode').isVisible()) {
    const icsRadio = desktopPage.locator('#demoRole-ics');
    if (await icsRadio.isVisible()) await icsRadio.click();
    await desktopPage.fill('#demoCode', 'ICS-STG-001');
    await desktopPage.click('#demoLoginButton');
  } else {
    await desktopPage.locator('button:has-text("ผู้ตรวจประเมิน ICS")').click();
  }
  await desktopPage.waitForTimeout(700);

  const desktopShot = path.join(outDir, 'batch4-ics-desktop.png');
  await desktopPage.screenshot({ path: desktopShot });

  const desktopOverflow = await desktopPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

  // 2. Mobile Test (390x844)
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  mobilePage.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  await mobilePage.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  try {
    const skip = mobilePage.locator('button:has-text("ข้าม"), #tutorialCloseBtn');
    if (await skip.count() > 0 && await skip.first().isVisible()) await skip.first().click();
  } catch {}

  if (await mobilePage.locator('#demoCode').isVisible()) {
    const icsRadio = mobilePage.locator('#demoRole-ics');
    if (await icsRadio.isVisible()) await icsRadio.click();
    await mobilePage.fill('#demoCode', 'ICS-STG-001');
    await mobilePage.click('#demoLoginButton');
  }
  await mobilePage.waitForTimeout(700);

  const mobileShot = path.join(outDir, 'batch4-ics-mobile.png');
  await mobilePage.screenshot({ path: mobileShot });

  const mobileOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

  console.log('--- BATCH 4 VERIFICATION RESULTS ---');
  console.log('ICS Desktop Screenshot:', desktopShot);
  console.log('ICS Mobile Screenshot:', mobileShot);
  console.log('Desktop Horizontal Overflow:', desktopOverflow ? 'YES (FAIL)' : 'NO (PASS)');
  console.log('Mobile Horizontal Overflow:', mobileOverflow ? 'YES (FAIL)' : 'NO (PASS)');
  console.log('Console Errors:', errors.length ? errors.join(', ') : '0 (PASS)');

  await desktopPage.close();
  await mobilePage.close();
  await browser.close();
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
