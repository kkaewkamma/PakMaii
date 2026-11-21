import { chromium } from 'playwright';

async function compare() {
  const browser = await chromium.launch({ channel: 'msedge' });

  // 1. Prototype
  const page1 = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page1.goto('http://localhost:4173/prototypes/farmer-mobile-home.html', { waitUntil: 'networkidle' });
  await page1.screenshot({ path: 'audit-screenshots/inspect-proto.png' });
  await page1.close();

  // 2. Real app
  const page2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page2.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  
  // dismiss tutorial if present
  try {
    const skip = page2.locator('button:has-text("ข้าม"), #tutorialCloseBtn');
    if (await skip.count() > 0 && await skip.first().isVisible()) {
      await skip.first().click();
      await page2.waitForTimeout(300);
    }
  } catch {}

  // click persona farmer
  const btn = page2.locator('.persona-card-btn:has-text("สมปอง")');
  if (await btn.count() > 0) {
    await btn.first().click();
    await page2.waitForTimeout(800);
  }

  await page2.screenshot({ path: 'audit-screenshots/inspect-real.png' });
  await page2.close();

  await browser.close();
  console.log('Captured both successfully!');
}
compare().catch(console.error);
