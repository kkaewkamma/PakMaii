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

  const cardDetails = await page.locator('.farmer-identity-card').evaluate(el => {
    return {
      padding: window.getComputedStyle(el).padding,
      fontSize: window.getComputedStyle(el).fontSize,
      children: Array.from(el.children).map(c => ({
        tag: c.tagName,
        className: c.className,
        height: c.getBoundingClientRect().height,
        text: c.innerText
      }))
    };
  });

  console.log('Card details:', JSON.stringify(cardDetails, null, 2));
  await browser.close();
}
check().catch(console.error);
