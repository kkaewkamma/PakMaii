import { chromium } from 'playwright';
import path from 'path';

async function main() {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });

  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  try {
    const skip = page.locator('button:has-text("ข้าม"), #tutorialCloseBtn');
    if (await skip.count() > 0 && await skip.first().isVisible()) {
      await skip.first().click();
      await page.waitForTimeout(300);
    }
  } catch {}

  // Click Farmer Persona (Somsri)
  const farmerBtn = page.locator('.persona-card-btn.persona-farmer, button:has-text("สมศรี")').first();
  await farmerBtn.click();
  await page.waitForTimeout(600);

  const outPath = path.join(process.cwd(), 'audit-screenshots', 'sprint-audit', 'current-app-farmer-mobile.png');
  await page.screenshot({ path: outPath });
  console.log('App Farmer screenshot captured at:', outPath);

  await browser.close();
}

main().catch(console.error);
