import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = path.join(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const operation = process.argv[2];
const common = ['--local', '--persist-to', '.wrangler/state-ready-to-grow'];
const args = operation === 'migrate'
  ? ['d1', 'migrations', 'apply', 'ready-to-grow-local', ...common]
  : operation === 'dev'
    ? ['dev', ...common]
    : null;

if (!args) {
  console.error('Usage: node scripts/wrangler-local.js <migrate|dev>');
  process.exitCode = 2;
} else {
  const child = spawn(process.execPath, [wrangler, ...args], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
      WRANGLER_SEND_METRICS: 'false',
    },
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
}
