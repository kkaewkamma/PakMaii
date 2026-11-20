import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function capturePrototypes() {
  const browser = await chromium.launch({ channel: 'msedge' });
  const outDir = path.join(process.cwd(), 'audit-screenshots', 'prototypes');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const concepts = [
    { name: 'concept-a', file: 'concept-a-agritech.html' },
    { name: 'concept-b', file: 'concept-b-community.html' },
    { name: 'concept-c', file: 'concept-c-console.html' }
  ];

  for (const c of concepts) {
    // Desktop 1440x900
    const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await desktopPage.goto('http://localhost:4173/prototypes/' + c.file, { waitUntil: 'networkidle' });
    const desktopPath = path.join(outDir, c.name + '-desktop.png');
    await desktopPage.screenshot({ path: desktopPath, fullPage: false });
    await desktopPage.close();
    console.log('Saved', desktopPath);

    // Mobile 390x844
    const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await mobilePage.goto('http://localhost:4173/prototypes/' + c.file, { waitUntil: 'networkidle' });
    const mobilePath = path.join(outDir, c.name + '-mobile.png');
    await mobilePage.screenshot({ path: mobilePath, fullPage: false });
    await mobilePage.close();
    console.log('Saved', mobilePath);
  }

  await browser.close();
  console.log('All prototype screenshots captured successfully.');
}

capturePrototypes().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
