import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { AgencyKeyConfigurationError, parseAgencyKeyRing } from '../worker/auth.js';
import { createHiddenInputCollector, describeHiddenInput } from '../scripts/hidden-prompt.js';

const syntheticKey = Buffer.alloc(32, 0x5a).toString('base64url');

test('agency key ring accepts canonical unpadded base64url with at least 32 bytes', () => {
  const parsed = parseAgencyKeyRing(`stg-v1:${syntheticKey}`);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].version, 'stg-v1');
  assert.equal(parsed[0].key.length, 32);
});

test('agency key validation reports safe error categories without echoing input', () => {
  const cases = [
    ['', 'MISSING'],
    [`missing-separator-${syntheticKey}`, 'ENTRY_FORMAT'],
    [`bad version:${syntheticKey}`, 'VERSION_FORMAT'],
    ['stg-v1:not+base64/url=', 'BASE64URL_FORMAT'],
    [`stg-v1:${Buffer.alloc(31, 1).toString('base64url')}`, 'KEY_TOO_SHORT'],
    [`stg-v1:${syntheticKey},stg-v1:${syntheticKey}`, 'DUPLICATE_VERSION'],
  ];
  for (const [value, code] of cases) {
    assert.throws(() => parseAgencyKeyRing(value), error => {
      assert.ok(error instanceof AgencyKeyConfigurationError);
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, new RegExp(syntheticKey));
      return true;
    });
  }
});

test('hidden prompt collector accepts Windows paste and CRLF in one chunk', () => {
  const collector = createHiddenInputCollector();
  const result = collector.push(`stg-v1:${syntheticKey}\r\n`);
  assert.deepEqual(result, { done: true, cancelled: false, value: `stg-v1:${syntheticKey}` });
  assert.equal(parseAgencyKeyRing(result.value)[0].key.length, 32);
});

test('hidden prompt collector accepts bracketed and split Windows paste without logging', () => {
  const collector = createHiddenInputCollector();
  assert.deepEqual(collector.push('\u001b[200~stg-v1:'), { done: false });
  assert.deepEqual(collector.push(`${syntheticKey}\u001b[201~`), { done: false });
  const result = collector.push('\r');
  assert.equal(result.done, true);
  assert.equal(result.cancelled, false);
  assert.equal(parseAgencyKeyRing(result.value)[0].key.length, 32);
});

test('hidden prompt metadata does not reveal its value', () => {
  assert.deepEqual(describeHiddenInput(`stg-v1:${syntheticKey}`), {
    length: 50,
    colonCount: 1,
    controlCharacterCount: 0,
  });
});

test('real hidden prompt subprocess preserves Windows paste exactly', async () => {
  const childScript = path.resolve('scripts/hidden-prompt-fixture.js');
  const expectedLength = `stg-v1:${syntheticKey}`.length;
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [childScript], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => resolve({ code, stdout, stderr }));
    child.stdin.write('\u001b[200~');
    child.stdin.write('stg-v1:');
    child.stdin.write(syntheticKey);
    child.stdin.end('\u001b[201~\r\n');
  });
  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(result.stdout, new RegExp(syntheticKey));
  const jsonLine = result.stdout.trim().split(/\r?\n/).at(-1);
  assert.deepEqual(JSON.parse(jsonLine), {
    length: expectedLength,
    colonCount: 1,
    controlCharacterCount: 0,
    category: 'OK',
  });
});
