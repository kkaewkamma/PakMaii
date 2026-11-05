import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { agencyCodeDigests, parseAgencyKeyRing } from '../worker/auth.js';
import { describeHiddenInput, readHiddenInput } from './hidden-prompt.js';
import { removeEmptySecureTempDir, wipeAndRemoveFile } from './secure-temp.js';
import { readAndValidateStagingConfig, resolveInsideProject } from './staging-config.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = path.join(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const [action, location, agencyCode, ...extraArgs] = process.argv.slice(2);
if (!['link','recover','unlink'].includes(action) || !['--local','--remote'].includes(location) || !agencyCode) {
  throw new Error('Usage: npm run worker:admin-line -- <link|recover|unlink> <--local|--remote> <ADMIN-CODE> [--config wrangler.staging.jsonc]');
}
if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('This operator command requires an interactive trusted terminal');

let databaseName = 'ready-to-grow-local';
let configFile = null;
let staging = null;
if (location === '--remote') {
  if (extraArgs.length !== 2 || extraArgs[0] !== '--config') {
    throw new Error('Remote operations require --config wrangler.staging.jsonc');
  }
  configFile = resolveInsideProject(projectRoot, extraArgs[1]);
  staging = readAndValidateStagingConfig(configFile);
  databaseName = staging.database.database_name;
} else if (extraArgs.length) {
  throw new Error('Local operations do not accept remote configuration arguments');
}

const lineChannelId = process.env.LINE_CHANNEL_ID || staging?.config?.vars?.LINE_CHANNEL_ID;
if (!lineChannelId) {
  throw new Error('Set LINE_CHANNEL_ID in the operator environment or supply a valid staging configuration');
}

async function ask(prompt) {
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  try { return (await terminal.question(prompt)).trim(); } finally { terminal.close(); }
}

const operatorRef = await ask('Operator reference (ticket/name): ');
const reason = await ask('Reason: ');
if (operatorRef.length < 3 || operatorRef.length > 100 || reason.length < 5 || reason.length > 500) {
  throw new Error('Operator reference or reason length is invalid');
}

let hmacSecret = process.env.AGENCY_CODE_HMAC_KEYS || '';
if (!hmacSecret) {
  hmacSecret = await readHiddenInput({ prompt: 'AGENCY_CODE_HMAC_KEYS (hidden, read once): ' });
}
try {
  parseAgencyKeyRing(hmacSecret);
} catch (error) {
  const metadata = describeHiddenInput(hmacSecret);
  hmacSecret = '';
  const code = typeof error?.code === 'string' ? error.code : 'INVALID';
  throw new Error(`Agency HMAC key rejected: ${code} (input length=${metadata.length}, colons=${metadata.colonCount}, controls=${metadata.controlCharacterCount}).`);
}

let lineId = null;
if (action !== 'unlink') {
  const idToken = await readHiddenInput({ prompt: 'LINE ID token (hidden): ' });
  if (!idToken || idToken.length > 4096) throw new Error('LINE ID token is invalid');
  const response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: lineChannelId }),
  });
  const profile = await response.json().catch(() => ({}));
  if (!response.ok || typeof profile.sub !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(profile.sub)) {
    throw new Error('LINE token verification failed');
  }
  lineId = profile.sub;
  const fingerprint = crypto.createHash('sha256').update(lineId).digest('hex').slice(0, 12);
  process.stdout.write(`Verified LINE identity fingerprint: ${fingerprint}\n`);
}

const confirmationPhrase = `${location === '--remote' ? `REMOTE ${databaseName} ` : ''}${action.toUpperCase()} ${agencyCode.toUpperCase()}`;
if (await ask(`Type "${confirmationPhrase}" to continue: `) !== confirmationPhrase) throw new Error('Confirmation did not match');

const digests = await agencyCodeDigests(agencyCode, hmacSecret);
hmacSecret = '';
if (!digests.length) throw new Error('Agency code format is invalid');
const sqlText = value => value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const digestList = digests.map(item => sqlText(item.digest)).join(',');
const sql = `INSERT INTO admin_identity_operations(action,target_user_id,requested_line_id,operator_ref,reason)
VALUES(${sqlText(action)},COALESCE((SELECT u.id FROM users u JOIN agency_credentials c ON c.user_id=u.id
WHERE u.role='admin' AND c.code_digest IN (${digestList}) LIMIT 1),0),${sqlText(lineId)},${sqlText(operatorRef)},${sqlText(reason)});`;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtg-admin-line-'));
const sqlFile = path.join(tempDir, 'operation.sql');
fs.writeFileSync(sqlFile, sql, { encoding: 'utf8', mode: 0o600 });
try {
  const args = [wrangler, 'd1', 'execute', databaseName, location, '--file', sqlFile];
  if (location === '--local') args.push('--persist-to', '.wrangler/state-ready-to-grow');
  if (configFile) args.push('--config', configFile);
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env, AGENCY_CODE_HMAC_KEYS: undefined, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', WRANGLER_SEND_METRICS: 'false' },
    });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
  if (exitCode !== 0) throw new Error('D1 rejected the admin identity operation');
  process.stdout.write(`Admin LINE ${action} completed; all existing sessions for the account were revoked.\n`);
} finally {
  hmacSecret = '';
  wipeAndRemoveFile(sqlFile);
  removeEmptySecureTempDir(tempDir, 'rtg-admin-line-');
}
