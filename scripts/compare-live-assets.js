// Compare deployed demo static assets byte-for-byte with a git revision.
// Usage: node scripts/compare-live-assets.js [baseUrl] [rev]
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

const base = (process.argv[2] || 'https://ready-to-grow-demo.readytogrow-app.workers.dev').replace(/\/$/, '');
const rev = process.argv[3] || 'HEAD';
const files = execFileSync('git', ['ls-tree', '-r', '--name-only', rev, 'public']).toString().trim().split('\n')
  .filter(f => !f.includes('/fonts/') && !f.endsWith('_headers'));
const h = b => crypto.createHash('sha256').update(b).digest('hex').slice(0, 12);
const norm = b => Buffer.from(b.toString('binary').replace(/\r\n/g, '\n'), 'binary');
let match = 0; const mismatch = [];
for (const f of files) {
  const rel = f.slice('public/'.length);
  const url = `${base}/${rel === 'index.html' ? '' : rel}`;
  const local = norm(execFileSync('git', ['show', `${rev}:${f}`]));
  try {
    const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
    const live = norm(Buffer.from(await res.arrayBuffer()));
    if (res.ok && h(live) === h(local)) match++;
    else mismatch.push(`${rel} status=${res.status} live=${h(live)} git=${h(local)}`);
  } catch (e) { mismatch.push(`${rel} error=${e.message}`); }
}
console.log(JSON.stringify({ base, rev, checked: files.length, match, mismatch }, null, 1));
