import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStagingConfig, resolveInsideProject } from './staging-config.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const options = {};
for (let index = 0; index < args.length; index += 2) {
  const key = args[index]?.replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const value = args[index + 1];
  if (!key || !value || !args[index].startsWith('--')) throw new Error('Arguments must be --name value pairs');
  options[key] = value;
}
const output = resolveInsideProject(projectRoot, options.output || 'wrangler.staging.jsonc');
delete options.output;
if (fs.existsSync(output)) throw new Error(`${path.basename(output)} already exists; review and remove it explicitly before regenerating`);
const config = buildStagingConfig(options);
fs.writeFileSync(output, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
process.stdout.write(`Created ${path.basename(output)} with a validated non-placeholder D1 binding.\n`);
