import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  LINE_EVENT_TYPES,
  buildInputSubmittedMessage,
  buildApprovalApprovedMessage,
  buildApprovalRejectedMessage,
  buildRhythmOverdueMessage,
  buildCapaDeadlineMessage,
  sendLinePushMessage,
  fetchChannelAccessToken
} from '../shared/line-messaging.js';

import {
  initNotificationTable,
  recordAndDispatchNotification,
  notifyInputApprovalSubmitted,
  notifyApprovalDecided,
  scanAndNotifyRhythmOverdue,
  scanAndNotifyCapaDeadlines
} from '../lib/notification-dispatcher.js';

test('LINE message builders format all 5 required events with clear Thai copy and correct URLs', () => {
  const liffId = '2012022503-PE16sYjU';

  // 1. Input submitted -> ICS officer
  const msg1 = buildInputSubmittedMessage({
    farmerName: 'นายสมศักดิ์ ปลูกสุข',
    plotName: 'แปลง A-03 ข้าวหอมมะลิ 105',
    inputName: 'ปุ๋ยหมักชีวภาพสูตร พด.1',
    details: 'ใช้บำรุงระยะแตกกอ อัตรา 50 กก./ไร่',
    liffId
  });
  assert.equal(msg1.length, 1);
  assert.equal(msg1[0].type, 'text');
  assert.ok(msg1[0].text.includes('มีคำขอใช้ปัจจัยการผลิตใหม่'));
  assert.ok(msg1[0].text.includes('นายสมศักดิ์ ปลูกสุข'));
  assert.ok(msg1[0].text.includes('ปุ๋ยหมักชีวภาพสูตร พด.1'));
  assert.ok(msg1[0].text.includes(`https://liff.line.me/${liffId}?tab=approval`));

  // 2. Request approved -> Farmer
  const msg2 = buildApprovalApprovedMessage({
    plotName: 'แปลง A-03',
    inputName: 'ปุ๋ยหมักชีวภาพสูตร พด.1',
    comment: 'สอดคล้องตามมาตรฐาน PGS ผักไหม อนุมัติการใช้',
    liffId
  });
  assert.ok(msg2[0].text.includes('คำขอใช้ปัจจัยการผลิตได้รับการอนุมัติ'));
  assert.ok(msg2[0].text.includes('สอดคล้องตามมาตรฐาน PGS ผักไหม'));

  // 3. Request rejected -> Farmer with reason
  const msg3 = buildApprovalRejectedMessage({
    plotName: 'แปลง A-03',
    inputName: 'ฮอร์โมนไข่ผสมสารสังเคราะห์',
    reason: 'พบสารเคมีสังเคราะห์ต้องห้ามตามเกณฑ์ มกท./PGS',
    liffId
  });
  assert.ok(msg3[0].text.includes('คำขอใช้ปัจจัยการผลิตไม่ผ่านการอนุมัติ'));
  assert.ok(msg3[0].text.includes('พบสารเคมีสังเคราะห์ต้องห้าม'));
  assert.ok(msg3[0].text.includes('คำแนะนำ: ท่านสามารถปรับปรุงสูตร'));

  // 4. Rhythm overdue > 14 days -> Farmer
  const msg4 = buildRhythmOverdueMessage({
    farmerName: 'สมใจ',
    plotName: 'แปลง B-01 ถั่วเหลือง',
    daysInactive: 15,
    liffId
  });
  assert.ok(msg4[0].text.includes('แจ้งเตือนรอบบันทึกกิจกรรมแปลง 14 วัน'));
  assert.ok(msg4[0].text.includes('ไม่พบบันทึกกิจกรรมเกิน 15 วัน'));
  assert.ok(msg4[0].text.includes(`https://liff.line.me/${liffId}?tab=record`));

  // 5. CAPA deadline approaching -> Responsible user
  const msg5 = buildCapaDeadlineMessage({
    responsibleName: 'นายประสิทธิ์ สุขใจ',
    plotName: 'แปลง C-12 ปอเทือง',
    standardCode: 'PGS',
    finding: 'พบแนวกันชนระยะห่างไม่ถึง 1 เมตร',
    actionRequired: 'ปลูกหญ้าแฝกเสริมแนวกันชน',
    dueDate: '2026-11-25',
    liffId
  });
  assert.ok(msg5[0].text.includes('แจ้งเตือนกำหนดส่งงานแก้ไขปรับปรุง (CAPA)'));
  assert.ok(msg5[0].text.includes('พบแนวกันชนระยะห่างไม่ถึง 1 เมตร'));
  assert.ok(msg5[0].text.includes('ปลูกหญ้าแฝกเสริมแนวกันชน'));
  assert.ok(msg5[0].text.includes('2026-11-25'));
  assert.ok(msg5[0].text.includes(`https://liff.line.me/${liffId}?tab=reviews`));
});

test('sendLinePushMessage delivers mock safely without real token and calls mock fetch when token is provided', async () => {
  // Test 1: Dry run without token
  const dryRunRes = await sendLinePushMessage({
    channelAccessToken: '',
    to: 'U11112222333344445555666677778888',
    messages: [{ type: 'text', text: 'ทดสอบ' }]
  });
  assert.equal(dryRunRes.ok, true);
  assert.equal(dryRunRes.status, 'skipped_missing_token');

  // Test 2: Valid delivery with mock fetch
  let capturedRequest = null;
  const mockFetch = async (url, options) => {
    capturedRequest = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 200,
      text: async () => '{"sentMessages":[{"id":"12345"}]}'
    };
  };

  const deliverRes = await sendLinePushMessage({
    channelAccessToken: 'mock-channel-access-token-xyz',
    to: 'Uabcdef1234567890abcdef1234567890',
    messages: [{ type: 'text', text: 'สวัสดีเกษตรกร' }],
    fetchImpl: mockFetch
  });

  assert.equal(deliverRes.ok, true);
  assert.equal(deliverRes.status, 'sent');
  assert.ok(capturedRequest);
  assert.equal(capturedRequest.url, 'https://api.line.me/v2/bot/message/push');
  assert.equal(capturedRequest.options.headers.Authorization, 'Bearer mock-channel-access-token-xyz');
  assert.equal(capturedRequest.body.to, 'Uabcdef1234567890abcdef1234567890');
});

test('Notification Dispatcher prevents duplicate notifications via idempotency key', async () => {
  const db = new DatabaseSync(':memory:');
  initNotificationTable(db);

  db.exec(`
    CREATE TABLE users(id INTEGER PRIMARY KEY, line_id TEXT UNIQUE, name TEXT, role TEXT, status TEXT);
    INSERT INTO users(id, line_id, name, role, status) VALUES (1, 'U_FARMER_1', 'Farmer 1', 'farmer', 'active');
  `);

  const idempotencyKey = 'test:approval:1:submit';
  const messages = [{ type: 'text', text: 'ทดสอบการส่งครั้งแรก' }];

  // Call 1: First dispatch
  const res1 = await recordAndDispatchNotification({
    db,
    idempotencyKey,
    eventType: LINE_EVENT_TYPES.INPUT_SUBMITTED,
    recipientUserId: 1,
    recipientLineId: 'U_FARMER_1',
    messages,
    channelAccessToken: 'mock-token'
  });
  assert.equal(res1.ok, true);
  assert.equal(res1.idempotencyKey, idempotencyKey);
  assert.equal(res1.skipped, undefined);

  // Verify stored in DB
  const row = db.prepare('SELECT * FROM line_notifications WHERE idempotency_key = ?').get(idempotencyKey);
  assert.ok(row);
  assert.equal(row.status, 'sent');
  assert.equal(row.recipient_line_id, 'U_FARMER_1');

  // Call 2: Duplicate dispatch with same key
  const res2 = await recordAndDispatchNotification({
    db,
    idempotencyKey,
    eventType: LINE_EVENT_TYPES.INPUT_SUBMITTED,
    recipientUserId: 1,
    recipientLineId: 'U_FARMER_1',
    messages,
    channelAccessToken: 'mock-token'
  });
  assert.equal(res2.ok, true);
  assert.equal(res2.skipped, true);
  assert.equal(res2.reason, 'DUPLICATE_IDEMPOTENCY_KEY');

  // Verify only 1 record exists in line_notifications
  const count = db.prepare('SELECT COUNT(*) as c FROM line_notifications').get().c;
  assert.equal(count, 1);
});

test('Role and assignment boundaries ensure only assigned officer and requesting farmer receive notifications', async () => {
  const db = new DatabaseSync(':memory:');
  initNotificationTable(db);

  db.exec(`
    CREATE TABLE users(id INTEGER PRIMARY KEY, line_id TEXT UNIQUE, name TEXT, role TEXT, status TEXT);
    CREATE TABLE plots(id INTEGER PRIMARY KEY, owner_id INTEGER, name TEXT);
    CREATE TABLE approvals(id INTEGER PRIMARY KEY, plot_id INTEGER, user_id INTEGER, input_name TEXT, details TEXT, status TEXT);
    CREATE TABLE farmer_assignments(id INTEGER PRIMARY KEY, ics_user_id INTEGER, farmer_user_id INTEGER, ends_at TEXT);

    -- Users
    INSERT INTO users(id, line_id, name, role, status) VALUES
      (10, 'U_FARMER_A', 'เกษตรกร สมศรี', 'farmer', 'active'),
      (20, 'U_ICS_OFFICER_1', 'ผู้ตรวจ วิชัย', 'ics', 'active'),
      (21, 'U_ICS_OFFICER_2', 'ผู้ตรวจ สมชาย', 'ics', 'active');

    -- Plot owned by Farmer 10
    INSERT INTO plots(id, owner_id, name) VALUES (101, 10, 'แปลงนาอินทรีย์ A-03');

    -- Approval submitted by Farmer 10
    INSERT INTO approvals(id, plot_id, user_id, input_name, details, status)
    VALUES (501, 101, 10, 'น้ำหมักชีวภาพแหนแดง', 'สูตรหมักธรรมชาติ', 'pending');

    -- Assignment: Farmer 10 is assigned to Officer 20 (NOT 21)
    INSERT INTO farmer_assignments(id, ics_user_id, farmer_user_id, ends_at)
    VALUES (1, 20, 10, NULL);
  `);

  // Event 1: Notify submission -> must go to Officer 20, NOT Officer 21
  const submitRes = await notifyInputApprovalSubmitted({
    db,
    approvalId: 501,
    farmerId: 10,
    plotId: 101,
    inputName: 'น้ำหมักชีวภาพแหนแดง',
    details: 'สูตรหมักธรรมชาติ',
    liffId: '2012022503-PE16sYjU',
    channelAccessToken: 'mock-token'
  });

  assert.equal(submitRes.ok, true);
  assert.equal(submitRes.recipientLineId, 'U_ICS_OFFICER_1');

  // Verify Officer 21 got nothing
  const officer21Records = db.prepare("SELECT * FROM line_notifications WHERE recipient_line_id = 'U_ICS_OFFICER_2'").all();
  assert.equal(officer21Records.length, 0);

  // Event 2: Officer reviews and approves -> must go to Farmer 10
  const reviewRes = await notifyApprovalDecided({
    db,
    approvalId: 501,
    status: 'approved',
    comment: 'ผ่านเกณฑ์มาตรฐาน สามารถนำไปใช้ได้',
    reviewerId: 20,
    liffId: '2012022503-PE16sYjU',
    channelAccessToken: 'mock-token'
  });

  assert.equal(reviewRes.ok, true);
  assert.equal(reviewRes.recipientLineId, 'U_FARMER_A');

  const farmerRecords = db.prepare("SELECT * FROM line_notifications WHERE recipient_line_id = 'U_FARMER_A'").all();
  assert.equal(farmerRecords.length, 1);
  assert.equal(farmerRecords[0].event_type, LINE_EVENT_TYPES.APPROVAL_APPROVED);
});

test('Security Invariant: No LINE Channel Access Token or Secret is exposed in public/ frontend files', () => {
  const publicDir = path.join(process.cwd(), 'public');
  const files = fs.readdirSync(publicDir, { recursive: true });

  for (const file of files) {
    const fullPath = path.join(publicDir, file);
    if (!fs.statSync(fullPath).isFile()) continue;
    if (!/\.(js|html|css|json)$/.test(file)) continue;

    const content = fs.readFileSync(fullPath, 'utf8');
    assert.ok(
      !content.includes('LINE_CHANNEL_ACCESS_TOKEN'),
      `File ${file} must not contain LINE_CHANNEL_ACCESS_TOKEN`
    );
    assert.ok(
      !content.includes('CHANNEL_SECRET'),
      `File ${file} must not contain CHANNEL_SECRET`
    );
  }
});

test('Method 2 (OAuth v2.1): fetchChannelAccessToken retrieves, caches, and auto-uses access token via Channel ID and Secret', async () => {
  let oauthCalls = [];
  const mockOAuthFetch = async (url, options) => {
    oauthCalls.push({ url, options });
    if (url.includes('/oauth/accessToken')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'live-generated-access-token-method2',
          token_type: 'Bearer',
          expires_in: 2592000
        })
      };
    }
    // Push message mock
    return {
      ok: true,
      status: 200,
      text: async () => '{"sentMessages":[{"id":"msg-999"}]}'
    };
  };

  // 1. fetchChannelAccessToken direct call
  const token = await fetchChannelAccessToken({
    channelId: '2012021215',
    channelSecret: '98a82d30d8dff04bf48e1338c5ff8460',
    fetchImpl: mockOAuthFetch
  });

  assert.equal(token, 'live-generated-access-token-method2');
  assert.equal(oauthCalls.length, 1);
  assert.equal(oauthCalls[0].url, 'https://api.line.me/v2/oauth/accessToken');
  assert.equal(oauthCalls[0].options.method, 'POST');

  // 2. Second call should return cached token without calling API again
  const cachedToken = await fetchChannelAccessToken({
    channelId: '2012021215',
    channelSecret: '98a82d30d8dff04bf48e1338c5ff8460',
    fetchImpl: mockOAuthFetch
  });
  assert.equal(cachedToken, 'live-generated-access-token-method2');
  assert.equal(oauthCalls.length, 1); // no extra network request

  // 3. recordAndDispatchNotification using Method 2 (no channelAccessToken passed)
  const db = new DatabaseSync(':memory:');
  initNotificationTable(db);
  db.exec(`
    CREATE TABLE users(id INTEGER PRIMARY KEY, line_id TEXT UNIQUE, name TEXT, role TEXT, status TEXT);
    INSERT INTO users(id, line_id, name, role, status) VALUES (5, 'U_ICS_LEAD', 'หัวหน้า ICS', 'ics', 'active');
  `);

  const dispatchRes = await recordAndDispatchNotification({
    db,
    idempotencyKey: 'method2:test:approval:777',
    eventType: LINE_EVENT_TYPES.INPUT_SUBMITTED,
    recipientUserId: 5,
    recipientLineId: 'U_ICS_LEAD',
    messages: [{ type: 'text', text: 'ทดสอบ Method 2 Dynamic Token' }],
    channelAccessToken: null,
    channelId: '2012021215',
    channelSecret: '98a82d30d8dff04bf48e1338c5ff8460',
    fetchImpl: mockOAuthFetch
  });

  assert.equal(dispatchRes.ok, true);
  assert.equal(dispatchRes.deliveryStatus, 'sent');

  // Verify push message header received the dynamically generated token
  const pushCall = oauthCalls.find(c => c.url.includes('/bot/message/push'));
  assert.ok(pushCall);
  assert.equal(pushCall.options.headers.Authorization, 'Bearer live-generated-access-token-method2');
});

