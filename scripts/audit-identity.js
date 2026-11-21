import { chromium } from 'playwright';

async function check() {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });

  try {
    const skip = page.locator('button:has-text("ข้าม"), #tutorialCloseBtn');
    if (await skip.count() > 0 && await skip.first().isVisible()) {
      await skip.first().click();
      await page.waitForTimeout(300);
    }
  } catch {}

  const btn = page.locator('.persona-card-btn:has-text("สมปอง")');
  if (await btn.count() > 0) {
    await btn.first().click();
    await page.waitForTimeout(600);
  }

  const identityChildren = await page.locator('#identity > *').evaluateAll(els => els.map(e => ({
    tag: e.tagName,
    className: e.className,
    height: e.getBoundingClientRect().height
  })));

  console.log('Identity children:', identityChildren);
  await browser.close();
}
check().catch(console.error);
