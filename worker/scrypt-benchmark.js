import { benchmarkScrypt } from './auth.js';

export default {
  fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/benchmark/scrypt') return new Response('Not Found', { status: 404 });
    const elapsedMs = benchmarkScrypt();
    return Response.json({ elapsedMs, parameters: { N: 16384, r: 8, p: 1, keyLength: 64 } }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  },
};
