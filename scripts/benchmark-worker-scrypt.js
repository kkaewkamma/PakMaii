import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = path.join(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const port = 8792;
const child = spawn(process.execPath, [wrangler, 'dev', '--local', '--config', 'wrangler.scrypt-benchmark.jsonc', '--port', String(port)], {
  cwd: projectRoot,
  stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', WRANGLER_SEND_METRICS: 'false' },
});

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/benchmark/scrypt`, { method: 'POST' });
      if (response.ok) { ready = true; break; }
    } catch {}
    await delay(250);
  }
  if (!ready) throw new Error('Wrangler benchmark Worker did not start');
  const samplesMs = [];
  for (let sample = 0; sample < 5; sample += 1) {
    const response = await fetch(`http://127.0.0.1:${port}/benchmark/scrypt`, { method: 'POST' });
    if (!response.ok) throw new Error(`Benchmark request failed: ${response.status}`);
    samplesMs.push((await response.json()).elapsedMs);
  }
  const averageMs = samplesMs.reduce((total, value) => total + value, 0) / samplesMs.length;
  console.log(JSON.stringify({ samplesMs, averageMs, minimumMs: Math.min(...samplesMs), maximumMs: Math.max(...samplesMs) }));
} finally {
  child.kill();
}
