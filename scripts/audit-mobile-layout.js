import { chromium } from 'playwright';

async function auditMobile() {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });

  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });

  // dismiss tutorial
  try {
    const skip = page.locator('button:has-text("ข้าม"), #tutorialCloseBtn');
    if (await skip.count() > 0 && await skip.first().isVisible()) {
      await skip.first().click();
      await page.waitForTimeout(300);
    }
  } catch {}

  // click farmer
  const btn = page.locator('.persona-card-btn:has-text("สมปอง")');
  if (await btn.count() > 0) {
    await btn.first().click();
    await page.waitForTimeout(600);
  }

  // Check heights and bounding boxes
  const headerBox = await page.locator('#main-header').boundingBox();
  const identityBox = await page.locator('#identity').boundingBox();
  const heroCardBox = await page.locator('.primary-action-card').boundingBox();
  const serviceGridBox = await page.locator('.service-grid').boundingBox();
  const dockBox = await page.locator('#mobile-dock').boundingBox();

  console.log('Header height:', headerBox?.height);
  console.log('Identity height:', identityBox?.height);
  console.log('Hero Card Y & height:', heroCardBox?.y, heroCardBox?.height);
  console.log('Service Grid Y:', serviceGridBox?.y);
  console.log('Mobile Dock Y & height:', dockBox?.y, dockBox?.height);

  await page.screenshot({ path: 'audit-screenshots/mobile-audit-390.png' });
  await browser.close();
}

auditMobile().catch(console.error);
