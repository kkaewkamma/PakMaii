import { chromium } from 'playwright';

async function capture() {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });

  // Dismiss tutorial if present
  try {
    const skipBtn = page.locator('button:has-text("ข้าม"), button:has-text("เริ่มใช้งาน"), #tutorialCloseBtn');
    if (await skipBtn.count() > 0 && await skipBtn.first().isVisible()) {
      await skipBtn.first().click();
      await page.waitForTimeout(300);
    }
  } catch {}

  // Click demo persona farmer 1
  const personaBtn = page.locator('.persona-card-btn:has-text("สมปอง")');
  if (await personaBtn.count() > 0) {
    await personaBtn.first().click();
    await page.waitForTimeout(600);
  }

  await page.screenshot({ path: 'audit-screenshots/real-app-farmer-mobile-after.png' });
  console.log('Saved real app after screenshot to audit-screenshots/real-app-farmer-mobile-after.png');
  await browser.close();
}

capture().catch(console.error);
