import fs from 'node:fs/promises';
import path from 'node:path';
import {
  MAX_EVIDENCE_BYTES,
  ALLOWED_IMAGE_TYPES,
  detectImageContentType,
  extensionForContentType,
  buildEvidenceObjectKey,
} from '../worker/storage.js';

export {
  MAX_EVIDENCE_BYTES,
  ALLOWED_IMAGE_TYPES,
  detectImageContentType,
  extensionForContentType,
  buildEvidenceObjectKey,
};

function resolveSafeKey(rootDir, objectKey) {
  const cleanKey = String(objectKey || '').replace(/\\/g, '/');
  if (!cleanKey || cleanKey.startsWith('/') || cleanKey.includes('\0') || cleanKey.split('/').some(seg => seg === '..' || seg === '.')) {
    const err = new Error('เส้นทางไฟล์หลักฐานไม่ถูกต้อง');
    err.status = 400;
    throw err;
  }
  const target = path.resolve(rootDir, cleanKey);
  const prefix = rootDir.endsWith(path.sep) ? rootDir : `${rootDir}${path.sep}`;
  if (!target.startsWith(prefix)) {
    const err = new Error('เส้นทางไฟล์หลักฐานไม่ถูกต้อง');
    err.status = 400;
    throw err;
  }
  return target;
}

/**
 * Private local filesystem evidence store for Express + SQLite development/testing.
 * Stored outside public/ so files cannot be accessed without authenticated RBAC endpoints.
 */
export function createLocalEvidenceStorage(baseDir = path.resolve('data', 'evidence')) {
  const rootDir = path.resolve(baseDir);
  return {
    configured: true,
    backend: 'local',
    rootDir,
    async put(key, bytes) {
      const target = resolveSafeKey(rootDir, key);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, bytes);
    },
    async get(key) {
      const target = resolveSafeKey(rootDir, key);
      try {
        const buf = await fs.readFile(target);
        return { body: buf, size: buf.byteLength };
      } catch (err) {
        if (err?.code === 'ENOENT') return null;
        throw err;
      }
    },
    async delete(key) {
      const target = resolveSafeKey(rootDir, key);
      await fs.rm(target, { force: true });
    },
  };
}
