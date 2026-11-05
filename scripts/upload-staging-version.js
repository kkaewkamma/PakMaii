import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseAgencyKeyRing } from '../worker/auth.js';
import { describeHiddenInput, readHiddenInput } from './hidden-prompt.js';
import { readAndValidateStagingConfig, resolveInsideProject } from './staging-config.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = path.join(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const configFile = resolveInsideProject(projectRoot, process.argv[2] || 'wrangler.staging.jsonc');
readAndValidateStagingConfig(configFile);
if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('A trusted interactive terminal is required');

const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
let approvalRef;
try {
  approvalRef = (await terminal.question('Approved change/ticket reference: ')).trim();
} finally {
  terminal.close();
}
if (approvalRef.length < 3 || approvalRef.length > 100) throw new Error('Approval reference is invalid');
let secret = await readHiddenInput({ prompt: 'AGENCY_CODE_HMAC_KEYS (hidden): ' });
try {
  parseAgencyKeyRing(secret);
} catch (error) {
  const metadata = describeHiddenInput(secret);
  secret = '';
  const code = typeof error?.code === 'string' ? error.code : 'INVALID';
  throw new Error(
    `Agency HMAC key rejected: ${code} ` +
    `(input length=${metadata.length}, colons=${metadata.colonCount}, controls=${metadata.controlCharacterCount}). ` +
    'Expected version:unpadded-base64url with at least 32 decoded bytes.',
  );
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtg-staging-version-'));
const secretsFile = path.join(tempDir, 'secrets.json');
try {
  fs.writeFileSync(secretsFile, JSON.stringify({ AGENCY_CODE_HMAC_KEYS: secret }), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  secret = '';
  const args = [
    wrangler, 'versions', 'upload', '--config', configFile, '--strict',
    '--tag', 'staging-candidate', '--message', `Approved staging candidate: ${approvalRef}`,
    '--secrets-file', secretsFile,
  ];
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', WRANGLER_SEND_METRICS: 'false' },
    });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
  if (exitCode !== 0) throw new Error('Staging version upload failed');
  process.stdout.write('Candidate version uploaded but not deployed. Record the Version ID for the deployment approval gate.\n');
} finally {
  secret = '';
  fs.rmSync(secretsFile, { force: true });
  fs.rmdirSync(tempDir);
}
