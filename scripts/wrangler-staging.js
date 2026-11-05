import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAndValidateStagingConfig, resolveInsideProject } from './staging-config.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = path.join(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const operation = process.argv[2];
const configFile = resolveInsideProject(projectRoot, process.argv[3] || 'wrangler.staging.jsonc');
const { database } = readAndValidateStagingConfig(configFile);
const configArgs = ['--config', configFile];
const args = operation === 'dry-run'
  ? ['deploy', '--dry-run', ...configArgs]
  : operation === 'migrate-remote'
    ? ['d1', 'migrations', 'apply', database.database_name, '--remote', ...configArgs]
    : null;
if (!args) throw new Error('Usage: node scripts/wrangler-staging.js <dry-run|migrate-remote> [wrangler.staging.jsonc]');
if (operation === 'migrate-remote' && process.env.RTG_STAGING_CHANGE_APPROVED !== 'YES') {
  throw new Error('Remote migration is locked; set RTG_STAGING_CHANGE_APPROVED=YES only inside the approved maintenance window');
}
const child = spawn(process.execPath, [wrangler, ...args], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: { ...process.env, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', WRANGLER_SEND_METRICS: 'false' },
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
