import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const localKeyFile = path.resolve('.local-secrets/agency-hmac.json');

export function normalizeAgencyCode(value) {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

function parseEnvironmentKeyRing(raw) {
  if (!raw) return [];
  return raw.split(',').map(item => {
    const separator = item.indexOf(':');
    if (separator < 1) throw new Error('Invalid AGENCY_CODE_HMAC_KEYS format');
    const version = item.slice(0, separator).trim();
    const encodedKey = item.slice(separator + 1).trim();
    const key = Buffer.from(encodedKey, 'base64url');
    if (!/^[A-Za-z0-9._-]{1,32}$/.test(version) || key.length < 32) throw new Error('Invalid agency HMAC key configuration');
    return { version, key };
  });
}

export function loadAgencyKeyRing({ allowDevelopmentFile = process.env.NODE_ENV === 'development' } = {}) {
  const configured = parseEnvironmentKeyRing(process.env.AGENCY_CODE_HMAC_KEYS);
  if (configured.length) return configured;
  if (!allowDevelopmentFile || !fs.existsSync(localKeyFile)) throw new Error('Agency HMAC key ring is not configured');
  const local = JSON.parse(fs.readFileSync(localKeyFile, 'utf8'));
  const key = Buffer.from(local.key, 'base64url');
  if (local.version !== 'dev-v1' || key.length !== 32) throw new Error('Invalid local development agency key');
  return [{ version: local.version, key }];
}

export function ensureDevelopmentKeyFile() {
  if (process.env.NODE_ENV !== 'development') throw new Error('Development agency key may only be created in development');
  if (!fs.existsSync(localKeyFile)) {
    fs.mkdirSync(path.dirname(localKeyFile), { recursive: true });
    fs.writeFileSync(localKeyFile, JSON.stringify({ version: 'dev-v1', key: crypto.randomBytes(32).toString('base64url') }), { mode: 0o600, flag: 'wx' });
  }
  return localKeyFile;
}

export function agencyCodeDigests(code, keyRing) {
  const normalized = normalizeAgencyCode(code);
  if (!/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(normalized)) return [];
  return keyRing.map(({ version, key }) => ({ version, digest: crypto.createHmac('sha256', key).update(normalized).digest('hex') }));
}

export function invitationTokenHash(token) {
  return crypto.createHash('sha256').update(String(token ?? '')).digest('hex');
}

