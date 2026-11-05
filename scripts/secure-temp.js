import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function wipeAndRemoveFile(filename) {
  try {
    if (!fs.existsSync(filename)) return;
    const stat = fs.statSync(filename);
    if (!stat.isFile()) throw new Error('Secure cleanup target is not a file');
    if (stat.size > 0) fs.writeFileSync(filename, Buffer.alloc(stat.size), { flag: 'r+' });
    fs.rmSync(filename, { force: true });
  } catch (error) {
    if (fs.existsSync(filename) && fs.statSync(filename).isFile()) fs.rmSync(filename, { force: true });
    throw error;
  }
}

export function removeEmptySecureTempDir(directory, prefix = 'rtg-staging-hmac-sync-') {
  const resolved = path.resolve(directory);
  const tempRoot = path.resolve(os.tmpdir());
  if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith(prefix)) {
    throw new Error('Refusing to remove a directory outside the expected secure temp scope');
  }
  fs.rmdirSync(resolved);
}
