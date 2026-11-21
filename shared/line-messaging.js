/**
 * PakMaii - Real LINE Messaging API Push Notifications & Message Builders
 *
 * Implements server-side notification generation for:
 * 1. New input approval request -> Assigned ICS officer
 * 2. Request approved -> Requesting Farmer
 * 3. Request rejected -> Requesting Farmer with rejection reason
 * 4. 14-day rhythm overdue -> Farmer
 * 5. CAPA deadline approaching -> Responsible user
 */

export const LINE_EVENT_TYPES = Object.freeze({
  INPUT_SUBMITTED: 'input_request_submitted',
  APPROVAL_APPROVED: 'approval_approved',
  APPROVAL_REJECTED: 'approval_rejected',
  RHYTHM_OVERDUE: 'rhythm_overdue_14d',
  CAPA_DEADLINE: 'capa_deadline'
});

/**
 * 1. Build notification for assigned ICS officer when farmer submits an input request
 */
export function buildInputSubmittedMessage({ farmerName, plotName, inputName, details, liffId }) {
  const liffUrl = liffId ? `https://liff.line.me/${liffId}?tab=approval` : '';
  const lines = [
    '📋 มีคำขอใช้ปัจจัยการผลิตใหม่ (รอการพิจารณา)',
    '────────────────────────',
    `เกษตรกร: ${farmerName || 'เกษตรกรในความดูแล'}`,
    `แปลง: ${plotName || '-'}`,
    `ปัจจัยการผลิต: ${inputName}`,
    `รายละเอียด: ${details || '-'}`,
    '────────────────────────',
    'กรุณาตรวจสอบความสอดคล้องตามเกณฑ์มาตรฐานอินทรีย์ และบันทึกผลการพิจารณาในระบบ ICS'
  ];
  if (liffUrl) lines.push(`\n🔗 แตะเพื่อพิจารณาคำขอ: ${liffUrl}`);

  return [{
    type: 'text',
    text: lines.join('\n')
  }];
}

/**
 * 2. Build notification for farmer when input request is approved
 */
export function buildApprovalApprovedMessage({ plotName, inputName, comment, liffId }) {
  const liffUrl = liffId ? `https://liff.line.me/${liffId}?tab=approval` : '';
  const lines = [
    '✅ คำขอใช้ปัจจัยการผลิตได้รับการอนุมัติ',
    '────────────────────────',
    `แปลง: ${plotName || '-'}`,
    `ปัจจัยการผลิต: ${inputName}`,
    `สถานะ: อนุมัติแล้ว (ผ่านเกณฑ์มาตรฐานอินทรีย์)`
  ];
  if (comment) {
    lines.push(`ความเห็นเจ้าหน้าที่: ${comment}`);
  }
  lines.push('────────────────────────');
  lines.push('ท่านสามารถนำปัจจัยการผลิตนี้ไปใช้ในแปลง และอย่าลืมบันทึกกิจกรรมหลังใช้งานครับ');
  if (liffUrl) lines.push(`\n🔗 ตรวจสอบรายละเอียด: ${liffUrl}`);

  return [{
    type: 'text',
    text: lines.join('\n')
  }];
}

/**
 * 3. Build notification for farmer when input request is rejected with reason
 */
export function buildApprovalRejectedMessage({ plotName, inputName, reason, liffId }) {
  const liffUrl = liffId ? `https://liff.line.me/${liffId}?tab=approval` : '';
  const lines = [
    '❌ คำขอใช้ปัจจัยการผลิตไม่ผ่านการอนุมัติ',
    '────────────────────────',
    `แปลง: ${plotName || '-'}`,
    `ปัจจัยการผลิต: ${inputName}`,
    `สถานะ: ไม่อนุมัติ`,
    `เหตุผล: ${reason || 'ส่วนประกอบไม่สอดคล้องกับมาตรฐานเกษตรอินทรีย์'}`,
    '────────────────────────',
    'คำแนะนำ: ท่านสามารถปรับปรุงสูตรหรือสอบถามแนวทางแก้ไขจากเจ้าหน้าที่ ICS ประจำกลุ่มได้ครับ'
  ];
  if (liffUrl) lines.push(`\n🔗 ส่งคำขอใหม่: ${liffUrl}`);

  return [{
    type: 'text',
    text: lines.join('\n')
  }];
}

/**
 * 4. Build notification for farmer when plot has no activity recorded for > 14 days
 */
export function buildRhythmOverdueMessage({ farmerName, plotName, daysInactive = 14, liffId }) {
  const liffUrl = liffId ? `https://liff.line.me/${liffId}?tab=record` : '';
  const lines = [
    '⏰ แจ้งเตือนรอบบันทึกกิจกรรมแปลง 14 วัน',
    '────────────────────────',
    `สวัสดีครับ คุณ${farmerName || 'สมาชิกเกษตรกร'}`,
    `แปลง: ${plotName || '-'}`,
    `สถานะ: ไม่พบบันทึกกิจกรรมเกิน ${daysInactive} วัน`,
    '────────────────────────',
    'การบันทึกการดูแลแปลงสม่ำเสมอเป็นข้อกำหนดสำคัญตามมาตรฐาน PGS ผักไหม',
    'กรุณาบันทึกกิจกรรมล่าสุดเพื่อรักษาความต่อเนื่องของประวัติแปลงครับ'
  ];
  if (liffUrl) lines.push(`\n📝 แตะเพื่อบันทึกแปลงทันที: ${liffUrl}`);

  return [{
    type: 'text',
    text: lines.join('\n')
  }];
}

/**
 * 5. Build notification for responsible user when CAPA corrective action deadline is approaching
 */
export function buildCapaDeadlineMessage({ responsibleName, plotName, standardCode = 'PGS', finding, actionRequired, dueDate, liffId }) {
  const liffUrl = liffId ? `https://liff.line.me/${liffId}?tab=reviews` : '';
  const lines = [
    '⚠️ แจ้งเตือนกำหนดส่งงานแก้ไขปรับปรุง (CAPA)',
    '────────────────────────',
    `ผู้รับผิดชอบ: ${responsibleName || 'สมาชิกที่ได้รับมอบหมาย'}`,
    `แปลง: ${plotName || '-'} (มาตรฐาน ${standardCode})`,
    `ข้อบกพร่อง: ${finding || '-'}`,
    `สิ่งที่ต้องดำเนินการ: ${actionRequired || '-'}`,
    `วันครบกำหนด: ${dueDate}`,
    '────────────────────────',
    'กรุณาดำเนินการแก้ไขและประสานเจ้าหน้าที่ ICS เพื่อตรวจประเมินซ้ำตามกำหนดเวลาครับ'
  ];
  if (liffUrl) lines.push(`\n📋 ตรวจสอบรายการ CAPA: ${liffUrl}`);

  return [{
    type: 'text',
    text: lines.join('\n')
  }];
}

/**
 * Issue a Channel Access Token (v2.1) dynamically using Channel ID & Channel Secret
 * Endpoint: POST https://api.line.me/v2/oauth/accessToken
 */
let cachedTokenInfo = { token: null, expiresAt: 0 };

export async function fetchChannelAccessToken({
  channelId,
  channelSecret,
  fetchImpl = globalThis.fetch
}) {
  if (!channelId || !channelSecret) return null;

  // Check cached token validity (with 5-minute safety buffer)
  const now = Date.now();
  if (cachedTokenInfo.token && cachedTokenInfo.expiresAt > now + 300000) {
    return cachedTokenInfo.token;
  }

  // Dry-run mode for tests
  const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test' && !process.env?.FORCE_LINE_REAL_PUSH;
  const isCustomFetch = fetchImpl && fetchImpl !== globalThis.fetch;
  if (isTest && !isCustomFetch) {
    return 'mock-auto-generated-access-token';
  }

  try {
    const response = await fetchImpl('https://api.line.me/v2/oauth/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: String(channelId),
        client_secret: String(channelSecret)
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Failed to issue LINE access token:', response.status, err);
      return null;
    }

    const data = await response.json();
    if (data.access_token) {
      cachedTokenInfo = {
        token: data.access_token,
        expiresAt: now + (Number(data.expires_in) || 2592000) * 1000
      };
      return data.access_token;
    }
    return null;
  } catch (error) {
    console.error('Error fetching LINE channel access token:', error);
    return null;
  }
}

/**
 * Send reply message via official LINE Messaging API
 * Endpoint: POST https://api.line.me/v2/bot/message/reply
 */
export async function sendLineReplyMessage({
  channelAccessToken,
  replyToken,
  messages,
  fetchImpl = globalThis.fetch
}) {
  if (!replyToken || !Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: 'INVALID_ARGUMENTS' };
  }
  if (!channelAccessToken) {
    return { ok: true, status: 'skipped_no_token' };
  }

  const endpoint = 'https://api.line.me/v2/bot/message/reply';
  const payload = JSON.stringify({ replyToken, messages });

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channelAccessToken}`
      },
      body: payload
    });

    if (response.ok) {
      return { ok: true, status: 'replied' };
    }
    const errText = await response.text().catch(() => '');
    console.error('LINE reply error:', response.status, errText);
    return { ok: false, status: 'failed', error: errText };
  } catch (err) {
    console.error('LINE reply network error:', err);
    return { ok: false, status: 'error', error: err.message };
  }
}
export async function sendLinePushMessage({
  channelAccessToken,
  to,
  messages,
  fetchImpl,
  maxRetries = 2
}) {
  if (!to || !Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: 'INVALID_ARGUMENTS', details: 'Missing recipient "to" or empty "messages"' };
  }

  // Dry-run mode if no token or running in local automated test environment without custom mock fetchImpl
  const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test' && !process.env?.FORCE_LINE_REAL_PUSH;
  const isCustomFetch = fetchImpl && fetchImpl !== globalThis.fetch;
  const isMockToken = !channelAccessToken || (typeof channelAccessToken === 'string' && channelAccessToken.startsWith('mock-'));

  if (isMockToken && !isCustomFetch) {
    return {
      ok: true,
      status: !channelAccessToken ? 'skipped_missing_token' : 'mock_delivered',
      to,
      messagesCount: messages.length,
      messages
    };
  }
  if (isTest && !isCustomFetch) {
    return {
      ok: true,
      status: 'mock_delivered',
      to,
      messagesCount: messages.length,
      messages
    };
  }

  const endpoint = 'https://api.line.me/v2/bot/message/push';
  const payload = JSON.stringify({ to, messages });
  const fetcher = fetchImpl || globalThis.fetch;

  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${channelAccessToken}`
        },
        body: payload
      });

      if (response.ok) {
        return {
          ok: true,
          status: 'sent',
          statusCode: response.status
        };
      }

      const status = response.status;
      // Retry on 429 (Rate Limit) or 5xx server errors
      if ((status === 429 || status >= 500) && attempt < maxRetries) {
        attempt++;
        const delayMs = attempt * 300;
        await new Promise(res => setTimeout(res, delayMs));
        continue;
      }

      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch {}

      return {
        ok: false,
        status: 'failed',
        statusCode: status,
        error: errorBody || `HTTP ${status}`
      };
    } catch (err) {
      if (attempt < maxRetries) {
        attempt++;
        await new Promise(res => setTimeout(res, attempt * 300));
        continue;
      }
      return {
        ok: false,
        status: 'error',
        error: err.message
      };
    }
  }

  return { ok: false, status: 'max_retries_exceeded' };
}
