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

    // 2. Verify Demo Login Form is visible
    const loginForm = page.locator('#demoLoginForm');
    await expect(loginForm).toBeVisible();

    // 3. Fill F-STG-001 and submit demo login
    await page.fill('#demoCode', 'F-STG-001');
    await page.click('#demoLoginButton');

    // 4. Verify Farmer Home View loads with greeting and rhythm track
    await expect(page.locator('#welcome')).toContainText('สวัสดี, Demo Farmer 01');
    await expect(page.locator('.rhythm-track-wrap')).toBeVisible();

    // 5. Navigate to Activity Record Wizard
    const recordNavBtn = isMobile
      ? page.locator('.dock-btn:has-text("บันทึก"):visible')
      : page.locator('#tabs button:has-text("บันทึกกิจกรรม"):visible');
    await recordNavBtn.click();

    // 6. Verify 3-Step Activity Wizard exists
    const wizard = page.locator('#recordForm');
    await expect(wizard).toBeVisible();
    await expect(page.locator('.wizard-step-pill').first()).toHaveText('1. แปลงและประเภท');

    // 7. Step 1: Advance to Step 2
    const next1Btn = page.locator('#wizardNext1Btn');
    await expect(next1Btn).toBeVisible();
    await next1Btn.click();

    // 8. Step 2: Fill details and advance to Step 3
    const detailsArea = page.locator('textarea[name="details"]');
    await expect(detailsArea).toBeVisible();
    await detailsArea.fill('ทดสอบบันทึกกิจกรรมผ่าน Playwright E2E');
    const next2Btn = page.locator('#wizardNext2Btn');
    await next2Btn.click();

    // 9. Step 3: Review and submit
    await expect(page.locator('.wizard-review-box')).toBeVisible();
    await expect(page.locator('.wizard-review-box')).toContainText('ทดสอบบันทึกกิจกรรมผ่าน Playwright E2E');
    const submitBtn = page.locator('#recordSubmitBtn');
    await submitBtn.click();

    // 10. Verify notification and activity appeared in history
    await expect(page.locator('#toast')).toContainText('บันทึกกิจกรรมสำเร็จ');
  });

  test('ICS Login, Risks Dashboard, and Audit Assistant', async ({ page, isMobile }) => {
    // 1. Visit landing page
    await page.goto('/');

    // 2. Switch role to ICS using #demoRole-ics
    const icsRoleBtn = page.locator('#demoRole-ics');
    await icsRoleBtn.click();

    // 3. Fill ICS sample code and submit
    await page.fill('#demoCode', 'ICS-STG-001');
    await page.click('#demoLoginButton');

    // 4. Verify ICS Dashboard loaded with ICS Officer greeting
    await expect(page.locator('#welcome')).toContainText('สวัสดี, Demo ICS Officer 01');

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

    // 5. Navigate to Farmer Reviews ("ผลตรวจแปลง") and verify the inspection appears
    if (isMobile) {
      await page.locator('#mobile-dock .dock-btn:has-text("เพิ่มเติม")').click();
      await page.locator('.more-sheet-item:has-text("ผลตรวจแปลง")').click();
    } else {
      await page.locator('#tabs button:has-text("ผลตรวจแปลง"):visible').click();
    }
    await expect(page.locator('#content')).toContainText('ตรวจแปลงผ่านเกณฑ์ แนวกันชนสมบูรณ์');

    // 6. Navigate to Lots ("ล็อตผลผลิต") and open Story Passport
    if (isMobile) {
      await page.locator('#mobile-dock .dock-btn:has-text("เพิ่มเติม")').click();
      await page.locator('.more-sheet-item:has-text("ล็อตผลผลิต")').click();
    } else {
      await page.locator('#tabs button:has-text("ล็อตผลผลิต"):visible').click();
    }
    await page.locator('.passport-trigger-btn').first().click();
    const passportCard = page.locator('.passport-card');
    await expect(passportCard).toBeVisible();
    await expect(passportCard.locator('button:has-text("ตัวอย่างหน้าสาธารณะ (QR)")')).toHaveCount(0);
    await passportCard.locator('.passport-close-btn').click();
    await expect(passportCard).not.toBeVisible();
  });
});
