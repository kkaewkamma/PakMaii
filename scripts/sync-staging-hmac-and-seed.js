import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseAgencyKeyRing } from '../worker/auth.js';
import { describeHiddenInput, readHiddenInput } from './hidden-prompt.js';
import { readAndValidateStagingConfig, resolveInsideProject } from './staging-config.js';
import { buildStagingSeed } from './staging-seed.js';
import { removeEmptySecureTempDir, wipeAndRemoveFile } from './secure-temp.js';
import {
  assertSynchronizationTarget, STAGING_TARGET, synchronizationCommands, validateEmptyPrecheck,
} from './staging-hmac-sync-plan.js';

if (process.env.RTG_STAGING_HMAC_SYNC_APPROVED !== 'YES') {
  throw new Error('HMAC synchronization is locked; explicit approval is required');
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configFile = resolveInsideProject(projectRoot, process.argv[2] || 'wrangler.staging.jsonc');
const manifestFile = path.resolve(projectRoot, process.argv[3] || 'staging-identities.example.json');
const wrangler = path.join(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const { config, database } = readAndValidateStagingConfig(configFile);
assertSynchronizationTarget(config, database);
if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('A trusted interactive terminal is required');

const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
let approvalRef;
try {
  approvalRef = (await terminal.question('Approved HMAC sync + remote seed reference: ')).trim();
} finally {
  terminal.close();
}
if (approvalRef.length < 3 || approvalRef.length > 100) throw new Error('Approval reference is invalid');

let secret = await readHiddenInput({ prompt: 'AGENCY_CODE_HMAC_KEYS (hidden, read once): ' });
try {
  parseAgencyKeyRing(secret);
} catch (error) {
  const metadata = describeHiddenInput(secret);
  secret = '';
  const code = typeof error?.code === 'string' ? error.code : 'INVALID';
  throw new Error(`Agency HMAC key rejected: ${code} (input length=${metadata.length}, colons=${metadata.colonCount}, controls=${metadata.controlCharacterCount}).`);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtg-staging-hmac-sync-'));
const secretsFile = path.join(tempDir, 'secrets.json');
const seedFile = path.join(tempDir, 'seed.sql');
const tag = `hmac-seed-sync-${Date.now()}`;
const commands = synchronizationCommands({ wrangler, configFile, secretsFile, seedFile, tag });

function run(args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: projectRoot,
      stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
      env: { ...process.env, AGENCY_CODE_HMAC_KEYS: undefined, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', WRANGLER_SEND_METRICS: 'false' },
    });
    let stdout = '';
    if (capture) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => { stdout += chunk; });
    }
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve(stdout) : reject(new Error('Operator command failed')));
  });
}

try {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const seedSql = await buildStagingSeed(manifest, secret);
  fs.writeFileSync(secretsFile, JSON.stringify({ AGENCY_CODE_HMAC_KEYS: secret }), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  fs.writeFileSync(seedFile, seedSql, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  secret = '';

  const precheck = JSON.parse(await run(commands.precheck, { capture: true }));
  validateEmptyPrecheck(precheck);
  const bookmark = JSON.parse(await run(commands.bookmark, { capture: true }));
  if (!bookmark.bookmark) throw new Error('Pre-seed Time Travel bookmark was not returned');
  process.stdout.write(`Target verified: ${STAGING_TARGET.databaseName}; pre-seed bookmark=${bookmark.bookmark}.\n`);

  await run(commands.upload);
  const versions = JSON.parse(await run(commands.listVersions, { capture: true }));
  if (!versions.some(version => version.annotations?.['workers/tag'] === tag || version.tag === tag)) {
    throw new Error('Uploaded candidate tag could not be verified; deployment stopped');
  }
  await run(commands.deploy);
  await run(commands.seed);
  await run(commands.verify);
  process.stdout.write(`HMAC synchronization and remote demo seed completed under approval ${approvalRef}.\n`);
} finally {
  secret = '';
  wipeAndRemoveFile(secretsFile);
  wipeAndRemoveFile(seedFile);
  removeEmptySecureTempDir(tempDir);
}
