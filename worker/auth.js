import { Buffer } from 'node:buffer';
import { scryptSync, timingSafeEqual } from 'node:crypto';

export const ADMIN_SCRYPT_MAXMEM = 64 * 1024 * 1024;

export function normalizeAgencyCode(value) {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

export class AgencyKeyConfigurationError extends Error {
  constructor(code) {
    super(`Agency HMAC key configuration rejected: ${code}`);
    this.name = 'AgencyKeyConfigurationError';
    this.code = code;
  }
}

export function parseAgencyKeyRing(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new AgencyKeyConfigurationError('MISSING');
  const entries = raw.trim().split(',');
  if (entries.length > 8) throw new AgencyKeyConfigurationError('TOO_MANY_KEYS');
  const versions = new Set();
  return entries.map(item => {
    const separator = item.indexOf(':');
    if (separator < 1 || item.indexOf(':', separator + 1) !== -1) throw new AgencyKeyConfigurationError('ENTRY_FORMAT');
    const version = item.slice(0, separator).trim();
    const encodedKey = item.slice(separator + 1).trim();
    if (!/^[A-Za-z0-9._-]{1,32}$/.test(version)) throw new AgencyKeyConfigurationError('VERSION_FORMAT');
    if (versions.has(version)) throw new AgencyKeyConfigurationError('DUPLICATE_VERSION');
    if (!/^[A-Za-z0-9_-]+$/.test(encodedKey)) throw new AgencyKeyConfigurationError('BASE64URL_FORMAT');
    const key = Buffer.from(encodedKey, 'base64url');
    if (key.toString('base64url') !== encodedKey) throw new AgencyKeyConfigurationError('BASE64URL_FORMAT');
    if (key.length < 32) throw new AgencyKeyConfigurationError('KEY_TOO_SHORT');
    versions.add(version);
    return { version, key };
  });
}

export async function agencyCodeDigests(code, rawKeyRing) {
  const normalized = normalizeAgencyCode(code);
  if (!/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(normalized)) return [];
  const encoded = new TextEncoder().encode(normalized);
  const keyRing = parseAgencyKeyRing(rawKeyRing);
  return Promise.all(keyRing.map(async ({ version, key }) => {
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const digest = await crypto.subtle.sign('HMAC', cryptoKey, encoded);
    return { version, digest: Buffer.from(digest).toString('hex') };
  }));
}

export function verifyAdminPassword(password, credential) {
  if (typeof password !== 'string' || !credential || credential.algorithm !== 'scrypt') return false;
  try {
    const parsed = JSON.parse(credential.parameters_json);
    if (!Number.isSafeInteger(parsed.N) || !Number.isSafeInteger(parsed.r) || !Number.isSafeInteger(parsed.p) || !Number.isSafeInteger(parsed.keyLength)) return false;
    const expected = Buffer.from(credential.password_hash, 'base64url');
    const actual = scryptSync(password, Buffer.from(credential.salt, 'base64url'), parsed.keyLength, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      maxmem: ADMIN_SCRYPT_MAXMEM,
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function benchmarkScrypt(parameters = { N: 16384, r: 8, p: 1, keyLength: 64 }) {
  const startedAt = performance.now();
  scryptSync(Buffer.alloc(16, 0x42), Buffer.alloc(16, 0x24), parameters.keyLength, {
    N: parameters.N,
    r: parameters.r,
    p: parameters.p,
    maxmem: ADMIN_SCRYPT_MAXMEM,
  });
  return performance.now() - startedAt;
}
