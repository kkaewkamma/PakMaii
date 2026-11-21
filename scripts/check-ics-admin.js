import { chromium } from 'playwright';
import path from 'path';

async function checkIcsAndAdmin() {
  const browser = await chromium.launch({ channel: 'msedge' });
  const outDir = path.join(process.cwd(), 'audit-screenshots', 'sprint-audit');

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

  // Login as ICS
  await page.locator('.persona-card-btn.persona-ics, button:has-text("คุณวิชัย")').click();
  await page.waitForTimeout(600);

  // ICS Home
  await page.screenshot({ path: path.join(outDir, 'inspect-ics-home.png') });

  // ICS Risks / Watchlist
  const risksNav = page.locator('.dock-btn:has-text("จุดเสี่ยง"), .dock-btn:has-text("ความเสี่ยง")');
  if (await risksNav.first().isVisible()) {
    await risksNav.first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, 'inspect-ics-risks.png') });
  }

  // ICS Approvals
  const appNav = page.locator('.dock-btn:has-text("คำขอ")');
  if (await appNav.first().isVisible()) {
    await appNav.first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, 'inspect-ics-approvals.png') });
  }

  // ICS Farmers
  const moreBtn = page.locator('.dock-btn:has-text("เพิ่มเติม")');
  if (await moreBtn.isVisible()) {
    await moreBtn.click();
    await page.waitForTimeout(400);
    const farmerItem = page.locator('.more-sheet-item:has-text("เกษตรกรในความดูแล"), .more-sheet-item:has-text("เกษตรกร")');
    if (await farmerItem.first().isVisible()) {
      await farmerItem.first().click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(outDir, 'inspect-ics-farmers.png') });
    }
  }

  await page.close();
  await browser.close();
  console.log('ICS mobile inspection screens captured.');
}

checkIcsAndAdmin().catch(console.error);
