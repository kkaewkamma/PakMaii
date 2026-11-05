import crypto from 'node:crypto';

const parameters = Object.freeze({ N: 16384, r: 8, p: 1, keyLength: 64 });

export function validateAdminPassword(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 256) {
    throw new Error('รหัสผ่านต้องมีความยาว 10-256 ตัวอักษร');
  }
}

export function hashPassword(password) {
  validateAdminPassword(password);
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, parameters.keyLength, { N: parameters.N, r: parameters.r, p: parameters.p, maxmem: 64 * 1024 * 1024 });
  return { algorithm: 'scrypt', salt: salt.toString('base64url'), passwordHash: hash.toString('base64url'), parametersJson: JSON.stringify(parameters) };
}

export function verifyPassword(password, credential) {
  if (typeof password !== 'string' || !credential || credential.algorithm !== 'scrypt') return false;
  try {
    const parsed = JSON.parse(credential.parameters_json);
    const expected = Buffer.from(credential.password_hash, 'base64url');
    const actual = crypto.scryptSync(password, Buffer.from(credential.salt, 'base64url'), parsed.keyLength, { N: parsed.N, r: parsed.r, p: parsed.p, maxmem: 64 * 1024 * 1024 });
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

