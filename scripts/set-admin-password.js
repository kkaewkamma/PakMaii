import Database from 'better-sqlite3';
import path from 'node:path';
import 'dotenv/config';
import { agencyCodeDigests, loadAgencyKeyRing } from '../lib/agency-code.js';
import { hashPassword } from '../lib/password.js';

const agencyCode = String(process.argv[2] || '').trim();
if (!agencyCode) throw new Error('Usage: npm run admin:password -- ADMIN-001');

function readPassword(prompt) {
  if (!process.stdin.isTTY) return new Promise(resolve => { let value = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', chunk => { value += chunk; }); process.stdin.on('end', () => resolve(value.replace(/\r?\n$/, ''))); });
  return new Promise(resolve => {
    process.stdout.write(prompt);
    process.stdin.resume();
    process.stdin.setRawMode(true);
    let value = '';
    const onData = chunk => {
      const key = chunk.toString();
      if (key === '\r' || key === '\n') {
        process.stdin.setRawMode(false); process.stdin.off('data', onData); process.stdin.pause(); process.stdout.write('\n'); resolve(value);
      } else if (key === '\u0003') process.exit(130);
      else if (key === '\u007f' || key === '\b') value = value.slice(0, -1);
      else value += key;
    };
    process.stdin.on('data', onData);
  });
}

const password = await readPassword('New admin password: ');
const confirmation = process.stdin.isTTY ? await readPassword('Confirm password: ') : password;
if (password !== confirmation) throw new Error('Password confirmation does not match');
const keyRing = loadAgencyKeyRing();
const digests = agencyCodeDigests(agencyCode, keyRing);
const db = new Database(path.resolve(process.env.DB_PATH || 'farm.db'), { fileMustExist: true });
db.pragma('foreign_keys = ON');
try {
  if (!db.prepare('SELECT 1 FROM schema_migrations WHERE version=2').get()) throw new Error('Migration version 2 is required');
  const placeholders = digests.map(() => '?').join(',');
  const user = db.prepare(`SELECT u.* FROM users u JOIN agency_credentials c ON c.user_id=u.id WHERE c.code_digest IN (${placeholders})`).get(...digests.map(item => item.digest));
  if (!user || user.role !== 'admin') throw new Error('Admin agency identity not found');
  const credential = hashPassword(password);
  db.prepare(`INSERT INTO admin_password_credentials(user_id,algorithm,salt,password_hash,parameters_json)
    VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET algorithm=excluded.algorithm,salt=excluded.salt,password_hash=excluded.password_hash,parameters_json=excluded.parameters_json,updated_at=CURRENT_TIMESTAMP`)
    .run(user.id, credential.algorithm, credential.salt, credential.passwordHash, credential.parametersJson);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
  console.log(`Admin password updated for ${agencyCode}; existing sessions revoked.`);
} finally {
  db.close();
}
