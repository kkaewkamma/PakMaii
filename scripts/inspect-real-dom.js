import { chromium } from 'playwright';

async function inspectDom() {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });

  // dismiss tutorial
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
    await page.waitForTimeout(800);
  }

  const headerText = await page.locator('header').allInnerTexts();
  const identityHtml = await page.locator('#identity').innerHTML();
  const tabsVisible = await page.locator('#tabs').isVisible();
  const contentChildren = await page.locator('#content > *').evaluateAll(els => els.map(e => ({ tag: e.tagName, className: e.className, textStart: e.innerText?.slice(0, 50) })));
  
  console.log('Real App Header Text:', headerText);
  console.log('Real App Identity (first 250 chars):', identityHtml.slice(0, 250));
  console.log('Tabs visible:', tabsVisible);
  console.log('Content Children count:', contentChildren.length);
  console.log('Content Children:', JSON.stringify(contentChildren, null, 2));

  await browser.close();
}
inspectDom().catch(console.error);
