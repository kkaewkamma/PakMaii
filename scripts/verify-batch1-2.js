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
  } else {
    const farmerBtn = page.locator('.persona-card-btn.persona-farmer, button:has-text("สมศรี"), button:has-text("Demo Farmer")').first();
    await farmerBtn.click();
  }
  await page.waitForTimeout(800);

  // Check horizontal overflow
  const hasOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });

  // Capture screenshot
  const mobileShotPath = path.join(outDir, 'batch1-2-farmer-mobile.png');
  await page.screenshot({ path: mobileShotPath, fullPage: false });

  // Full page screenshot too
  const fullShotPath = path.join(outDir, 'batch1-2-farmer-mobile-full.png');
  await page.screenshot({ path: fullShotPath, fullPage: true });

  console.log('--- AUDIT VERIFICATION RESULTS ---');
  console.log('Mobile Screenshot:', mobileShotPath);
  console.log('Horizontal Overflow:', hasOverflow ? 'YES (FAIL)' : 'NO (PASS)');
  console.log('Console Errors:', errors.length ? errors.join(', ') : '0 (PASS)');

  // Verify key selectors exist
  const heroBtnVisible = await page.locator('#farmerPrimaryRecordBtn').isVisible();
  const rhythmVisible = await page.locator('.rhythm-track-wrap').isVisible();
  const plotsCardVisible = await page.locator('.farmer-ref-plots-card').isVisible();
  const servicesGridVisible = await page.locator('.farmer-ref-services-grid').isVisible();
  const requestCardVisible = await page.locator('.farmer-ref-request-card').isVisible();
  const recentCardVisible = await page.locator('.farmer-ref-recent-card').isVisible();

  console.log('Hero Record Button (#farmerPrimaryRecordBtn):', heroBtnVisible);
  console.log('14-Day Rhythm Track (.rhythm-track-wrap):', rhythmVisible);
  console.log('Plots Card (.farmer-ref-plots-card):', plotsCardVisible);
  console.log('4 Services Grid (.farmer-ref-services-grid):', servicesGridVisible);
  console.log('Request Status Card (.farmer-ref-request-card):', requestCardVisible);
  console.log('Recent Activity Card (.farmer-ref-recent-card):', recentCardVisible);

  await browser.close();
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
