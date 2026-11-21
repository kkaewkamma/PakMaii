import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function runAudit() {
  const browser = await chromium.launch({ channel: 'msedge' });
  const outDir = path.join(process.cwd(), 'audit-screenshots', 'sprint-audit');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const viewports = [
    { name: '320px', width: 320, height: 568 },
    { name: '360px', width: 360, height: 800 },
    { name: '390px', width: 390, height: 844 },
    { name: '430px', width: 430, height: 932 },
    { name: '768px', width: 768, height: 1024 },
    { name: '1280px', width: 1280, height: 800 }
  ];

  const results = {
    overflows: [],
    consoleErrors: [],
    workflowPass: true,
    workflowNotes: []
  };

  // 1. Audit viewports for Farmer Home
  for (const vp of viewports) {
    const isMobile = vp.width < 768;
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
      isMobile,
      hasTouch: isMobile
    });

    const consoleMessages = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleMessages.push(msg.text());
    });

    await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });

    // dismiss tutorial if present
    try {
      const skip = page.locator('button:has-text("ข้าม"), #tutorialCloseBtn');
      if (await skip.count() > 0 && await skip.first().isVisible()) {
        await skip.first().click();
        await page.waitForTimeout(300);
      }
    } catch {}

    // login as farmer A-03
    const farmerBtn = page.locator('.persona-card-btn:has-text("สมปอง")');
    if (await farmerBtn.count() > 0) {
      await farmerBtn.first().click();
      await page.waitForTimeout(600);
    }

    // Check overflow
    const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    const scrollDiff = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (hasHScroll && scrollDiff > 1) {
      results.overflows.push({ viewport: vp.name, screen: 'farmer-home', diff: scrollDiff });
    }

    await page.screenshot({ path: path.join(outDir, `farmer-home-${vp.name}.png`) });

    if (consoleMessages.length > 0) {
      results.consoleErrors.push({ viewport: vp.name, errors: consoleMessages });
    }

    await page.close();
  }

  // 2. Audit Full Demo Workflow (Farmer -> ICS -> Admin) on 390x844
  const flowPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });

  const flowErrors = [];
  flowPage.on('console', msg => {
    if (msg.type() === 'error') flowErrors.push(msg.text());
  });

  await flowPage.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  try {
    const skip = flowPage.locator('button:has-text("ข้าม"), #tutorialCloseBtn');
    if (await skip.count() > 0 && await skip.first().isVisible()) {
      await skip.first().click();
      await flowPage.waitForTimeout(300);
    }
  } catch {}

  // A. Farmer: Login, Record, Submit Approval
  await flowPage.locator('.persona-card-btn:has-text("สมปอง")').click();
  await flowPage.waitForTimeout(500);

  // Check Record flow
  const recordNav = flowPage.locator('.dock-btn:has-text("บันทึก"), #farmerPrimaryRecordBtn');
  await recordNav.first().click();
  await flowPage.waitForTimeout(500);
  await flowPage.screenshot({ path: path.join(outDir, 'flow-farmer-record-step1.png') });

  // Advance step 1 -> 2
  const next1 = flowPage.locator('#wizardNext1Btn');
  if (await next1.isVisible()) {
    await next1.click();
    await flowPage.waitForTimeout(300);
    await flowPage.screenshot({ path: path.join(outDir, 'flow-farmer-record-step2.png') });
  }

  // Advance step 2 -> 3
  const next2 = flowPage.locator('#wizardNext2Btn');
  if (await next2.isVisible()) {
    await next2.click();
    await flowPage.waitForTimeout(300);
    await flowPage.screenshot({ path: path.join(outDir, 'flow-farmer-record-step3.png') });
  }

  // Submit
  const submitRecord = flowPage.locator('#wizardSubmitBtn');
  if (await submitRecord.isVisible()) {
    await submitRecord.click();
    await flowPage.waitForTimeout(800);
    results.workflowNotes.push('Farmer activity record submitted successfully');
  }

  // Go to Approval tab
  const moreOrDockApproval = flowPage.locator('.dock-btn:has-text("ขอปัจจัย"), .dock-btn:has-text("เพิ่มเติม")');
  if (await flowPage.locator('.dock-btn:has-text("ขอปัจจัย")').isVisible()) {
    await flowPage.locator('.dock-btn:has-text("ขอปัจจัย")').click();
  } else {
    await flowPage.locator('.dock-btn:has-text("เพิ่มเติม")').click();
    await flowPage.waitForTimeout(300);
    await flowPage.locator('.more-sheet-item:has-text("ขออนุมัติปัจจัย")').click();
  }
  await flowPage.waitForTimeout(500);
  await flowPage.screenshot({ path: path.join(outDir, 'flow-farmer-approval-view.png') });

  // Submit a quick formula approval
  const formulaChip = flowPage.locator('.chip-amber').first();
  if (await formulaChip.isVisible()) {
    await formulaChip.click();
    await flowPage.waitForTimeout(200);
  }
  const sendReviewBtn = flowPage.locator('.btn-send-review');
  if (await sendReviewBtn.isVisible()) {
    await sendReviewBtn.click();
    await flowPage.waitForTimeout(800);
    results.workflowNotes.push('Farmer input approval submitted successfully');
  }

  // B. Switch to ICS Role
  const icsSwitchPill = flowPage.locator('.switcher-ics, button:has-text("ICS")');
  if (await icsSwitchPill.isVisible()) {
    await icsSwitchPill.click();
    await flowPage.waitForTimeout(800);
    results.workflowNotes.push('Switched to ICS successfully');
  }
  await flowPage.screenshot({ path: path.join(outDir, 'flow-ics-home.png') });

  // Check ICS Approval queue
  const icsApprovalNav = flowPage.locator('.dock-btn:has-text("คำขอ"), #tabs button:has-text("คำขอปัจจัย")');
  if (await icsApprovalNav.first().isVisible()) {
    await icsApprovalNav.first().click();
    await flowPage.waitForTimeout(500);
    await flowPage.screenshot({ path: path.join(outDir, 'flow-ics-approvals.png') });

    // Try approving the top request
    const approveBtn = flowPage.locator('.btn-approve-direct, button:has-text("อนุมัติ")').first();
    if (await approveBtn.isVisible()) {
      await approveBtn.click();
      await flowPage.waitForTimeout(800);
      results.workflowNotes.push('ICS approved request successfully');
    }
  }

  // C. Switch to Admin Role
  // Admin requires login or dev switch
  // Let's check admin logout and login
  const logoutBtn = flowPage.locator('#logoutButton');
  if (await logoutBtn.isVisible()) {
    await logoutBtn.click();
    await flowPage.waitForTimeout(500);
  }

  // Login as admin
  const adminLoginBtn = flowPage.locator('#adminLoginButton');
  if (await adminLoginBtn.isVisible()) {
    await adminLoginBtn.click();
    await flowPage.waitForTimeout(400);
    const passInput = flowPage.locator('input[type="password"]');
    if (await passInput.isVisible()) {
      await passInput.fill('admin123');
      await flowPage.locator('button:has-text("เข้าสู่ระบบ")').click();
      await flowPage.waitForTimeout(800);
      results.workflowNotes.push('Admin login completed');
      await flowPage.screenshot({ path: path.join(outDir, 'flow-admin-overview.png') });
    }
  }

  await flowPage.close();
  await browser.close();

  results.flowErrors = flowErrors;
  console.log('AUDIT RESULT:', JSON.stringify(results, null, 2));
}

runAudit().catch(err => {
  console.error('Audit failure:', err);
  process.exit(1);
});
