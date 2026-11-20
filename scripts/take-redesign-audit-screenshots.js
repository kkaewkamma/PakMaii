import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('audit-screenshots');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function run() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  const mockAdminUsers = [
    { id: 1, name: 'Admin Somchai', role: 'admin', status: 'active', linked: true, agency_code: 'ADMIN-001' },
    { id: 2, name: 'คุณสมปอง คำภา', role: 'farmer', status: 'active', linked: true, agency_code: 'F-STG-001' },
    { id: 3, name: 'คุณบัวผัน ศรีห้วยทับทัน', role: 'farmer', status: 'active', linked: true, agency_code: 'F-STG-002' },
    { id: 4, name: 'คุณวิชัย ผักไหม', role: 'ics', status: 'active', linked: true, agency_code: 'ICS-STG-001' }
  ];

  const mockAdminAssignments = [
    { id: 1, ics_id: 4, ics_name: 'คุณวิชัย ผักไหม', farmer_id: 2, farmer_name: 'คุณสมปอง คำภา', created_at: '2026-11-01' },
    { id: 2, ics_id: 4, ics_name: 'คุณวิชัย ผักไหม', farmer_id: 3, farmer_name: 'คุณบัวผัน ศรีห้วยทับทัน', created_at: '2026-11-01' }
  ];

  const mockAuditLogs = [
    { id: 1, created_at: '2026-11-20T10:00:00Z', operator_name: 'คุณวิชัย ผักไหม', action: 'approval.reviewed', target_ref: 'คำขอปุ๋ย #12', details: 'อนุมัติสูตรปุ๋ยอินทรีย์' },
    { id: 2, created_at: '2026-11-19T14:30:00Z', operator_name: 'คุณสมปอง คำภา', action: 'activity.created', target_ref: 'แปลง A-03', details: 'บันทึกการให้น้ำและตรวจแปลง' }
  ];

  // 1. Desktop Viewport (1440x900)
  const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktopPage = await desktopCtx.newPage();

  // 1.1 Farmer Dashboard - Desktop
  await desktopPage.goto('http://localhost:4173');
  await desktopPage.fill('#demoCode', 'F-STG-001');
  await desktopPage.click('#demoLoginButton');
  await desktopPage.waitForSelector('.rhythm-track-wrap');
  await desktopPage.waitForTimeout(600);
  await desktopPage.screenshot({ path: path.join(outDir, '01-farmer-dashboard-desktop.png'), fullPage: true });
  console.log('Saved 01-farmer-dashboard-desktop.png');

  // 1.2 ICS Dashboard - Desktop
  const icsPill = desktopPage.locator('button.switcher-pill:has-text("ICS")');
  await icsPill.click();
  await desktopPage.waitForSelector('.watchlist-table-wrap');
  await desktopPage.waitForTimeout(600);
  await desktopPage.screenshot({ path: path.join(outDir, '02-ics-dashboard-desktop.png'), fullPage: true });
  console.log('Saved 02-ics-dashboard-desktop.png');

  // 1.3 Admin Dashboard - Desktop
  await desktopPage.route('**/api/admin/users', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAdminUsers) }));
  await desktopPage.route('**/api/admin/assignments', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAdminAssignments) }));
  await desktopPage.route('**/api/checklists*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await desktopPage.route('**/api/audit-logs*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAuditLogs) }));

  await desktopPage.evaluate(async (adminData) => {
    sessionStorage.setItem('token', 'mock-admin-token');
    // Override window.fetch for direct api calls in admin view
    const origFetch = window.fetch;
    window.fetch = async (url, opts) => {
      if (url.includes('/admin/users')) return new Response(JSON.stringify(adminData.users), { status: 200 });
      if (url.includes('/admin/assignments')) return new Response(JSON.stringify(adminData.assignments), { status: 200 });
      if (url.includes('/checklists')) return new Response(JSON.stringify([]), { status: 200 });
      if (url.includes('/audit-logs')) return new Response(JSON.stringify(adminData.auditLogs), { status: 200 });
      return origFetch(url, opts);
    };

    // Temporarily point api to use fetch
    window.__mockAdminMode = true;
    const adminModule = await import('/js/views/admin.js');
    const content = document.getElementById('content');
    const tabs = document.getElementById('tabs');
    const welcome = document.getElementById('welcome');
    welcome.textContent = 'ยินดีต้อนรับ ผู้ดูแลระบบ (System Admin)';

    // Directly call API via fetch
    const users = adminData.users;
    const assignments = adminData.assignments;
    const activeUsers = users.filter(u => u.status === 'active').length;
    const unlinkedUsers = users.filter(u => !u.linked).length;
    const farmerCount = users.filter(u => u.role === 'farmer').length;
    const icsCount = users.filter(u => u.role === 'ics').length;
    const activeAssignments = assignments.filter(a => !a.ends_at).length;

    const domModule = await import('/js/core/dom.js');
    const iconModule = await import('/js/core/icons.js');
    const { el, card } = domModule;
    const { icon } = iconModule;

    const kpis = el('div', { className: 'grid kpi-grid' },
      [
        ['ผู้ใช้งานทั้งหมด', `${users.length}`, 'คน', `เปิดใช้งาน ${activeUsers} • รอผูก LINE ${unlinkedUsers}`],
        ['เกษตรกร (Farmer)', `${farmerCount}`, 'ราย', 'บันทึกแปลงและขออนุมัติปัจจัย'],
        ['เจ้าหน้าที่ ICS', `${icsCount}`, 'คน', 'ตรวจแปลง พิจารณาคำขอ และจุดเสี่ยง'],
        ['การมอบหมายที่ใช้งานอยู่', `${activeAssignments}`, 'คู่', `ทั้งหมดในระบบ ${assignments.length} รายการ`]
      ].map(([label, val, unit, desc]) =>
        el('div', { className: 'card kpi-card' },
          el('div', { className: 'kpi-top' }, el('span', { className: 'kpi-tag' }, label)),
          el('div', { className: 'kpi-num' }, val, el('small', {}, ` ${unit}`)),
          el('div', { className: 'kpi-desc muted' }, desc)
        )
      )
    );

    const rbacRows = [
      ['สร้าง/แก้ไขแปลงปลูกและบันทึกกิจกรรมตนเอง', 'ได้', 'ดูในความดูแล', '—'],
      ['ยื่นคำขออนุมัติปัจจัยการผลิต (/approvals POST)', 'ได้', '—', '—'],
      ['พิจารณาคำขอปัจจัย (/approvals PATCH)', '—', 'ได้', '—'],
      ['ดูความเสี่ยง (/risks) และบันทึกผลตรวจ (/reviews)', '—', 'ได้', '—'],
      ['จัดการชุดรายการตรวจและยืนยันเกณฑ์ (/checklists)', '—', 'สร้าง/แก้ไขร่าง', 'ยืนยันเกณฑ์'],
      ['สร้างคำเชิญ จัดการผู้ใช้ และมอบหมาย (/admin/*)', '—', '—', 'ได้']
    ];

    const rbacTableCard = card(
      el('div', { className: 'row between' },
        el('h3', {}, icon('shield', 16), ' ตารางสิทธิ์ตามบทบาท (RBAC Read-Only)'),
        el('span', { className: 'pill' }, 'อ่านอย่างเดียว')
      ),
      el('p', { className: 'muted card-lead' }, 'สรุปขอบเขตสิทธิ์ที่เซิร์ฟเวอร์บังคับใช้จริงสำหรับแต่ละบทบาท'),
      el('div', { className: 'watchlist-table-wrap' },
        el('table', { className: 'watchlist-table' },
          el('thead', {},
            el('tr', {},
              el('th', {}, 'ความสามารถ / เส้นทาง API'),
              el('th', {}, 'Farmer'),
              el('th', {}, 'ICS'),
              el('th', {}, 'Admin')
            )
          ),
          el('tbody', {},
            ...rbacRows.map(row => el('tr', {}, el('td', {}, row[0]), el('td', {}, el('span', { className: row[1] === 'ได้' ? 'pill success' : 'pill' }, row[1])), el('td', {}, el('span', { className: row[2] === 'ได้' ? 'pill success' : 'pill' }, row[2])), el('td', {}, el('span', { className: row[3] === 'ได้' ? 'pill success' : 'pill' }, row[3]))))
          )
        )
      )
    );

    const auditSection = adminModule.buildAuditLogsSection(adminData.auditLogs);
    content.replaceChildren(kpis, rbacTableCard, auditSection);

    tabs.classList.remove('hide');
    tabs.replaceChildren(
      Object.assign(document.createElement('button'), { className: 'active', textContent: 'ภาพรวมระบบ' }),
      Object.assign(document.createElement('button'), { textContent: 'คำเชิญลงทะเบียน' }),
      Object.assign(document.createElement('button'), { textContent: 'ผู้ใช้งาน' }),
      Object.assign(document.createElement('button'), { textContent: 'มอบหมาย Farmer' })
    );
  }, { users: mockAdminUsers, assignments: mockAdminAssignments, auditLogs: mockAuditLogs });

  await desktopPage.waitForTimeout(600);
  await desktopPage.screenshot({ path: path.join(outDir, '03-admin-dashboard-desktop.png'), fullPage: true });
  console.log('Saved 03-admin-dashboard-desktop.png');

  await desktopCtx.close();

  // 2. Mobile Viewport (390x844)
  const mobileCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.0.0'
  });
  const mobilePage = await mobileCtx.newPage();

  // 2.1 Farmer Dashboard - Mobile
  await mobilePage.goto('http://localhost:4173');
  await mobilePage.fill('#demoCode', 'F-STG-001');
  await mobilePage.click('#demoLoginButton');
  await mobilePage.waitForSelector('.rhythm-track-wrap');
  await mobilePage.waitForTimeout(600);
  await mobilePage.screenshot({ path: path.join(outDir, '04-farmer-dashboard-mobile.png'), fullPage: true });
  console.log('Saved 04-farmer-dashboard-mobile.png');

  // 2.2 Activity Recording - Mobile
  const recordDockBtn = mobilePage.locator('#mobile-dock .dock-btn:has-text("บันทึก")');
  await recordDockBtn.click();
  await mobilePage.waitForSelector('#recordForm');
  await mobilePage.waitForTimeout(600);
  await mobilePage.screenshot({ path: path.join(outDir, '05-activity-record-mobile.png'), fullPage: true });
  console.log('Saved 05-activity-record-mobile.png');

  // 2.3 Input Approval Workflow - Mobile
  const approvalDockBtn = mobilePage.locator('#mobile-dock .dock-btn:has-text("ขอปัจจัย")');
  await approvalDockBtn.click();
  await mobilePage.waitForSelector('#approvalForm');
  await mobilePage.waitForTimeout(600);
  await mobilePage.screenshot({ path: path.join(outDir, '06-approval-workflow-mobile.png'), fullPage: true });
  console.log('Saved 06-approval-workflow-mobile.png');

  // 2.4 ICS Dashboard - Mobile
  const icsMobilePill = mobilePage.locator('button.switcher-pill:has-text("ICS")');
  await icsMobilePill.click();
  await mobilePage.waitForSelector('.kpi-grid');
  await mobilePage.waitForTimeout(600);
  await mobilePage.screenshot({ path: path.join(outDir, '07-ics-dashboard-mobile.png'), fullPage: true });
  console.log('Saved 07-ics-dashboard-mobile.png');

  // 2.5 Admin Dashboard - Mobile
  await mobilePage.evaluate(async (adminData) => {
    const adminModule = await import('/js/views/admin.js');
    const content = document.getElementById('content');
    const welcome = document.getElementById('welcome');
    welcome.textContent = 'ยินดีต้อนรับ ผู้ดูแลระบบ (System Admin)';

    const domModule = await import('/js/core/dom.js');
    const iconModule = await import('/js/core/icons.js');
    const { el, card } = domModule;
    const { icon } = iconModule;

    const users = adminData.users;
    const assignments = adminData.assignments;
    const activeUsers = users.filter(u => u.status === 'active').length;
    const unlinkedUsers = users.filter(u => !u.linked).length;
    const farmerCount = users.filter(u => u.role === 'farmer').length;
    const icsCount = users.filter(u => u.role === 'ics').length;
    const activeAssignments = assignments.filter(a => !a.ends_at).length;

    const kpis = el('div', { className: 'grid kpi-grid' },
      [
        ['ผู้ใช้งานทั้งหมด', `${users.length}`, 'คน', `เปิดใช้งาน ${activeUsers} • รอผูก LINE ${unlinkedUsers}`],
        ['เกษตรกร (Farmer)', `${farmerCount}`, 'ราย', 'บันทึกแปลงและขออนุมัติปัจจัย'],
        ['เจ้าหน้าที่ ICS', `${icsCount}`, 'คน', 'ตรวจแปลง พิจารณาคำขอ และจุดเสี่ยง'],
        ['การมอบหมายที่ใช้งานอยู่', `${activeAssignments}`, 'คู่', `ทั้งหมดในระบบ ${assignments.length} รายการ`]
      ].map(([label, val, unit, desc]) =>
        el('div', { className: 'card kpi-card' },
          el('div', { className: 'kpi-top' }, el('span', { className: 'kpi-tag' }, label)),
          el('div', { className: 'kpi-num' }, val, el('small', {}, ` ${unit}`)),
          el('div', { className: 'kpi-desc muted' }, desc)
        )
      )
    );

    const rbacRows = [
      ['สร้าง/แก้ไขแปลงปลูกและบันทึกกิจกรรมตนเอง', 'ได้', 'ดูในความดูแล', '—'],
      ['ยื่นคำขออนุมัติปัจจัยการผลิต (/approvals POST)', 'ได้', '—', '—'],
      ['พิจารณาคำขอปัจจัย (/approvals PATCH)', '—', 'ได้', '—'],
      ['ดูความเสี่ยง (/risks) และบันทึกผลตรวจ (/reviews)', '—', 'ได้', '—'],
      ['จัดการชุดรายการตรวจและยืนยันเกณฑ์ (/checklists)', '—', 'สร้าง/แก้ไขร่าง', 'ยืนยันเกณฑ์'],
      ['สร้างคำเชิญ จัดการผู้ใช้ และมอบหมาย (/admin/*)', '—', '—', 'ได้']
    ];

    const rbacTableCard = card(
      el('div', { className: 'row between' },
        el('h3', {}, icon('shield', 16), ' ตารางสิทธิ์ตามบทบาท (RBAC Read-Only)'),
        el('span', { className: 'pill' }, 'อ่านอย่างเดียว')
      ),
      el('p', { className: 'muted card-lead' }, 'สรุปขอบเขตสิทธิ์ที่เซิร์ฟเวอร์บังคับใช้จริงสำหรับแต่ละบทบาท'),
      el('div', { className: 'watchlist-table-wrap' },
        el('table', { className: 'watchlist-table' },
          el('thead', {},
            el('tr', {},
              el('th', {}, 'ความสามารถ / เส้นทาง API'),
              el('th', {}, 'Farmer'),
              el('th', {}, 'ICS'),
              el('th', {}, 'Admin')
            )
          ),
          el('tbody', {},
            ...rbacRows.map(row => el('tr', {}, el('td', {}, row[0]), el('td', {}, el('span', { className: row[1] === 'ได้' ? 'pill success' : 'pill' }, row[1])), el('td', {}, el('span', { className: row[2] === 'ได้' ? 'pill success' : 'pill' }, row[2])), el('td', {}, el('span', { className: row[3] === 'ได้' ? 'pill success' : 'pill' }, row[3]))))
          )
        )
      )
    );

    const auditSection = adminModule.buildAuditLogsSection(adminData.auditLogs);
    content.replaceChildren(kpis, rbacTableCard, auditSection);
  }, { users: mockAdminUsers, assignments: mockAdminAssignments, auditLogs: mockAuditLogs });

  await mobilePage.waitForTimeout(600);
  await mobilePage.screenshot({ path: path.join(outDir, '08-admin-dashboard-mobile.png'), fullPage: true });
  console.log('Saved 08-admin-dashboard-mobile.png');

  await mobileCtx.close();
  await browser.close();
  console.log('All 8 audit screenshots captured successfully!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
