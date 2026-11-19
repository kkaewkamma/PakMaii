export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function storageUnavailableError() {
  const err = new Error('ระบบจัดเก็บภาพหลักฐานยังไม่ได้เชื่อมต่อ Cloudflare R2');
  err.status = 503;
  err.code = 'EVIDENCE_STORAGE_UNAVAILABLE';
  err.expose = true;
  return err;
}

/**
 * Inspects image magic bytes and returns a normalized MIME type or null.
 * Rejects SVG, HTML, text, or unknown payloads regardless of Content-Type headers.
 */
export function detectImageContentType(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 12) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
    bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A
  ) {
    return 'image/png';
  }
  // WebP: "RIFF".... "WEBP"
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

/** Maps validated image MIME types to safe extensions. */
export function extensionForContentType(contentType) {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'bin';
}

/** Builds a deterministic, user-input-free private object key for evidence objects. */
export function buildEvidenceObjectKey(entityType, plotId, contentType, randomHex, now = new Date()) {
  const ext = extensionForContentType(contentType);
  const dateIso = now.toISOString().slice(0, 10);
  const cleanHex = String(randomHex).replace(/[^a-f0-9]/gi, '').slice(0, 64);
  return `evidence/${entityType}/plot-${plotId}/${dateIso}/${cleanHex}.${ext}`;
}

/**
 * Storage abstraction wrapping Cloudflare R2 (EVIDENCE_BUCKET).
 * Fails closed with 503 EVIDENCE_STORAGE_UNAVAILABLE when unconfigured.
 */
export function createEvidenceStorage(env) {
  const bucket = env?.EVIDENCE_BUCKET || null;
  const configured = Boolean(
    bucket && typeof bucket.put === 'function' && typeof bucket.get === 'function' && typeof bucket.delete === 'function'
  );

  return {
    configured,
    backend: 'r2',
    async put(key, bytes, contentType, customMetadata = {}) {
      if (!configured) throw storageUnavailableError();
      await bucket.put(key, bytes, {
        httpMetadata: { contentType },
        customMetadata,
      });
    },
    async get(key) {
      if (!configured) throw storageUnavailableError();
      return bucket.get(key);
    },
    async delete(key) {
      if (!configured) return;
      await bucket.delete(key);
    },
  };
}
