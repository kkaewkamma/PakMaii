/**
 * Ready to Grow — Public Demo Worker Entrypoint
 *
 * Security Invariants:
 * - NO D1 binding or database access (cannot read or write production/staging data).
 * - NO Secrets (no HMAC keys, no passwords, no tokens).
 * - NO Admin APIs or authentication endpoints (/api/admin/*, /api/login, /api/auth/* are blocked).
 * - Serves ONLY static assets via ASSETS and minimal public endpoints:
 *   - GET /api/health -> { ok: true, service: 'ready-to-grow-demo' }
 *   - GET /api/config -> { liffId: env.LIFF_ID || '', development: false, demoOnly: true }
 * - All other /api/* requests return 404/403 with no-store.
 */

const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'no-referrer',
};

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...jsonHeaders, ...securityHeaders, ...extraHeaders },
  });
}

export async function handleDemoApi(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === 'GET' && pathname === '/api/health') {
    return json({ ok: true, service: 'ready-to-grow-demo' });
  }

  if (request.method === 'GET' && pathname === '/api/config') {
    return json({
      liffId: env?.LIFF_ID || '',
      development: false,
      demoOnly: true,
    });
  }

  // All other /api/* routes are explicitly blocked in Public Demo
  const isAdmin = pathname.startsWith('/api/admin/') || pathname.startsWith('/api/auth/');
  return json(
    { error: 'API ไม่พร้อมใช้งานในโหมด Public Demo' },
    isAdmin ? 403 : 404,
    { 'Cache-Control': 'no-store' }
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) {
        return await handleDemoApi(request, env);
      }
      return env.ASSETS.fetch(request);
    } catch {
      return json({ error: 'เกิดข้อผิดพลาดภายในระบบ' }, 500, { 'Cache-Control': 'no-store' });
    }
  },
};
