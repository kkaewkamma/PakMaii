import { chromium } from 'playwright';

async function check() {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  
  const consoleMessages = [];
  page.on('console', msg => consoleMessages.push(msg.text()));
  
  // 1. Home
  await page.goto('http://localhost:4173/prototypes/farmer-mobile-home.html', { waitUntil: 'networkidle' });
  const headerBg = await page.$eval('.app-header', el => window.getComputedStyle(el).backgroundColor);
  const cardBg = await page.$eval('.farmer-identity-card', el => window.getComputedStyle(el).backgroundColor);
  console.log('Home Header BG:', headerBg);
  console.log('Home Card BG:', cardBg);
  await page.screenshot({ path: 'audit-screenshots/farmer-superapp/home-verified.png' });

  // Test opening a bottom sheet on Home
  await page.click('[data-sheet="plots"]');
  await page.waitForTimeout(300);
  const isSheetOpen = await page.$eval('.bottom-sheet', el => el.classList.contains('open'));
  console.log('Bottom Sheet Open:', isSheetOpen);
  await page.screenshot({ path: 'audit-screenshots/farmer-superapp/home-sheet-verified.png' });

  // 2. Record Stepper
  await page.goto('http://localhost:4173/prototypes/farmer-mobile-record.html', { waitUntil: 'networkidle' });
  const stepperBg = await page.$eval('.stepper-header', el => window.getComputedStyle(el).backgroundColor);
  console.log('Stepper Header BG:', stepperBg);
  await page.screenshot({ path: 'audit-screenshots/farmer-superapp/record-step1-verified.png' });

  // Step 2
  await page.click('#btnNext');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'audit-screenshots/farmer-superapp/record-step2-verified.png' });

  // Step 3
  await page.click('#btnNext');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'audit-screenshots/farmer-superapp/record-step3-verified.png' });

  console.log('All Console messages:', consoleMessages);
  await browser.close();
  console.log('Verification completed without errors!');
}

check().catch(console.error);
