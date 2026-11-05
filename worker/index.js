import { D1Repository } from './repository/d1.js';
import { agencyCodeDigests, verifyAdminPassword } from './auth.js';

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}

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
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

const text = (value, field, max = 500) => {
  if (value === undefined || value === null || String(value).trim() === '') throw new HttpError(400, `กรุณากรอก ${field}`);
  const clean = String(value).trim();
  if (clean.length > max) throw new HttpError(400, `${field} ยาวเกินกำหนด`);
  return clean;
};
const optionalText = (value, field, max = 500) => value === undefined || value === null || String(value).trim() === '' ? '' : text(value, field, max);
const positiveId = (value, field = 'รหัส') => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, `${field} ไม่ถูกต้อง`);
  return id;
};
const isoDate = (value, field) => {
  const date = text(value, field, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new HttpError(400, `${field} ไม่ถูกต้อง`);
  return date;
};
const photoUrl = value => {
  if (!value) return null;
  let parsed;
  try { parsed = new URL(String(value)); } catch { throw new HttpError(400, 'ลิงก์รูปภาพไม่ถูกต้อง'); }
  if (parsed.protocol !== 'https:') throw new HttpError(400, 'ลิงก์รูปภาพต้องเป็น HTTPS');
  return parsed.toString();
};

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

const landingForRole = role => ({ farmer: 'home', ics: 'risks', admin: 'invites' })[role];
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

export async function handleApi(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === 'GET' && pathname === '/api/health') return json({ ok: true, service: 'ready-to-grow' });
  if (request.method === 'GET' && pathname === '/api/config') {
    return json({ liffId: env.LIFF_ID || '', development: false });
  }

  const repository = new D1Repository(env.DB);
  if (request.method === 'POST' && pathname === '/api/webhook/line') {
    const body = await requestBody(request);
    const events = Array.isArray(body?.events) ? body.events : [];
    return json({
      ok: true,
      service: 'PakMaii LINE Webhook',
      received_events: events.length,
      processed: events.map(evt => ({
        type: evt.type || 'message',
        source: evt.source?.userId ? 'line_user' : 'simulator',
        status: 'mapped_to_activity_log'
      })),
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
    '/api/me', '/api/plots', '/api/activities', '/api/approvals', '/api/lots', '/api/risks', '/api/reviews',
    '/api/admin/users', '/api/admin/assignments', '/api/admin/invites', '/api/admin/unlinked-farmers', '/api/admin/unlinked-users',
  ]);
  const plotPatch = request.method === 'PATCH' ? pathname.match(/^\/api\/plots\/([^/]+)$/) : null;
  const approvalPatch = request.method === 'PATCH' ? pathname.match(/^\/api\/approvals\/([^/]+)$/) : null;
  const userStatusPatch = request.method === 'PATCH' ? pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/) : null;
  const assignmentEndPatch = request.method === 'PATCH' ? pathname.match(/^\/api\/admin\/assignments\/([^/]+)\/end$/) : null;
  const inviteRevokePatch = request.method === 'PATCH' ? pathname.match(/^\/api\/admin\/invites\/([^/]+)\/revoke$/) : null;
  const postRoutes = new Set(['/api/logout','/api/plots','/api/activities','/api/approvals','/api/lots','/api/reviews','/api/admin/users','/api/admin/assignments','/api/admin/invites']);
  const known = (request.method === 'GET' && readOnlyRoutes.has(pathname)) ||
    (request.method === 'POST' && postRoutes.has(pathname)) || plotPatch || approvalPatch || userStatusPatch || assignmentEndPatch || inviteRevokePatch;
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
    const id = await repository.createActivity(plot.id, user.id, text(body.kind, 'กิจกรรม', 100), text(body.details, 'รายละเอียด', 2000), isoDate(body.activity_date, 'วันที่ทำกิจกรรม'), photoUrl(body.photo_url));
    return json({ id }, 201);
  }
  if (request.method === 'POST' && pathname === '/api/approvals') {
    const denied = requireRole(user, 'farmer', 'เฉพาะเกษตรกร');
    if (denied) return denied;
    const body = await requestBody(request);
    const plot = await ownPlot(repository, user, body.plot_id);
    const id = await repository.createApproval(plot.id, user.id, text(body.input_name, 'ชื่อปัจจัยการผลิต', 200), text(body.details, 'รายละเอียด', 2000));
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
    if (await repository.reviewApproval(id, user.id, status, comment) !== 1) throw new HttpError(404, 'รายการนี้ถูกพิจารณาแล้วหรือไม่พบ');
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
    const id = await repository.createReview(plot.id, user.id, text(body.result, 'ผลตรวจ', 100), text(body.note, 'บันทึกผลตรวจ', 2000));
    return json({ id }, 201);
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
    const denied = requireRole(user, 'ics', 'เฉพาะเจ้าหน้าที่ ICS');
    return denied || json(await repository.listReviews(user.id));
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
  async fetch(request, env) {
    const url = new URL(request.url);
    const noStore = ['/api/login','/api/auth/admin/password-login','/api/auth/register/invite','/api/logout','/api/me'].includes(url.pathname);
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env);
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (error?.expose && Number.isInteger(error.status)) return json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status, noStore ? { 'Cache-Control': 'no-store' } : {});
      if (/UNIQUE constraint failed/i.test(String(error?.message))) return json({ error: 'ข้อมูลนี้มีอยู่แล้ว' }, 409, noStore ? { 'Cache-Control': 'no-store' } : {});
      console.error('Worker request failed', { name: error?.name });
      return json({ error: 'เกิดข้อผิดพลาดภายในระบบ' }, 500, noStore ? { 'Cache-Control': 'no-store' } : {});
    }
  },
};
