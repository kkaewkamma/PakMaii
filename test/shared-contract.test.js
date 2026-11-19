import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  HttpError,
  ALLOWED_CAPA_STATUSES,
  ALLOWED_VALIDATION_STATUSES,
  landingForRole,
  parseJsonSafe,
  text,
  optionalText,
  positiveId,
  isoDate,
  photoUrl,
  standardCodeValue,
  severityValue,
  validateChecklistItems,
  validateChecklistResults,
  validateReviewFindings,
} from '../shared/validation.js';
import {
  formatChecklistRow,
  formatCorrectiveActionRow,
  formatAuditLogRow,
  formatPendingRisk,
  formatInactiveRisk,
  formatMissingEvidenceRisk,
  formatCorrectiveActionRisk,
  sortRisksBySeverity,
} from '../shared/audit-domain.js';

const serverSource = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const workerSource = fs.readFileSync(new URL('../worker/index.js', import.meta.url), 'utf8');
const repoSource = fs.readFileSync(new URL('../worker/repository/d1.js', import.meta.url), 'utf8');
const headersSource = fs.readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');

test('shared validation helpers enforce types, bounds, and 400 HttpError contracts', () => {
  assert.equal(text('  ข้าวหอม  ', 'พืช', 50), 'ข้าวหอม');
  assert.throws(() => text('   ', 'พืช', 50), err => err instanceof HttpError && err.status === 400 && err.expose === true);
  assert.throws(() => text('x'.repeat(11), 'ชื่อ', 10), err => err instanceof HttpError && err.status === 400);

  assert.equal(optionalText('', 'พื้นที่', 50), '');
  assert.equal(optionalText(' 2 ไร่ ', 'พื้นที่', 50), '2 ไร่');

  assert.equal(positiveId('42'), 42);
  assert.throws(() => positiveId(0), err => err instanceof HttpError && err.status === 400);
  assert.throws(() => positiveId(-5), err => err instanceof HttpError && err.status === 400);

  assert.equal(isoDate('2026-11-20', 'วันที่'), '2026-11-20');
  assert.throws(() => isoDate('2026-13-40', 'วันที่'), err => err instanceof HttpError && err.status === 400);

  assert.equal(photoUrl(''), null);
  assert.equal(photoUrl('https://example.test/img.jpg'), 'https://example.test/img.jpg');
  assert.throws(() => photoUrl('http://example.test/img.jpg'), err => err instanceof HttpError && err.status === 400);
  assert.throws(() => photoUrl('javascript:alert(1)'), err => err instanceof HttpError && err.status === 400);

  assert.equal(landingForRole('farmer'), 'home');
  assert.equal(landingForRole('ics'), 'risks');
  assert.equal(landingForRole('admin'), 'invites');
  assert.deepEqual(parseJsonSafe('{"ok":true}', {}), { ok: true });
  assert.deepEqual(parseJsonSafe('{bad', {}), {});
});

test('shared ICS audit validators keep standards separate and validate checklist/CAPA inputs', () => {
  assert.equal(standardCodeValue('pgs'), 'PGS');
  assert.equal(standardCodeValue('eu_organic'), 'EU_ORGANIC');
  assert.equal(standardCodeValue('FAIRTRADE'), 'FAIRTRADE');
  assert.equal(standardCodeValue('', null), null);
  assert.throws(() => standardCodeValue('UNKNOWN'), err => err instanceof HttpError && err.status === 400);

  assert.equal(severityValue('HIGH'), 'high');
  assert.throws(() => severityValue('critical'), err => err instanceof HttpError && err.status === 400);

  assert.ok(ALLOWED_CAPA_STATUSES.has('resolved'));
  assert.ok(ALLOWED_VALIDATION_STATUSES.has('draft_unvalidated'));

  const items = validateChecklistItems([{ key: 'Buffer Zone!', label: 'ตรวจแนวกันชน', required: true }]);
  assert.deepEqual(items, [{ key: 'buffer_zone_', label: 'ตรวจแนวกันชน', required: true }]);
  assert.throws(() => validateChecklistItems([]), err => err instanceof HttpError && err.status === 400);

  const results = validateChecklistResults([{ key: 'k1', label: 'หัวข้อ 1', status: 'FAIL', note: 'พบปัญหา' }]);
  assert.deepEqual(results, [{ key: 'k1', label: 'หัวข้อ 1', status: 'fail', note: 'พบปัญหา' }]);
  assert.throws(() => validateChecklistResults([{ status: 'invalid' }]), err => err instanceof HttpError && err.status === 400);

  const findings = validateReviewFindings([
    { finding: 'แนวกันชนขาด', action_required: 'ปลูกเพิ่ม', due_date: '2026-12-01' },
  ], 'EU_ORGANIC', 12);
  assert.deepEqual(findings, [{
    standardCode: 'EU_ORGANIC',
    severity: 'medium',
    finding: 'แนวกันชนขาด',
    actionRequired: 'ปลูกเพิ่ม',
    dueDate: '2026-12-01',
    responsibleUserId: 12,
  }]);
});

test('shared audit domain formatters normalize rows and sort risks high -> medium -> low', () => {
  const checklist = formatChecklistRow({
    id: 1,
    standard_code: 'PGS',
    title: 'ชุด PGS',
    description: '',
    items_json: '[{"key":"a","label":"ข้อ 1","required":true}]',
    validation_status: 'draft_unvalidated',
    is_active: 1,
    created_at: '2026-11-20',
    updated_at: '2026-11-20',
  });
  assert.equal(checklist.is_active, true);
  assert.equal(checklist.items.length, 1);

  assert.equal(formatCorrectiveActionRow({ id: 5, is_overdue: 1 }).is_overdue, true);
  assert.deepEqual(formatAuditLogRow({
    id: 9,
    actor_user_id: 2,
    actor_name: null,
    event_type: 'review.created',
    target_type: 'review',
    target_id: '4',
    metadata_json: '{"plotId":1}',
    created_at: '2026-11-20',
  }).metadata, { plotId: 1 });

  const sorted = sortRisksBySeverity([
    formatMissingEvidenceRisk({ id: 1, plot_id: 1, plot_name: 'A', farmer_name: 'F', missing_count: 1 }),
    formatPendingRisk({ id: 2, plot_id: 2, plot_name: 'B', farmer_name: 'F', input_name: 'ปุ๋ยหมัก' }),
    formatInactiveRisk({ id: 3, plot_id: 3, plot_name: 'C', farmer_name: 'F' }),
    formatCorrectiveActionRisk({ id: 4, plot_id: 4, plot_name: 'D', farmer_name: 'F', standard_code: 'PGS', severity: 'low', finding: 'X', due_date: '2026-10-01', is_overdue: 1 }),
  ]);
  assert.deepEqual(sorted.map(r => r.severity), ['high', 'high', 'medium', 'low']);
});

test('dual-runtime structural contract: Express and Worker share domain modules and expose aligned routes', () => {
  assert.match(serverSource, /from '\.\/shared\/validation\.js'/);
  assert.match(serverSource, /from '\.\/shared\/audit-domain\.js'/);
  assert.match(workerSource, /from '\.\.\/shared\/validation\.js'/);
  assert.match(repoSource, /from '\.\.\/\.\.\/shared\/audit-domain\.js'/);

  const sharedEndpoints = [
    '/api/health',
    '/api/config',
    '/api/me',
    '/api/plots',
    '/api/activities',
    '/api/approvals',
    '/api/lots',
    '/api/risks',
    '/api/reviews',
    '/api/evidence',
    '/api/checklists',
    '/api/corrective-actions',
    '/api/audit-logs',
    '/api/admin/users',
    '/api/admin/assignments',
    '/api/admin/invites',
  ];
  for (const endpoint of sharedEndpoints) {
    assert.ok(serverSource.includes(endpoint), `Express server missing ${endpoint}`);
    assert.ok(workerSource.includes(endpoint), `Cloudflare Worker missing ${endpoint}`);
  }

  // Worker must never expose local Express dev login
  assert.ok(serverSource.includes('/api/dev/login'));
  assert.ok(!workerSource.includes('/api/dev/login'));

  // CSP font-src must stay aligned between Cloudflare _headers and Helmet in server.js
  assert.match(headersSource, /font-src 'self' data:/);
  assert.match(serverSource, /fontSrc:\s*\["'self'",\s*'data:'\]/);
});
