import { agencyCodeDigests, normalizeAgencyCode } from '../worker/auth.js';

const sqlText = value => `'${String(value).replaceAll("'", "''")}'`;

export async function buildStagingSeed(manifest, keyRing) {
  if (!manifest || !Array.isArray(manifest.users) || manifest.users.length < 3) throw new Error('Manifest must contain staging users');
  const seenIds = new Set();
  const seenCodes = new Set();
  const users = [];
  for (const item of manifest.users) {
    const code = normalizeAgencyCode(item.agencyCode);
    if (!Number.isSafeInteger(item.id) || item.id < 1 || seenIds.has(item.id)) throw new Error('Every staging user needs a unique positive integer id');
    if (!['farmer', 'ics', 'admin'].includes(item.role) || typeof item.name !== 'string' || item.name.trim().length < 2) throw new Error('Invalid staging identity');
    if (seenCodes.has(code)) throw new Error('Agency codes must be unique');
    if ('password' in item || 'lineId' in item || 'token' in item) throw new Error('Credentials and LINE identities are forbidden in the seed manifest');
    const [primary] = await agencyCodeDigests(code, keyRing);
    if (!primary) throw new Error('Invalid agency code');
    seenIds.add(item.id);
    seenCodes.add(code);
    users.push({ ...item, name: item.name.trim(), code, primary });
  }
  for (const role of ['farmer', 'ics', 'admin']) if (!users.some(item => item.role === role)) throw new Error(`Manifest requires a ${role}`);
  if (users.filter(item => item.role === 'admin').length !== 1) throw new Error('Staging seed requires exactly one first Admin');

  const lines = ['-- Generated staging-only seed. Contains hashes, never plaintext agency codes.', 'PRAGMA foreign_keys=ON;'];
  for (const user of users) {
    lines.push(`INSERT INTO users(id,line_id,name,role,status,linked_at) VALUES(${user.id},NULL,${sqlText(user.name)},${sqlText(user.role)},'unlinked',NULL);`);
    lines.push(`INSERT INTO agency_credentials(user_id,key_version,code_digest,code_hint) VALUES(${user.id},${sqlText(user.primary.version)},${sqlText(user.primary.digest)},${sqlText(user.code.slice(-4))});`);
  }
  for (const farmer of users.filter(item => item.role === 'farmer' && item.assignedTo)) {
    const icsCode = normalizeAgencyCode(farmer.assignedTo);
    const officer = users.find(item => item.role === 'ics' && item.code === icsCode);
    const admin = users.find(item => item.role === 'admin');
    if (!officer) throw new Error(`Unknown ICS assignment for user id ${farmer.id}`);
    lines.push(`INSERT INTO farmer_assignments(ics_user_id,farmer_user_id,assigned_by) VALUES(${officer.id},${farmer.id},${admin.id});`);
  }
  lines.push('SELECT role,status,COUNT(*) AS count FROM users GROUP BY role,status;');
  return `${lines.join('\n')}\n`;
}
