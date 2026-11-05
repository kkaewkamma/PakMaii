import fs from 'node:fs';
import path from 'node:path';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER = /^[A-Za-z0-9_-]{3,100}$/;
const WORKER_NAME = /^(?!-)[a-z0-9-]{3,63}(?<!-)$/;

export function validateStagingOptions(options) {
  const required = ['databaseId', 'databaseName', 'workerName', 'liffId', 'lineChannelId'];
  for (const key of required) {
    if (!options[key] || typeof options[key] !== 'string') throw new Error(`Missing --${key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`);
  }
  if (!UUID.test(options.databaseId) || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(options.databaseId)) {
    throw new Error('database-id must be a real non-zero D1 UUID returned by Cloudflare');
  }
  if (!IDENTIFIER.test(options.databaseName) || !options.databaseName.toLowerCase().includes('staging')) {
    throw new Error('database-name must be an explicit staging name');
  }
  if (!WORKER_NAME.test(options.workerName) || !options.workerName.includes('staging')) {
    throw new Error('worker-name must be an explicit staging name');
  }
  if (!/^[0-9]{6,32}$/.test(options.lineChannelId)) throw new Error('line-channel-id format is invalid');
  if (!/^[0-9]{6,32}-[A-Za-z0-9]{4,64}$/.test(options.liffId)) throw new Error('liff-id format is invalid');
  return options;
}

export function buildStagingConfig(options) {
  validateStagingOptions(options);
  return {
    $schema: 'node_modules/wrangler/config-schema.json',
    name: options.workerName,
    main: 'worker/index.js',
    compatibility_date: '2025-10-11',
    compatibility_flags: ['nodejs_compat'],
    workers_dev: true,
    preview_urls: false,
    assets: {
      directory: './public',
      binding: 'ASSETS',
      run_worker_first: ['/api/*'],
    },
    d1_databases: [{
      binding: 'DB',
      database_name: options.databaseName,
      database_id: options.databaseId,
      migrations_dir: 'd1/migrations',
    }],
    vars: {
      ENVIRONMENT: 'staging',
      LIFF_ID: options.liffId,
      LINE_CHANNEL_ID: options.lineChannelId,
    },
  };
}

export function readAndValidateStagingConfig(filename) {
  const config = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const database = config.d1_databases?.find(item => item.binding === 'DB');
  validateStagingOptions({
    databaseId: database?.database_id,
    databaseName: database?.database_name,
    workerName: config.name,
    liffId: config.vars?.LIFF_ID,
    lineChannelId: config.vars?.LINE_CHANNEL_ID,
  });
  if (config.vars?.ENVIRONMENT !== 'staging') throw new Error('ENVIRONMENT must equal staging');
  if (config.main !== 'worker/index.js') throw new Error('Unexpected Worker entrypoint');
  if (config.assets?.binding !== 'ASSETS' || !config.assets?.run_worker_first?.includes('/api/*')) {
    throw new Error('Static Assets/API routing is incomplete');
  }
  return { config, database };
}

export function resolveInsideProject(projectRoot, filename) {
  const resolved = path.resolve(projectRoot, filename);
  if (path.dirname(resolved) !== projectRoot) throw new Error('Output/config must be in the project root');
  return resolved;
}
