import { D1Repository } from './repository/d1.js';
import { agencyCodeDigests, verifyAdminPassword } from './auth.js';
import {
  notifyInputApprovalSubmitted,
  notifyApprovalDecided,
  scanAndNotifyRhythmOverdue
} from '../lib/notification-dispatcher.js';
import {
  sendLineReplyMessage,
  fetchChannelAccessToken
} from '../shared/line-messaging.js';
import {
  MAX_EVIDENCE_BYTES,
  detectImageContentType,
  extensionForContentType,
  buildEvidenceObjectKey,
  createEvidenceStorage,
} from './storage.js';
import {
  HttpError,
  ALLOWED_CAPA_STATUSES,
  ALLOWED_VALIDATION_STATUSES,
  landingForRole,
  text,
  optionalText,
  positiveId,
  isoDate,
  photoUrl,
  standardCodeValue,
  severityValue,
  validateChecklistItems,
  validateChecklistResults,
  validateReviewFindings,
} from '../shared/validation.js';

const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'no-referrer',
};

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), { status, headers: { ...jsonHeaders, ...securityHeaders, ...extraHeaders } });
}

async function sha256Hex(value) {
  const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomHexBytes(length = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function requestBody(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 102_400) throw new HttpError(413, 'ข้อมูลมีขนาดใหญ่เกินกำหนด');
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  } catch {
    throw new HttpError(400, 'ข้อมูล JSON ไม่ถูกต้อง');
  }
}

async function agencyCredential(agencyCode, rawKeyRing) {
  try {
    const [primary] = await agencyCodeDigests(agencyCode, rawKeyRing);
    return primary ? { ...primary, hint: String(agencyCode).trim().toUpperCase() } : null;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, 'ระบบรหัสประจำตัวยังไม่พร้อมใช้งาน');
  }
}

const isLoopbackHost = hostname => hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
const trustedClientAddress = request => request.cf ? request.headers.get('cf-connecting-ip') || 'cloudflare-unknown' : 'local-untrusted';

async function createSession(repository, userId) {
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  await repository.createSession(userId, await sha256Hex(token), Date.now() + 7 * 86_400_000);
  return token;
}

async function verifyLineIdToken(idToken, env) {
  const token = text(idToken, 'LINE ID token', 4096);
  if (!env.LINE_CHANNEL_ID) throw new HttpError(503, 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ID');
  const verificationRequest = new Request('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: token, client_id: env.LINE_CHANNEL_ID }),
  });
  const response = env.LINE_VERIFY
    ? await env.LINE_VERIFY.fetch(verificationRequest)
    : await fetch(verificationRequest);
  const profile = await response.json().catch(() => ({}));
  if (!response.ok || typeof profile.sub !== 'string' || !profile.sub) throw new HttpError(401, 'LINE authentication ไม่สำเร็จ');
  return profile;
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function authenticate(request, repository) {
  const match = (request.headers.get('authorization') || '').match(/^Bearer ([A-Fa-f0-9]{64})$/);
  if (!match) return { response: json({ error: 'กรุณาเข้าสู่ระบบ' }, 401) };
  const user = await repository.findActiveSession(await sha256Hex(match[1]), Date.now());
  if (!user) return { response: json({ error: 'กรุณาเข้าสู่ระบบ' }, 401) };
  if (user.status !== 'active') return { response: json({ error: 'บัญชีถูกระงับหรือยังไม่พร้อมใช้งาน' }, 403) };
  return { user, sessionHash: await sha256Hex(match[1]) };
}

function requireRole(user, role, message) {
  return user.role === role ? null : json({ error: message }, 403);
}

async function ownPlot(repository, user, rawId) {
  const id = positiveId(rawId, 'รหัสแปลง');
  const plot = await repository.findPlot(id);
  if (!plot) throw new HttpError(404, 'ไม่พบแปลง');
  if (user.role === 'admin') return plot;
  if (user.role === 'farmer' && plot.owner_id === user.id) return plot;
  if (user.role === 'ics' && await repository.hasActiveAssignment(user.id, plot.owner_id)) return plot;
  throw new HttpError(403, 'ไม่มีสิทธิ์เข้าถึงแปลง');
}

async function authorizeEvidenceAccess(repository, user, evidence) {
  if (user.role === 'admin') return;
  if (user.role === 'farmer' && evidence.owner_user_id === user.id) return;
  if (user.role === 'ics' && await repository.hasActiveAssignment(user.id, evidence.owner_user_id)) return;
  throw new HttpError(403, 'ไม่มีสิทธิ์เข้าถึงภาพหลักฐานนี้');
}

async function validatePendingEvidenceForEntity(repository, user, rawEvidenceId, plotId, entityType) {
  if (rawEvidenceId === undefined || rawEvidenceId === null || String(rawEvidenceId).trim() === '') return null;
  const evidenceId = positiveId(rawEvidenceId, 'รหัสภาพหลักฐาน');
  const evidence = await repository.findPhotoEvidence(evidenceId);
  if (!evidence) throw new HttpError(404, 'ไม่พบภาพหลักฐานที่ระบุ');
  if (evidence.uploaded_by !== user.id || evidence.plot_id !== plotId || evidence.entity_type !== entityType) {
    throw new HttpError(403, 'ไม่มีสิทธิ์ใช้ภาพหลักฐานนี้กับรายการดังกล่าว');
  }
  if (evidence.entity_id !== null) {
    throw new HttpError(400, 'ภาพหลักฐานนี้ถูกใช้งานกับรายการอื่นแล้ว');
  }
  return evidenceId;
}

const seenWorkerTutorialIps = new Set();

export async function handleApi(request, env, ctx) {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === 'GET' && pathname === '/api/health') return json({ ok: true, service: 'ready-to-grow' });
  if (request.method === 'GET' && pathname === '/api/config') {
    return json({ liffId: env.LIFF_ID || '', development: false, evidenceUploadEnabled: Boolean(env.EVIDENCE_BUCKET) });
  }
  if (pathname === '/api/tutorial') {
    const clientIp = trustedClientAddress(request);
    if (request.method === 'GET') {
      return json({ ok: true, clientIp, seen: seenWorkerTutorialIps.has(clientIp) }, 200, { 'Cache-Control': 'no-store' });
    }
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (body?.reset) seenWorkerTutorialIps.delete(clientIp);
      else seenWorkerTutorialIps.add(clientIp);
      return json({ ok: true, clientIp, seen: seenWorkerTutorialIps.has(clientIp) }, 200, { 'Cache-Control': 'no-store' });
    }
  }

  const repository = new D1Repository(env.DB);
  if (request.method === 'POST' && pathname === '/api/webhook/line') {
    const body = await requestBody(request);
    const events = Array.isArray(body?.events) ? body.events : [];
    const replies = [];
    for (const evt of events) {
      if (evt.type === 'message' && evt.message?.type === 'text') {
        const userMsg = (evt.message.text || '').trim();
        const lineUserId = evt.source?.userId;
        let replyText = '🌱 ระบบบริหารมาตรฐานเกษตรอินทรีย์ผักไหม ยินดีให้บริการครับ แตะเมนูลัดเพื่อถามสถานะได้ทันที';

        if (/^ไอดี$|^myid$|^id$/i.test(userMsg)) {
          replyText = `🆔 รหัส LINE User ID ของคุณคือ:\n${lineUserId || 'ไม่พบ ID'}\n\n💡 วิธีเปิดรับแจ้งเตือน Realtime:\n• พิมพ์ "ผูก ics" เพื่อรับแจ้งเตือนเมื่อมีคำขอใหม่\n• พิมพ์ "ผูก เกษตรกร" เพื่อรับแจ้งเตือนผลการอนุมัติ`;
        } else if (/^ผูก\s*ics$|^ผูกบัญชี\s*ics$/i.test(userMsg) && lineUserId) {
          await repository.run("UPDATE users SET line_id = ?, status = 'active' WHERE id = 910101", lineUserId);
          replyText = `✅ ผูกบัญชี LINE กับ "คุณวิชัย ผักไหม (เจ้าหน้าที่ ICS)" สำเร็จแล้ว!\n\nจากนี้เมื่อเกษตรกรส่งคำขอใช้ปุ๋ย/ปัจจัยการผลิต ระบบจะส่งข้อความแจ้งเตือนมาที่นี่แบบ Real-time ทันทีครับ 🔔`;
        } else if (/^ผูก\s*เกษตรกร$|^ผูกบัญชี\s*เกษตรกร$/i.test(userMsg) && lineUserId) {
          await repository.run("UPDATE users SET line_id = ?, status = 'active' WHERE id = 911001", lineUserId);
          replyText = `✅ ผูกบัญชี LINE กับ "คุณสมปอง คำภา (เกษตรกร)" สำเร็จแล้ว!\n\nจากนี้เมื่อเจ้าหน้าที่ ICS อนุมัติหรือปฏิเสธคำขอ ระบบจะส่งข้อความแจ้งเตือนผลมาที่นี่แบบ Real-time ทันทีครับ 🔔`;
        } else if (/เตือนแปลง|เตือนบันทึก|เตือนเกษตรกร|ลืมบันทึก|remind/i.test(userMsg)) {
          const overdueResults = await scanAndNotifyRhythmOverdue({
            db: env.DB,
            liffId: env.LIFF_ID,
            channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
            channelId: env.LINE_MESSAGING_CHANNEL_ID || env.LINE_CHANNEL_ID,
            channelSecret: env.LINE_MESSAGING_CHANNEL_SECRET || env.LINE_CHANNEL_SECRET,
            fetchImpl: fetch
          }).catch(err => { console.error('Remind error:', err); return []; });
          replyText = `⏰ ระบบ Ready to Grow ตรวจสอบแปลงในความดูแลแล้ว:\n\n• เกณฑ์: ขาดการบันทึกเกิน 14 วัน (ตามเกณฑ์ PGS ผักไหม)\n• ส่งการแจ้งเตือนเตือนเกษตรกรสำเร็จ: ${overdueResults.length} รายการ 🔔`;
        } else if (/คำขอ|approval|ปัจจัย/.test(userMsg)) {
          replyText = '🌱 ตรวจสอบสถานะคำขอ: คุณมีคำขอใช้ปัจจัยรอพิจารณา เจ้าหน้าที่ ICS กำลังตรวจสอบความสอดคล้องตามเกณฑ์อินทรีย์';
        } else if (/แปลง|สถานะ|plot/.test(userMsg)) {
          replyText = '🌾 สรุปสถานะแปลง: แปลง A-03 ข้าวหอมมะลิ 105 (ระยะปรับเปลี่ยน) มีการบันทึกสม่ำเสมอตามเกณฑ์ PGS';
        } else if (/บันทึก|กิจกรรม/.test(userMsg)) {
          replyText = '📝 แตะเพื่อเปิดแอปบันทึกแปลงผ่าน LINE LIFF: https://liff.line.me/' + (env.LIFF_ID || '');
        } else if (/ตรวจ|ผลตรวจ|pgs/.test(userMsg)) {
          replyText = '🛡️ ผลตรวจแปลงล่าสุด: ผ่านเกณฑ์มาตรฐานเกษตรอินทรีย์แบบมีส่วนร่วม (PGS)';
        } else if (/ics|เจ้าหน้าที่|ติดต่อ/.test(userMsg)) {
          replyText = '🧑‍🌾 เจ้าหน้าที่ ICS ผู้รับผิดชอบ: คุณวิชัย ผักไหม โทร. 081-234-5678';
        }

        if (evt.replyToken) {
          replies.push({
            replyToken: evt.replyToken,
            messages: [{
              type: 'text',
              text: replyText
            }]
          });
        }
      }
    }

    if (replies.length > 0) {
      let token = env.LINE_CHANNEL_ACCESS_TOKEN;
      if (!token && env.LINE_MESSAGING_CHANNEL_ID && env.LINE_MESSAGING_CHANNEL_SECRET) {
        token = await fetchChannelAccessToken({
          channelId: env.LINE_MESSAGING_CHANNEL_ID,
          channelSecret: env.LINE_MESSAGING_CHANNEL_SECRET,
          fetchImpl: fetch
        });
      }
      if (token) {
        for (const item of replies) {
          await sendLineReplyMessage({
            channelAccessToken: token,
            replyToken: item.replyToken,
            messages: item.messages,
            fetchImpl: fetch
          });
        }
      }
    }

    return json({
      ok: true,
      service: 'PakMaii LINE Webhook',
      received_events: events.length,
      processed: events.map(evt => ({
        type: evt.type || 'message',
        source: evt.source?.userId ? 'line_user' : 'simulator',
        status: 'mapped_to_activity_log'
      })),
      replies_count: replies.length,
      timestamp: new Date().toISOString()
    }, 200, { 'Cache-Control': 'no-store' });
  }

  if (request.method === 'POST' && pathname === '/api/auth/register/invite') {
    const body = await requestBody(request);
    const agencyCode = optionalText(body.agencyCode, 'รหัสประจำตัว', 32);
    const invitationToken = optionalText(body.invitationToken, 'รหัสเชิญ', 200);
    if (!agencyCode || !/^[A-Za-z0-9_-]{43}$/.test(invitationToken)) {
      throw new HttpError(400, 'ข้อมูลลงทะเบียนหรือคำเชิญไม่ถูกต้อง');
    }
    const nowMs = Date.now();
    const ipKey = await sha256Hex(trustedClientAddress(request));
    if (!await repository.consumeAuthAttempt('invite_redeem_ip', ipKey, nowMs, 60_000, 30)) {
      throw new HttpError(429, 'ลองใหม่ภายหลัง');
    }
    let digests;
    try { digests = await agencyCodeDigests(agencyCode, env.AGENCY_CODE_HMAC_KEYS); }
    catch { throw new HttpError(503, 'ระบบลงทะเบียนยังไม่พร้อมใช้งาน'); }
    if (!digests.length || !await repository.consumeAuthAttempt('invite_redeem_agency', digests[0].digest, nowMs, 15 * 60_000, 10)) {
      throw new HttpError(429, 'ลองใหม่ภายหลัง');
    }
    const profile = await verifyLineIdToken(body.idToken, env);
    const lineKey = await sha256Hex(profile.sub);
    if (!await repository.consumeAuthAttempt('invite_redeem_line', lineKey, nowMs, 15 * 60_000, 10)) {
      throw new HttpError(429, 'ลองใหม่ภายหลัง');
    }
    const sessionToken = [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const user = await repository.redeemInvitation({
      lineId: profile.sub,
      digests,
      tokenHash: await sha256Hex(invitationToken),
      now: new Date(nowMs).toISOString(),
      sessionHash: await sha256Hex(sessionToken),
      sessionExpiresAt: nowMs + 7 * 86_400_000,
    });
    return json({ token: sessionToken, user, redirectTo: landingForRole(user.role) }, 200, { 'Cache-Control': 'no-store' });
  }
  if (request.method === 'POST' && pathname === '/api/login') {
    const body = await requestBody(request);
    const nowMs = Date.now();
    const ipKey = await sha256Hex(trustedClientAddress(request));
    if (!await repository.consumeAuthAttempt('line_login_ip', ipKey, nowMs, 60_000, 30)) throw new HttpError(429, 'ลองใหม่ภายหลัง');
    const profile = await verifyLineIdToken(body.idToken, env);
    if (!await repository.consumeAuthAttempt('line_login_line', await sha256Hex(profile.sub), nowMs, 15 * 60_000, 20)) throw new HttpError(429, 'ลองใหม่ภายหลัง');
    const user = await repository.findUserByLineId(profile.sub);
    if (!user) throw new HttpError(403, 'ต้องลงทะเบียนบัญชีก่อน', 'REGISTRATION_REQUIRED');
    if (user.status !== 'active') throw new HttpError(403, 'บัญชีไม่พร้อมใช้งาน');
    return json({ token: await createSession(repository, user.id), user, redirectTo: landingForRole(user.role) }, 200, { 'Cache-Control': 'no-store' });
  }
  if (request.method === 'POST' && pathname === '/api/auth/admin/password-login') {
    if (env.ENVIRONMENT !== 'local' || !isLoopbackHost(url.hostname)) {
      throw new HttpError(503, 'Admin password login ไม่พร้อมใช้งานบน Workers Free Tier', 'ADMIN_PASSWORD_LOGIN_UNAVAILABLE');
    }
    const body = await requestBody(request);
    const password = typeof body.password === 'string' ? body.password : '';
    let digests;
    try { digests = await agencyCodeDigests(body.agencyCode, env.AGENCY_CODE_HMAC_KEYS); }
    catch { throw new HttpError(503, 'ระบบเข้าสู่ระบบยังไม่พร้อมใช้งาน'); }
    if (!digests.length || !password) throw new HttpError(401, 'รหัสประจำตัวหรือรหัสผ่านไม่ถูกต้อง');
    if (!await repository.consumeAuthAttempt('admin_password_login', digests[0].digest, Date.now(), 15 * 60_000, 5)) throw new HttpError(429, 'ลองใหม่ภายหลัง');
    const row = await repository.findAdminCredential(digests.map(item => item.digest));
    if (!row || row.role !== 'admin' || row.status !== 'active' || !verifyAdminPassword(password, row)) throw new HttpError(401, 'รหัสประจำตัวหรือรหัสผ่านไม่ถูกต้อง');
    const token = [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const primary = digests[0];
    await repository.createAdminLoginSession(row, primary, await sha256Hex(token), Date.now() + 7 * 86_400_000);
    const user = await repository.first('SELECT * FROM users WHERE id=?', row.id);
    return json({ token, user, redirectTo: 'invites' }, 200, { 'Cache-Control': 'no-store' });
  }

  const readOnlyRoutes = new Set([
    '/api/me', '/api/plots', '/api/activities', '/api/approvals', '/api/lots', '/api/risks', '/api/reviews', '/api/ics/farmers',
    '/api/checklists', '/api/corrective-actions', '/api/audit-logs',
    '/api/admin/users', '/api/admin/assignments', '/api/admin/invites', '/api/admin/unlinked-farmers', '/api/admin/unlinked-users',
  ]);
  const plotPatch = request.method === 'PATCH' ? pathname.match(/^\/api\/plots\/([^/]+)$/) : null;
  const approvalPatch = request.method === 'PATCH' ? pathname.match(/^\/api\/approvals\/([^/]+)$/) : null;
  const checklistPatch = request.method === 'PATCH' ? pathname.match(/^\/api\/checklists\/([^/]+)$/) : null;
  const correctiveActionPatch = request.method === 'PATCH' ? pathname.match(/^\/api\/corrective-actions\/([^/]+)$/) : null;
  const evidenceContentMatch = request.method === 'GET' ? pathname.match(/^\/api\/evidence\/([^/]+)\/content$/) : null;
  const evidenceMetaMatch = request.method === 'GET' && !evidenceContentMatch ? pathname.match(/^\/api\/evidence\/([^/]+)$/) : null;
  const userStatusPatch = request.method === 'PATCH' ? pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/) : null;
  const assignmentEndPatch = request.method === 'PATCH' ? pathname.match(/^\/api\/admin\/assignments\/([^/]+)\/end$/) : null;
  const inviteRevokePatch = request.method === 'PATCH' ? pathname.match(/^\/api\/admin\/invites\/([^/]+)\/revoke$/) : null;
  const postRoutes = new Set(['/api/logout','/api/plots','/api/activities','/api/approvals','/api/lots','/api/reviews','/api/checklists','/api/corrective-actions','/api/evidence','/api/admin/users','/api/admin/assignments','/api/admin/invites']);
  const known = (request.method === 'GET' && readOnlyRoutes.has(pathname)) ||
    (request.method === 'POST' && postRoutes.has(pathname)) || plotPatch || approvalPatch || checklistPatch || correctiveActionPatch || evidenceContentMatch || evidenceMetaMatch || userStatusPatch || assignmentEndPatch || inviteRevokePatch;
  if (!known) return json({ error: 'ไม่พบ API' }, 404);

  const authentication = await authenticate(request, repository);
  if (authentication.response) return authentication.response;
  const user = authentication.user;

  if (request.method === 'POST' && pathname === '/api/logout') {
    await repository.deleteSession(authentication.sessionHash);
    return json({ ok: true }, 200, { 'Cache-Control': 'no-store' });
  }

  if (request.method === 'POST' && pathname === '/api/plots') {
    const denied = requireRole(user, 'farmer', 'เฉพาะเกษตรกร');
    if (denied) return denied;
    const body = await requestBody(request);
    const id = await repository.createPlot(user.id, text(body.name, 'ชื่อแปลง', 100), text(body.crop, 'พืชที่ปลูก', 100), optionalText(body.area, 'พื้นที่', 200));
    return json({ id }, 201);
  }
  if (plotPatch) {
    const denied = requireRole(user, 'farmer', 'เฉพาะเกษตรกร');
    if (denied) return denied;
    const plot = await ownPlot(repository, user, plotPatch[1]);
    const body = await requestBody(request);
    const allowed = new Set(['name','crop','area']);
    if (Object.keys(body).some(key => !allowed.has(key))) throw new HttpError(400, 'มีข้อมูลที่ไม่อนุญาตให้แก้ไข');
    for (const key of Object.keys(body)) if (typeof body[key] !== 'string') throw new HttpError(400, `${key} ต้องเป็นข้อความ`);
    const fields = {};
    if (Object.hasOwn(body, 'name')) fields.name = text(body.name, 'ชื่อแปลง', 100);
    if (Object.hasOwn(body, 'crop')) fields.crop = text(body.crop, 'พืชที่ปลูก', 100);
    if (Object.hasOwn(body, 'area')) fields.area = optionalText(body.area, 'พื้นที่', 200);
    if (!Object.keys(fields).length) throw new HttpError(400, 'ไม่มีข้อมูลสำหรับแก้ไข');
    return json(await repository.updatePlot(plot.id, user.id, fields));
  }
  if (request.method === 'POST' && pathname === '/api/activities') {
    const denied = requireRole(user, 'farmer', 'เฉพาะเกษตรกร');
    if (denied) return denied;
    const body = await requestBody(request);
    const plot = await ownPlot(repository, user, body.plot_id);
    const evidenceId = await validatePendingEvidenceForEntity(repository, user, body.evidence_id, plot.id, 'activity');
    const id = await repository.createActivity(plot.id, user.id, text(body.kind, 'กิจกรรม', 100), text(body.details, 'รายละเอียด', 2000), isoDate(body.activity_date, 'วันที่ทำกิจกรรม'), photoUrl(body.photo_url));
    if (evidenceId !== null) await repository.attachPhotoEvidence(evidenceId, user.id, plot.id, 'activity', id);
    return json({ id, ...(evidenceId !== null ? { evidence_id: evidenceId } : {}) }, 201);
  }
  if (request.method === 'POST' && pathname === '/api/evidence') {
    const plotId = positiveId(url.searchParams.get('plot_id'), 'รหัสแปลง');
    const entityType = url.searchParams.get('entity_type') || 'activity';
    if (!['activity', 'review'].includes(entityType)) throw new HttpError(400, 'ประเภทหลักฐานไม่ถูกต้อง');
    if (entityType === 'activity') {
      const denied = requireRole(user, 'farmer', 'เฉพาะเกษตรกร');
      if (denied) return denied;
    } else {
      const denied = requireRole(user, 'ics', 'เฉพาะเจ้าหน้าที่ ICS');
      if (denied) return denied;
    }
    const plot = await ownPlot(repository, user, plotId);
    const rawEntityId = url.searchParams.get('entity_id');
    const entityId = rawEntityId !== null && rawEntityId !== '' ? positiveId(rawEntityId, 'รหัสรายการ') : null;
    if (entityId !== null) {
      const targetRecord = entityType === 'activity'
        ? await repository.findActivity(entityId)
        : await repository.findReview(entityId);
      if (!targetRecord) throw new HttpError(404, 'ไม่พบรายการอ้างอิง');
      if (targetRecord.plot_id !== plot.id) throw new HttpError(403, 'ไม่มีสิทธิ์แนบภาพหลักฐานข้ามแปลง');
    }
    const storage = createEvidenceStorage(env);
    if (!storage.configured) {
      throw new HttpError(503, 'ระบบจัดเก็บภาพหลักฐานยังไม่ได้เชื่อมต่อ Cloudflare R2', 'EVIDENCE_STORAGE_UNAVAILABLE');
    }
    const headerLength = Number(request.headers.get('content-length') || 0);
    if (headerLength > MAX_EVIDENCE_BYTES) throw new HttpError(413, 'ไฟล์ภาพมีขนาดใหญ่เกิน 5 MB');
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.byteLength) throw new HttpError(400, 'ไม่พบข้อมูลไฟล์ภาพ');
    if (bytes.byteLength > MAX_EVIDENCE_BYTES) throw new HttpError(413, 'ไฟล์ภาพมีขนาดใหญ่เกิน 5 MB');
    const detectedType = detectImageContentType(bytes);
    if (!detectedType) throw new HttpError(415, 'รองรับเฉพาะไฟล์ภาพ JPEG, PNG หรือ WebP เท่านั้น');

    const fileHash = await sha256Hex(bytes);
    const objectKey = buildEvidenceObjectKey(entityType, plot.id, detectedType, randomHexBytes(16));
    await storage.put(objectKey, bytes, detectedType, {
      plotId: String(plot.id),
      entityType,
      uploadedBy: String(user.id),
    });
    let created;
    try {
      created = await repository.createPhotoEvidence({
        ownerUserId: plot.owner_id,
        uploadedBy: user.id,
        plotId: plot.id,
        entityType,
        entityId,
        objectKey,
        contentType: detectedType,
        sizeBytes: bytes.byteLength,
        sha256Hex: fileHash,
        storageBackend: storage.backend,
      });
    } catch (err) {
      await storage.delete(objectKey).catch(() => {});
      throw err;
    }
    return json({
      id: created.id,
      plot_id: plot.id,
      entity_type: entityType,
      entity_id: entityId,
      content_type: detectedType,
      size_bytes: bytes.byteLength,
      sha256_hex: fileHash,
      storage_backend: storage.backend,
      content_url: `/api/evidence/${created.id}/content`,
    }, 201, { 'Cache-Control': 'no-store' });
  }
  if (evidenceContentMatch) {
    const id = positiveId(evidenceContentMatch[1], 'รหัสภาพหลักฐาน');
    const evidence = await repository.findPhotoEvidence(id);
    if (!evidence) throw new HttpError(404, 'ไม่พบภาพหลักฐาน');
    await authorizeEvidenceAccess(repository, user, evidence);
    const obj = await createEvidenceStorage(env).get(evidence.object_key);
    if (!obj) throw new HttpError(404, 'ไม่พบไฟล์ภาพหลักฐานในคลังจัดเก็บ');
    return new Response(obj.body, {
      status: 200,
      headers: {
        'Content-Type': evidence.content_type,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Content-Disposition': `inline; filename="evidence-${evidence.id}.${extensionForContentType(evidence.content_type)}"`,
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  }
  if (evidenceMetaMatch) {
    const id = positiveId(evidenceMetaMatch[1], 'รหัสภาพหลักฐาน');
    const evidence = await repository.findPhotoEvidence(id);
    if (!evidence) throw new HttpError(404, 'ไม่พบภาพหลักฐาน');
    await authorizeEvidenceAccess(repository, user, evidence);
    return json({
      id: evidence.id,
      plot_id: evidence.plot_id,
      entity_type: evidence.entity_type,
      entity_id: evidence.entity_id,
      content_type: evidence.content_type,
      size_bytes: evidence.size_bytes,
      sha256_hex: evidence.sha256_hex,
      storage_backend: evidence.storage_backend,
      created_at: evidence.created_at,
      content_url: `/api/evidence/${evidence.id}/content`,
    }, 200, { 'Cache-Control': 'private, no-store' });
  }
  if (request.method === 'POST' && pathname === '/api/approvals') {
    const denied = requireRole(user, 'farmer', 'เฉพาะเกษตรกร');
    if (denied) return denied;
    const body = await requestBody(request);
    const plot = await ownPlot(repository, user, body.plot_id);
    const inputName = text(body.input_name, 'ชื่อปัจจัยการผลิต', 200);
    const details = text(body.details, 'รายละเอียด', 2000);
    const id = await repository.createApproval(plot.id, user.id, inputName, details);
    const notifyTask = notifyInputApprovalSubmitted({
      db: env.DB,
      approvalId: id,
      farmerId: user.id,
      plotId: plot.id,
      inputName,
      details,
      liffId: env.LIFF_ID,
      channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
      channelId: env.LINE_MESSAGING_CHANNEL_ID || env.LINE_CHANNEL_ID,
      channelSecret: env.LINE_MESSAGING_CHANNEL_SECRET || env.LINE_CHANNEL_SECRET,
      fetchImpl: fetch
    }).catch(err => console.error('Worker submit approval notification error:', err));
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(notifyTask);
    return json({ id }, 201);
  }
  if (approvalPatch) {
    const denied = requireRole(user, 'ics', 'เฉพาะเจ้าหน้าที่ ICS');
    if (denied) return denied;
    const id = positiveId(approvalPatch[1]);
    const approval = await repository.findApproval(id);
    if (!approval) throw new HttpError(404, 'ไม่พบคำขอ');
    await ownPlot(repository, user, approval.plot_id);
    const body = await requestBody(request);
    const status = body.status;
    const comment = optionalText(body.comment, 'ความเห็น', 1000);
    if (!['approved','rejected'].includes(status)) throw new HttpError(400, 'สถานะไม่ถูกต้อง');
    if (status === 'rejected' && !comment) throw new HttpError(400, 'กรุณาระบุเหตุผลกรณีไม่อนุมัติ');
    if (await repository.reviewApproval(id, user.id, status, comment) !== 1) throw new HttpError(404, 'รายการนี้ถูกพิจารณาแล้วหรือไม่พบ');
    const notifyTask = notifyApprovalDecided({
      db: env.DB,
      approvalId: id,
      status,
      comment,
      reviewerId: user.id,
      liffId: env.LIFF_ID,
      channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
      channelId: env.LINE_MESSAGING_CHANNEL_ID || env.LINE_CHANNEL_ID,
      channelSecret: env.LINE_MESSAGING_CHANNEL_SECRET || env.LINE_CHANNEL_SECRET,
      fetchImpl: fetch
    }).catch(err => console.error('Worker review approval notification error:', err));
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(notifyTask);
    return json({ ok: true });
  }
  if (request.method === 'POST' && pathname === '/api/lots') {
    const denied = requireRole(user, 'farmer', 'เฉพาะเกษตรกร');
    if (denied) return denied;
    const body = await requestBody(request);
    const plot = await ownPlot(repository, user, body.plot_id);
    const quantity = Number(body.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) throw new HttpError(400, 'ปริมาณไม่ถูกต้อง');
    const id = await repository.createLot(plot.id, text(body.code, 'รหัสล็อต', 100), text(body.crop, 'ชนิดผลผลิต', 100), isoDate(body.harvest_date, 'วันที่เก็บเกี่ยว'), quantity);
    return json({ id }, 201);
  }
  if (request.method === 'POST' && pathname === '/api/reviews') {
    const denied = requireRole(user, 'ics', 'เฉพาะเจ้าหน้าที่ ICS');
    if (denied) return denied;
    const body = await requestBody(request);
    const plot = await ownPlot(repository, user, body.plot_id);
    const evidenceId = await validatePendingEvidenceForEntity(repository, user, body.evidence_id, plot.id, 'review');

    let standardCode = standardCodeValue(body.standard_code, null);
    let checklistId = null;
    if (body.checklist_id !== undefined && body.checklist_id !== null && String(body.checklist_id).trim() !== '') {
      checklistId = positiveId(body.checklist_id, 'รหัสชุดรายการตรวจ');
      const checklist = await repository.findChecklist(checklistId);
      if (!checklist || !checklist.is_active) throw new HttpError(404, 'ไม่พบชุดรายการตรวจที่ใช้งานได้');
      if (standardCode && checklist.standard_code !== standardCode) {
        throw new HttpError(400, 'ชุดรายการตรวจไม่ตรงกับมาตรฐานที่เลือก');
      }
      standardCode = checklist.standard_code;
    }

    const checklistResults = validateChecklistResults(body.checklist_results);
    const defaultStd = standardCode || 'PGS';
    const findings = validateReviewFindings(body.findings, defaultStd, user.id);
    for (const item of findings) {
      if (item.responsibleUserId !== user.id && !await repository.findActiveIcsUser(item.responsibleUserId)) {
        throw new HttpError(400, 'ผู้รับผิดชอบต้องเป็นเจ้าหน้าที่ ICS ที่ใช้งานอยู่');
      }
    }

    const created = await repository.createReview(
      plot.id,
      user.id,
      text(body.result, 'ผลตรวจ', 100),
      text(body.note, 'บันทึกผลตรวจ', 2000),
      { standardCode, checklistId, checklistResults, findings }
    );
    if (evidenceId !== null) await repository.attachPhotoEvidence(evidenceId, user.id, plot.id, 'review', created.id);
    return json({
      id: created.id,
      ...(evidenceId !== null ? { evidence_id: evidenceId } : {}),
      ...(standardCode ? { standard_code: standardCode } : {}),
      ...(created.correctiveActionIds.length ? { corrective_action_ids: created.correctiveActionIds } : {}),
    }, 201);
  }
  if (request.method === 'POST' && pathname === '/api/notifications/remind-overdue') {
    if (!['ics', 'admin'].includes(user.role)) return json({ error: 'เฉพาะเจ้าหน้าที่ ICS หรือผู้ดูแลระบบ' }, 403);
    const results = await scanAndNotifyRhythmOverdue({
      db: env.DB,
      liffId: env.LIFF_ID,
      channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
      channelId: env.LINE_MESSAGING_CHANNEL_ID || env.LINE_CHANNEL_ID,
      channelSecret: env.LINE_MESSAGING_CHANNEL_SECRET || env.LINE_CHANNEL_SECRET,
      fetchImpl: fetch
    });
    return json({ ok: true, sent: results.length, details: results });
  }
  if (request.method === 'POST' && pathname === '/api/checklists') {
    if (!['ics', 'admin'].includes(user.role)) return json({ error: 'เฉพาะเจ้าหน้าที่ ICS หรือผู้ดูแลระบบ' }, 403);
    const body = await requestBody(request);
    const standardCode = standardCodeValue(body.standard_code, null);
    if (!standardCode) throw new HttpError(400, 'กรุณาระบุรหัสมาตรฐาน (PGS, EU_ORGANIC หรือ FAIRTRADE)');
    const title = text(body.title, 'ชื่อชุดรายการตรวจ', 200);
    const description = optionalText(body.description, 'คำอธิบายชุดรายการตรวจ', 1000);
    const items = validateChecklistItems(body.items);
    const validationStatus = body.validation_status ? String(body.validation_status).trim() : 'draft_unvalidated';
    if (!ALLOWED_VALIDATION_STATUSES.has(validationStatus)) throw new HttpError(400, 'สถานะการยืนยันเกณฑ์ไม่ถูกต้อง');
    if (validationStatus === 'validated' && user.role !== 'admin') {
      throw new HttpError(403, 'เฉพาะผู้ดูแลระบบสามารถยืนยันสถานะเกณฑ์มาตรฐานได้');
    }
    const created = await repository.createChecklist({ actorId: user.id, standardCode, title, description, items, validationStatus });
    return json(created, 201);
  }
  if (checklistPatch) {
    if (!['ics', 'admin'].includes(user.role)) return json({ error: 'เฉพาะเจ้าหน้าที่ ICS หรือผู้ดูแลระบบ' }, 403);
    const id = positiveId(checklistPatch[1], 'รหัสชุดรายการตรวจ');
    const existing = await repository.findChecklist(id);
    if (!existing) throw new HttpError(404, 'ไม่พบชุดรายการตรวจ');
    const body = await requestBody(request);
    const allowed = new Set(['title', 'description', 'items', 'is_active', 'validation_status']);
    if (Object.keys(body).some(key => !allowed.has(key))) throw new HttpError(400, 'มีข้อมูลที่ไม่อนุญาตให้แก้ไข');
    const updates = {};
    if (Object.hasOwn(body, 'title')) updates.title = text(body.title, 'ชื่อชุดรายการตรวจ', 200);
    if (Object.hasOwn(body, 'description')) updates.description = optionalText(body.description, 'คำอธิบายชุดรายการตรวจ', 1000);
    if (Object.hasOwn(body, 'items')) updates.items = validateChecklistItems(body.items);
    if (Object.hasOwn(body, 'is_active')) updates.is_active = Boolean(body.is_active);
    if (Object.hasOwn(body, 'validation_status')) {
      const nextValidation = String(body.validation_status).trim();
      if (!ALLOWED_VALIDATION_STATUSES.has(nextValidation)) throw new HttpError(400, 'สถานะการยืนยันเกณฑ์ไม่ถูกต้อง');
      if (nextValidation === 'validated' && user.role !== 'admin') {
        throw new HttpError(403, 'เฉพาะผู้ดูแลระบบสามารถยืนยันสถานะเกณฑ์มาตรฐานได้');
      }
      updates.validation_status = nextValidation;
    }
    if (!Object.keys(updates).length) throw new HttpError(400, 'ไม่มีข้อมูลสำหรับแก้ไข');
    return json(await repository.updateChecklist(id, user.id, updates));
  }
  if (request.method === 'POST' && pathname === '/api/corrective-actions') {
    const denied = requireRole(user, 'ics', 'เฉพาะเจ้าหน้าที่ ICS');
    if (denied) return denied;
    const body = await requestBody(request);
    const plot = await ownPlot(repository, user, body.plot_id);
    let reviewId = null;
    if (body.review_id !== undefined && body.review_id !== null && String(body.review_id).trim() !== '') {
      reviewId = positiveId(body.review_id, 'รหัสผลตรวจ');
      const review = await repository.findReview(reviewId);
      if (!review) throw new HttpError(404, 'ไม่พบผลตรวจอ้างอิง');
      if (review.plot_id !== plot.id) throw new HttpError(400, 'ผลตรวจอ้างอิงไม่ตรงกับแปลงที่เลือก');
    }
    const standardCode = standardCodeValue(body.standard_code, 'PGS');
    const severity = severityValue(body.severity, 'medium');
    const finding = text(body.finding, 'ข้อบกพร่องที่พบ', 1000);
    const actionRequired = text(body.action_required, 'แนวทางแก้ไข', 1000);
    const dueDate = isoDate(body.due_date, 'กำหนดแก้ไข');
    const responsibleUserId = body.responsible_user_id !== undefined && body.responsible_user_id !== null && String(body.responsible_user_id).trim() !== ''
      ? positiveId(body.responsible_user_id, 'รหัสผู้รับผิดชอบ')
      : user.id;
    if (responsibleUserId !== user.id && !await repository.findActiveIcsUser(responsibleUserId)) {
      throw new HttpError(400, 'ผู้รับผิดชอบต้องเป็นเจ้าหน้าที่ ICS ที่ใช้งานอยู่');
    }
    const created = await repository.createCorrectiveAction({
      plotId: plot.id, reviewId, standardCode, severity, finding, actionRequired, responsibleUserId, dueDate, createdBy: user.id,
    });
    return json(created, 201);
  }
  if (correctiveActionPatch) {
    const denied = requireRole(user, 'ics', 'เฉพาะเจ้าหน้าที่ ICS');
    if (denied) return denied;
    const id = positiveId(correctiveActionPatch[1], 'รหัสรายการแก้ไข');
    const existing = await repository.findCorrectiveAction(id);
    if (!existing) throw new HttpError(404, 'ไม่พบรายการแก้ไขปรับปรุง');
    await ownPlot(repository, user, existing.plot_id);
    const body = await requestBody(request);
    const allowed = new Set(['status', 'resolution_note', 'due_date', 'severity', 'responsible_user_id', 'finding', 'action_required']);
    if (Object.keys(body).some(key => !allowed.has(key))) throw new HttpError(400, 'มีข้อมูลที่ไม่อนุญาตให้แก้ไข');
    const updates = {};
    if (Object.hasOwn(body, 'status')) {
      const nextStatus = String(body.status || '').trim();
      if (!ALLOWED_CAPA_STATUSES.has(nextStatus)) throw new HttpError(400, 'สถานะการแก้ไขไม่ถูกต้อง');
      updates.status = nextStatus;
    }
    if (Object.hasOwn(body, 'resolution_note')) updates.resolution_note = optionalText(body.resolution_note, 'สรุปผลการแก้ไข', 1000);
    if (Object.hasOwn(body, 'due_date')) updates.due_date = isoDate(body.due_date, 'กำหนดแก้ไข');
    if (Object.hasOwn(body, 'severity')) updates.severity = severityValue(body.severity);
    if (Object.hasOwn(body, 'finding')) updates.finding = text(body.finding, 'ข้อบกพร่องที่พบ', 1000);
    if (Object.hasOwn(body, 'action_required')) updates.action_required = text(body.action_required, 'แนวทางแก้ไข', 1000);
    if (Object.hasOwn(body, 'responsible_user_id')) {
      const nextResponsible = positiveId(body.responsible_user_id, 'รหัสผู้รับผิดชอบ');
      if (!await repository.findActiveIcsUser(nextResponsible)) {
        throw new HttpError(400, 'ผู้รับผิดชอบต้องเป็นเจ้าหน้าที่ ICS ที่ใช้งานอยู่');
      }
      updates.responsible_user_id = nextResponsible;
    }
    if (!Object.keys(updates).length) throw new HttpError(400, 'ไม่มีข้อมูลสำหรับแก้ไข');
    const effectiveStatus = updates.status ?? existing.status;
    const effectiveNote = updates.resolution_note ?? existing.resolution_note ?? '';
    if (effectiveStatus === 'resolved' && !String(effectiveNote).trim()) {
      throw new HttpError(400, 'กรุณาระบุสรุปผลการแก้ไขก่อนปิดรายการ');
    }
    return json(await repository.updateCorrectiveAction(id, user.id, existing, updates));
  }

  if (request.method === 'POST' && pathname === '/api/admin/users') {
    const denied = requireRole(user, 'admin', 'เฉพาะผู้ดูแลระบบ');
    if (denied) return denied;
    const body = await requestBody(request);
    const name = text(body.name, 'ชื่อ', 100);
    if (!['farmer','ics'].includes(body.role)) throw new HttpError(400, 'สร้างได้เฉพาะ Farmer หรือ ICS');
    const agencyCode = text(body.agencyCode, 'รหัสประจำตัว', 32);
    const credential = await agencyCredential(agencyCode, env.AGENCY_CODE_HMAC_KEYS);
    if (!credential) throw new HttpError(400, 'รูปแบบรหัสประจำตัวไม่ถูกต้อง');
    const id = await repository.createAdminManagedUser(user.id, name, body.role, credential);
    return json({ id }, 201);
  }
  if (userStatusPatch) {
    const denied = requireRole(user, 'admin', 'เฉพาะผู้ดูแลระบบ');
    if (denied) return denied;
    const id = positiveId(userStatusPatch[1]);
    const body = await requestBody(request);
    if (!['active','disabled'].includes(body.status)) throw new HttpError(400, 'สถานะไม่ถูกต้อง');
    const target = await repository.findManagedUser(id);
    if (!target) throw new HttpError(404, 'ไม่พบบัญชีที่จัดการได้');
    await repository.updateManagedUserStatus(user.id, target, body.status);
    return json({ ok: true });
  }
  if (request.method === 'POST' && pathname === '/api/admin/assignments') {
    const denied = requireRole(user, 'admin', 'เฉพาะผู้ดูแลระบบ');
    if (denied) return denied;
    const body = await requestBody(request);
    const icsUserId = positiveId(body.icsUserId, 'รหัส ICS');
    const farmerUserId = positiveId(body.farmerUserId, 'รหัส Farmer');
    return json({ id: await repository.createAssignment(user.id, icsUserId, farmerUserId) }, 201);
  }
  if (assignmentEndPatch) {
    const denied = requireRole(user, 'admin', 'เฉพาะผู้ดูแลระบบ');
    if (denied) return denied;
    await repository.endAssignment(user.id, positiveId(assignmentEndPatch[1]));
    return json({ ok: true });
  }
  if (request.method === 'POST' && pathname === '/api/admin/invites') {
    const denied = requireRole(user, 'admin', 'เฉพาะผู้ดูแลระบบ');
    if (denied) return denied;
    const body = await requestBody(request);
    const targetUserId = positiveId(body.targetUserId, 'รหัสผู้ใช้เป้าหมาย');
    const target = await repository.findInvitationTarget(targetUserId);
    if (!target || !['farmer','ics'].includes(target.role) || target.status !== 'unlinked' || target.line_id !== null) throw new HttpError(409, 'บัญชีเป้าหมายไม่พร้อมรับคำเชิญ');
    const invitationToken = randomToken();
    const tokenHash = await sha256Hex(invitationToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60_000).toISOString();
    const id = await repository.createInvitation(user.id, targetUserId, tokenHash, now.toISOString(), expiresAt);
    return json({ id, targetUserId, invitationToken, expiresAt }, 201, { 'Cache-Control': 'no-store' });
  }
  if (inviteRevokePatch) {
    const denied = requireRole(user, 'admin', 'เฉพาะผู้ดูแลระบบ');
    if (denied) return denied;
    await repository.revokeInvitation(user.id, positiveId(inviteRevokePatch[1], 'รหัสคำเชิญ'), new Date().toISOString());
    return json({ ok: true });
  }

  if (pathname === '/api/me') return json(user, 200, { 'Cache-Control': 'no-store' });
  if (pathname === '/api/plots') return json(await repository.listPlots(user));
  if (pathname === '/api/activities') return json(await repository.listActivities(user));
  if (pathname === '/api/approvals') return json(await repository.listApprovals(user));
  if (pathname === '/api/lots') return json(await repository.listLots(user));

  if (pathname === '/api/risks') {
    const denied = requireRole(user, 'ics', 'เฉพาะเจ้าหน้าที่ ICS');
    return denied || json(await repository.listRisks(user.id));
  }
  if (pathname === '/api/reviews') {
    return json(await repository.listReviews(user));
  }
  if (pathname === '/api/ics/farmers') {
    const denied = requireRole(user, 'ics', 'เฉพาะเจ้าหน้าที่ ICS');
    return denied || json(await repository.listIcsFarmers(user.id));
  }
  if (pathname === '/api/checklists') {
    if (!['ics', 'admin'].includes(user.role)) return json({ error: 'เฉพาะเจ้าหน้าที่ ICS หรือผู้ดูแลระบบ' }, 403);
    const standardCode = standardCodeValue(url.searchParams.get('standard_code'), null);
    const includeInactive = ['1', 'true'].includes(url.searchParams.get('include_inactive'));
    return json(await repository.listChecklists({ standardCode, includeInactive }));
  }
  if (pathname === '/api/corrective-actions') {
    if (!['ics', 'admin'].includes(user.role)) return json({ error: 'เฉพาะเจ้าหน้าที่ ICS หรือผู้ดูแลระบบ' }, 403);
    const rawStatus = url.searchParams.get('status');
    let status = null;
    if (rawStatus !== null && rawStatus !== '') {
      if (!ALLOWED_CAPA_STATUSES.has(rawStatus)) throw new HttpError(400, 'สถานะการแก้ไขไม่ถูกต้อง');
      status = rawStatus;
    }
    const rawPlotId = url.searchParams.get('plot_id');
    const plotId = rawPlotId !== null && rawPlotId !== '' ? positiveId(rawPlotId, 'รหัสแปลง') : null;
    const standardCode = standardCodeValue(url.searchParams.get('standard_code'), null);
    return json(await repository.listCorrectiveActions(user, { status, plotId, standardCode }));
  }
  if (pathname === '/api/audit-logs') {
    if (!['ics', 'admin'].includes(user.role)) return json({ error: 'เฉพาะเจ้าหน้าที่ ICS หรือผู้ดูแลระบบ' }, 403);
    return json(await repository.listAuditLogs(user), 200, { 'Cache-Control': 'private, no-store' });
  }

  if (pathname.startsWith('/api/admin/')) {
    const denied = requireRole(user, 'admin', 'เฉพาะผู้ดูแลระบบ');
    if (denied) return denied;
    if (pathname === '/api/admin/users') return json(await repository.listAdminUsers());
    if (pathname === '/api/admin/assignments') return json(await repository.listAssignments());
    if (pathname === '/api/admin/invites') return json(await repository.listInvites(new Date().toISOString()), 200, { 'Cache-Control': 'no-store' });
    if (pathname === '/api/admin/unlinked-farmers') return json(await repository.listUnlinkedFarmers(), 200, { 'Cache-Control': 'no-store' });
    if (pathname === '/api/admin/unlinked-users') return json(await repository.listUnlinkedUsers(), 200, { 'Cache-Control': 'no-store' });
  }

  return json({ error: 'ไม่พบ API' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const noStore = ['/api/login','/api/auth/admin/password-login','/api/auth/register/invite','/api/logout','/api/me'].includes(url.pathname);
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env, ctx);
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status === 404 && request.method === 'GET' && !url.pathname.includes('.')) {
        const indexRequest = new Request(new URL('/index.html', request.url), request);
        return await env.ASSETS.fetch(indexRequest);
      }
      if (url.pathname === '/sw.js') {
        const newHeaders = new Headers(assetResponse.headers);
        newHeaders.set('Service-Worker-Allowed', '/');
        newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        return new Response(assetResponse.body, {
          status: assetResponse.status,
          statusText: assetResponse.statusText,
          headers: newHeaders
        });
      }
      return assetResponse;
    } catch (error) {
      if (error?.expose && Number.isInteger(error.status)) return json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status, noStore ? { 'Cache-Control': 'no-store' } : {});
      if (/UNIQUE constraint failed/i.test(String(error?.message))) return json({ error: 'ข้อมูลนี้มีอยู่แล้ว' }, 409, noStore ? { 'Cache-Control': 'no-store' } : {});
      console.error('Worker request failed', { name: error?.name });
      return json({ error: 'เกิดข้อผิดพลาดภายในระบบ' }, 500, noStore ? { 'Cache-Control': 'no-store' } : {});
    }
  },
  async scheduled(event, env, ctx) {
    const scanTask = scanAndNotifyRhythmOverdue({
      db: env.DB,
      liffId: env.LIFF_ID,
      channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
      channelId: env.LINE_MESSAGING_CHANNEL_ID || env.LINE_CHANNEL_ID,
      channelSecret: env.LINE_MESSAGING_CHANNEL_SECRET || env.LINE_CHANNEL_SECRET,
      fetchImpl: fetch
    }).catch(err => console.error('Scheduled rhythm overdue scan error:', err));
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(scanTask);
  }
};
