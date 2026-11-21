import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function main() {
  const browser = await chromium.launch({ channel: 'msedge' });
  const outDir = path.join(process.cwd(), 'audit-screenshots', 'sprint-audit');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });

  // Close tutorial if open
  try {
    const skip = page.locator('button:has-text("ข้าม"), #tutorialCloseBtn');
    if (await skip.count() > 0 && await skip.first().isVisible()) {
      await skip.first().click();
      await page.waitForTimeout(300);
    }
  } catch {}

  // Login as Farmer
  if (await page.locator('#demoCode').isVisible()) {
    await page.fill('#demoCode', 'F-STG-001');
    await page.click('#demoLoginButton');
  }
  await page.waitForTimeout(600);

  // 1. Go to Record Wizard
  const recordBtn = page.locator('#farmerPrimaryRecordBtn, .dock-btn:has-text("บันทึก")').first();
  await recordBtn.click();
  await page.waitForTimeout(600);

  const step1Shot = path.join(outDir, 'batch3-farmer-record-step1.png');
  await page.screenshot({ path: step1Shot });

  // Select a choice card
  const careCard = page.locator('.kind-choice-card:has-text("ดูแลรักษา")');
  if (await careCard.isVisible()) {
    await careCard.click();
    await page.waitForTimeout(200);
  }

  // Next to Step 2
  await page.locator('#wizardNext1Btn').click();
  await page.waitForTimeout(500);

  const step2Shot = path.join(outDir, 'batch3-farmer-record-step2.png');
  await page.screenshot({ path: step2Shot });

  // 2. Go to Approval Tab
  const approvalNav = page.locator('.dock-btn:has-text("ขอปัจจัย"):visible, #tabs button:has-text("คำขอปัจจัย"):visible').first();
  await approvalNav.click();
  await page.waitForTimeout(600);

  const approvalShot = path.join(outDir, 'batch3-farmer-approval.png');
  await page.screenshot({ path: approvalShot });

  // Check horizontal overflow
  const hasOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });

  console.log('--- BATCH 3 VERIFICATION RESULTS ---');
  console.log('Record Step 1 Screenshot:', step1Shot);
  console.log('Record Step 2 Screenshot:', step2Shot);
  console.log('Approval Screenshot:', approvalShot);
  console.log('Horizontal Overflow:', hasOverflow ? 'YES (FAIL)' : 'NO (PASS)');
  console.log('Console Errors:', errors.length ? errors.join(', ') : '0 (PASS)');

  await browser.close();
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
