import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStagingSeed } from './staging-seed.js';
import { resolveInsideProject } from './staging-config.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [manifestArg, outputArg = 'staging-seed.sql'] = process.argv.slice(2);
if (!manifestArg) throw new Error('Usage: node scripts/prepare-staging-seed.js <manifest.json> [staging-seed.sql]');
if (!process.env.AGENCY_CODE_HMAC_KEYS) throw new Error('Set AGENCY_CODE_HMAC_KEYS in the operator environment; .env is not loaded');
const manifestFile = path.resolve(manifestArg);
const outputFile = resolveInsideProject(projectRoot, outputArg);
if (fs.existsSync(outputFile)) throw new Error('Seed output already exists; remove it explicitly before regenerating');
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const sql = await buildStagingSeed(manifest, process.env.AGENCY_CODE_HMAC_KEYS);
fs.writeFileSync(outputFile, sql, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
process.stdout.write(`Created ${path.basename(outputFile)}. Review it with the second operator, apply once, then securely delete it.\n`);
