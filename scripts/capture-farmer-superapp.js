import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function captureFarmerSuperapp() {
  const browser = await chromium.launch({ channel: 'msedge' });
  const outDir = path.join(process.cwd(), 'audit-screenshots', 'farmer-superapp');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const viewports = [
    { name: '390x844', width: 390, height: 844 },
    { name: '360x800', width: 360, height: 800 }
  ];

  for (const vp of viewports) {
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
      isMobile: true,
      hasTouch: true
    });

    // 1. Home Screen
    await page.goto('http://localhost:4173/prototypes/farmer-mobile-home.html', { waitUntil: 'networkidle' });
    const homePath = path.join(outDir, `home-${vp.name}.png`);
    await page.screenshot({ path: homePath });
    console.log('Saved', homePath);

    // 2. Guided Flow - Step 1
    await page.goto('http://localhost:4173/prototypes/farmer-mobile-record.html', { waitUntil: 'networkidle' });
    const step1Path = path.join(outDir, `record-step1-${vp.name}.png`);
    await page.screenshot({ path: step1Path });
    console.log('Saved', step1Path);

    // Step 2
    await page.click('#btnNext');
    await page.waitForTimeout(300);
    const step2Path = path.join(outDir, `record-step2-${vp.name}.png`);
    await page.screenshot({ path: step2Path });
    console.log('Saved', step2Path);

    // Step 3
    await page.click('#btnNext');
    await page.waitForTimeout(300);
    const step3Path = path.join(outDir, `record-step3-${vp.name}.png`);
    await page.screenshot({ path: step3Path });
    console.log('Saved', step3Path);

    await page.close();
  }

  await browser.close();
  console.log('All Farmer Super-App screenshots captured successfully.');
}

captureFarmerSuperapp().catch(err => {
  console.error('Error capturing screenshots:', err);
  process.exit(1);
});
