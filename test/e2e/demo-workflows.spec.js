import { test, expect } from '@playwright/test';

test.describe('PakMaii Critical Workflows (Demo-First & LIFF Compatibility)', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage before each test for clean isolation
    await page.goto('/');
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.clear();
    });
    await page.reload();
  });

  test('Farmer Login, Rhythm Track, and 3-Step Activity Wizard', async ({ page, isMobile }) => {
    // 1. Visit landing page
    await page.goto('/');
    await expect(page).toHaveTitle(/Ready to Grow/);

    // 2. Verify Demo Login Form & Senior Large-Text Toggle are visible
    const loginForm = page.locator('#demoLoginForm');
    await expect(loginForm).toBeVisible();
    const fontScaleToggle = page.locator('#fontScaleToggle');
    await expect(fontScaleToggle).toBeVisible();
    await fontScaleToggle.click();
    await expect(page.locator('html')).toHaveClass(/large-text/);
    await expect(fontScaleToggle).toHaveAttribute('aria-pressed', 'true');

    // 3. Fill F-STG-001 and submit demo login
    await page.fill('#demoCode', 'F-STG-001');
    await page.click('#demoLoginButton');

    // 4. Verify Simplified Farmer Home View loads
    await expect(page.locator('#welcome')).toContainText('สวัสดี, Demo Farmer 01');
    await expect(page.locator('.farmer-home-greeting')).toContainText('คุณสมปอง คำภา');

    // 5. Navigate to Activity Record Wizard via unified Farmer app dock (houses 14-day rhythm track)
    const recordNavBtn = page.locator('#mobile-dock .dock-btn:has-text("บันทึก"):visible');
    await recordNavBtn.click();
    await expect(page.locator('.rhythm-track-wrap')).toBeVisible();

    // 6. Verify 3-Step Activity Wizard exists
    const wizard = page.locator('#recordForm');
    await expect(wizard).toBeVisible();
    await expect(page.locator('.wizard-step-pill').first()).toHaveText('1. แปลงและประเภท');

    // 7. Step 1: Advance to Step 2
    const next1Btn = page.locator('#wizardNext1Btn');
    await expect(next1Btn).toBeVisible();
    await next1Btn.click();

    // 8. Step 2: Fill details, upload a real photo file, and advance to Step 3
    const detailsArea = page.locator('textarea[name="details"]');
    await expect(detailsArea).toBeVisible();
    await detailsArea.fill('ทดสอบบันทึกกิจกรรมพร้อมอัปโหลดรูปภาพผ่าน Playwright E2E');

    const onePixelPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const fileInput = page.locator('#recordForm input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'farm-plot.png',
      mimeType: 'image/png',
      buffer: onePixelPng
    });
    await expect(page.locator('#recordForm .photo-preview-img')).toBeVisible();

    const next2Btn = page.locator('#wizardNext2Btn');
    await next2Btn.click();

    // 9. Step 3: Review (including attached photo thumbnail) and submit
    await expect(page.locator('.wizard-review-box')).toBeVisible();
    await expect(page.locator('.wizard-review-box')).toContainText('ทดสอบบันทึกกิจกรรมพร้อมอัปโหลดรูปภาพผ่าน Playwright E2E');
    await expect(page.locator('.wizard-review-box .activity-photo-thumb')).toBeVisible();
    const submitBtn = page.locator('#recordSubmitBtn');
    await submitBtn.click();

    // 10. Verify notification, saved photo thumbnail on activity card, and photo viewer modal
    await expect(page.locator('#toast')).toContainText('บันทึกกิจกรรมสำเร็จ');
    const savedThumb = page.locator('#content .activity-photo-thumb').first();
    await expect(savedThumb).toBeVisible();
    await savedThumb.click();
    await expect(page.locator('.passport-overlay')).toBeVisible();
    await page.keyboard.press('Escape');

    // 11. Navigate to Fertilizer / Input Approval tab via unified Farmer app dock
    const approvalNavBtn = page.locator('#mobile-dock .dock-btn:has-text("ขอปัจจัย"):visible');
    await approvalNavBtn.click();
    await expect(page.locator('.approval-hero-alert')).toBeVisible();
    await expect(page.locator('.approval-status-pill')).toContainText('ไม่ผ่านการอนุมัติ');
    await expect(page.locator('#approvalForm')).toHaveCount(0);
    await expect(page.locator('#openNewApprovalFormBtn')).toContainText('ส่งคำขอใหม่');
    await expect(page.locator('#approvalContactBtn')).toContainText('ติดต่อเจ้าหน้าที่');
    await page.locator('#openNewApprovalFormBtn').click();
    await expect(page.locator('#approvalForm')).toBeVisible();
  });

  test('ICS Login, Risks Dashboard, and Audit Assistant', async ({ page, isMobile }) => {
    // 1. Visit landing page and verify IP First-Visit Tutorial Modal & High-Contrast Typography
    await page.goto('/?tutorial=1');
    const tutorialModal = page.locator('.tutorial-modal-overlay');
    await expect(tutorialModal).toBeVisible();
    await expect(tutorialModal).toContainText('เข้าชมครั้งแรกจาก IP:');
    const headerContrast = await page.evaluate(() => {
      const header = document.querySelector('.tutorial-modal-header');
      const title = document.querySelector('.tutorial-title');
      const subtitle = document.querySelector('.tutorial-subtitle');
      const skipBtn = document.querySelector('#tutorialSkipBtn');
      return {
        headerBg: getComputedStyle(header).backgroundColor,
        titleColor: getComputedStyle(title).color,
        subtitleColor: getComputedStyle(subtitle).color,
        skipColor: getComputedStyle(skipBtn).color,
        skipBg: getComputedStyle(skipBtn).backgroundColor
      };
    });
    expect(headerContrast.headerBg).not.toBe(headerContrast.titleColor);
    expect(headerContrast.headerBg).not.toBe(headerContrast.subtitleColor);
    expect(headerContrast.skipBg).not.toBe(headerContrast.skipColor);
    await page.locator('#tutorialSkipBtn').click();
    await expect(tutorialModal).not.toBeVisible();

    // 2. Switch role to ICS using #demoRole-ics
    const icsRoleBtn = page.locator('#demoRole-ics');
    await icsRoleBtn.click();

    // 3. Fill ICS sample code and submit
    await page.fill('#demoCode', 'ICS-STG-001');
    await page.click('#demoLoginButton');

    // 4. Verify ICS Dashboard loaded with ICS Officer greeting, real PakMaii profile name, and Donut/Bar Charts
    await expect(page.locator('#welcome')).toContainText('สวัสดี, Demo ICS Officer 01');
    await expect(page.locator('#identity')).toContainText('คุณวิชัย ผักไหม');
    await expect(page.locator('.ics-donut-svg').first()).toBeVisible();
    await expect(page.locator('.ics-bar-chart-section')).toBeVisible();

    // 5. Navigate to Risks dashboard
    // On desktop tabs label is "ความเสี่ยง", on mobile dock short label is "จุดเสี่ยง"
    const risksNavBtn = isMobile
      ? page.locator('.dock-btn:has-text("จุดเสี่ยง"):visible')
      : page.locator('#tabs button:has-text("ความเสี่ยง"):visible');
    await risksNavBtn.click();
    await expect(page.locator('.notice:has-text("สัญญาณความเสี่ยง")')).toBeVisible();

    // 6. Logout and verify return to login view
    const logoutBtn = page.locator('button:has-text("ออกจากโหมดทดลอง"):visible').first();
    await logoutBtn.click();
    await expect(page.locator('#demoLoginForm')).toBeVisible();
  });

  test('Mobile Dock and Accessible More-Sheet Interaction', async ({ page, isMobile }) => {
    await page.goto('/');

    // Login as Farmer
    await page.fill('#demoCode', 'F-STG-001');
    await page.click('#demoLoginButton');
    await expect(page.locator('#welcome')).toContainText('สวัสดี, Demo Farmer 01');

    // Check Mobile Dock on mobile viewport
    const dock = page.locator('#mobile-dock');
    if (isMobile) {
      await expect(dock).toBeVisible();

      // Tap "เพิ่มเติม" button to open more sheet
      const moreBtn = dock.locator('.dock-btn:has-text("เพิ่มเติม")');
      await expect(moreBtn).toBeVisible();
      await moreBtn.click();
      const moreSheet = page.locator('.more-sheet');
      await expect(moreSheet).toBeVisible();
      await expect(moreSheet).toHaveAttribute('aria-modal', 'true');

      // Close more sheet
      const closeBtn = page.locator('button[aria-label="ปิดเมนูเพิ่มเติม"]');
      await closeBtn.click();
      await expect(moreSheet).not.toBeVisible();
    }
  });

  test('Cross-Role ICS Inspection Review, Farmer Review Visibility, and Lot Story Passport', async ({ page, isMobile }) => {
    await page.goto('/');

    // 1. Login as ICS Officer
    await page.click('#demoRole-ics');
    await page.fill('#demoCode', 'ICS-STG-001');
    await page.click('#demoLoginButton');
    await expect(page.locator('#welcome')).toContainText('สวัสดี, Demo ICS Officer 01');

    // 2. Navigate to Reviews ("ผลตรวจ")
    if (isMobile) {
      await page.locator('#mobile-dock .dock-btn:has-text("เพิ่มเติม")').click();
      await page.locator('.more-sheet-item:has-text("ผลตรวจ")').click();
    } else {
      await page.locator('#tabs button:has-text("ผลตรวจ"):visible').click();
    }

    // 3. Verify ICS Audit Assistant inspection form renders and submit an inspection review for Plot 1 (A-03)
    const reviewForm = page.locator('#reviewForm');
    await expect(reviewForm).toBeVisible();
    await reviewForm.locator('select[name="plot_id"]').selectOption('1');
    await reviewForm.locator('textarea[name="note"]').fill('ตรวจแปลงผ่านเกณฑ์ แนวกันชนสมบูรณ์');
    await reviewForm.locator('button[type="submit"]').click();
    await expect(page.locator('#toast')).toContainText('บันทึกผลตรวจประเมินภายในเรียบร้อย');

    // 4. Switch to Farmer A-03 via quick switcher bar
    await page.locator('button:has-text("เกษตรกร A-03 (F-STG-001)")').click();
    await expect(page.locator('#welcome')).toContainText('สวัสดี, Demo Farmer 01');

    // 5. Navigate to Farmer Reviews ("ผลตรวจแปลง") via unified Farmer More-Sheet
    await page.locator('#mobile-dock .dock-btn:has-text("เพิ่มเติม")').click();
    await page.locator('.more-sheet-item:has-text("ผลตรวจแปลง")').click();
    await expect(page.locator('#content')).toContainText('ตรวจแปลงผ่านเกณฑ์ แนวกันชนสมบูรณ์');

    // 6. Navigate to Lots ("ล็อตผลผลิต") via unified Farmer More-Sheet and open Story Passport
    await page.locator('#mobile-dock .dock-btn:has-text("เพิ่มเติม")').click();
    await page.locator('.more-sheet-item:has-text("ล็อตผลผลิต")').click();
    await page.locator('.passport-trigger-btn').first().click();
    const passportOverlay = page.locator('.passport-overlay');
    const passportCard = page.locator('.passport-card');
    await expect(passportOverlay).toHaveAttribute('role', 'dialog');
    await expect(passportOverlay).toHaveAttribute('aria-modal', 'true');
    await expect(passportCard).toBeVisible();
    await expect(passportCard.locator('button:has-text("ตัวอย่างหน้าสาธารณะ (QR)")')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(passportCard).not.toBeVisible();
  });

  test('Farmer Banking-App Shell, Simplified Home, Demo Tools, and Back Navigation', async ({ page }) => {
    await page.goto('/');
    await page.fill('#demoCode', 'F-STG-001');
    await page.click('#demoLoginButton');

    // Unified app shell on both Desktop and Mobile: no Farmer desktop sidebar, bottom dock always visible
    await expect(page.locator('#tabs')).not.toBeVisible();
    await expect(page.locator('#mobile-dock')).toBeVisible();
    await expect(page.locator('.role-switcher-bar')).toHaveCount(0);

    // Simplified 4-section Farmer Home (no 14-day track on Home)
    await expect(page.locator('.farmer-home-greeting')).toContainText('คุณสมปอง คำภา');
    await expect(page.locator('#farmerPrimaryRecordBtn')).toBeVisible();
    await expect(page.locator('.rhythm-track-wrap')).toHaveCount(0);
    const shortcuts = page.locator('.farmer-shortcuts-grid .farmer-shortcut-btn');
    await expect(shortcuts).toHaveCount(4);
    await expect(shortcuts.nth(0)).toContainText('แปลงปลูก');
    await expect(shortcuts.nth(1)).toContainText('ขอใช้ปัจจัย');
    await expect(shortcuts.nth(2)).toContainText('ผลการตรวจ');
    await expect(shortcuts.nth(3)).toContainText('ล็อตผลผลิต');

    // Single compact status banner displays real rejected request without fake placeholders
    const summaryCard = page.locator('.farmer-status-banner');
    await expect(summaryCard).toContainText('คำขอใช้ปัจจัยไม่ผ่าน');
    await expect(summaryCard).toContainText('แผนการใส่ปุ๋ยบำรุงต้น');
    await expect(page.locator('#content')).not.toContainText('ปลูกผักกาดหอม');

    // Demo Tools modal accessibility + account switching
    const demoBtn = page.locator('#demoToolsBtn');
    await expect(demoBtn).toBeVisible();
    await demoBtn.click();
    const demoDialog = page.locator('[aria-label="เครื่องมือทดสอบระบบ Demo"]');
    await expect(demoDialog).toHaveAttribute('role', 'dialog');
    await expect(demoDialog).toHaveAttribute('aria-modal', 'true');
    await page.keyboard.press('Escape');
    await expect(demoDialog).not.toBeVisible();

    await demoBtn.click();
    await page.locator('.demo-persona-btn:has-text("F-STG-002")').click();
    await expect(page.locator('.farmer-home-greeting')).toContainText('คุณบัวผัน ศรีห้วยทับทัน');

    // Sub-screen list-first check (plots) + back header -> returns cleanly to Home
    await page.locator('.farmer-shortcut-btn:has-text("แปลงปลูก")').click();
    await expect(page.locator('#farmerSubNav')).toBeVisible();
    await expect(page.locator('#farmerScreenTitle')).toHaveText('แปลงปลูก');
    await expect(page.locator('#plotForm')).toHaveCount(0);
    await page.locator('#openAddPlotBtn').click();
    await expect(page.locator('#plotForm')).toBeVisible();
    await page.locator('#farmerBackBtn').click();
    await expect(page.locator('#farmerSubNav')).not.toBeVisible();
    await expect(page.locator('#farmerPrimaryRecordBtn')).toBeVisible();
  });
});
