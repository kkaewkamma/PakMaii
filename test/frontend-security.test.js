import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const headers = fs.readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');

test('frontend has external assets only and CSP allows no inline script or style', () => {
  assert.match(html, /<link rel="stylesheet" href="\/app\.css">/);
  assert.match(html, /<script defer src="\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /<script(?:\s[^>]*)?\>\s*[^<]/i);
  assert.doesNotMatch(html, /<style|\son[a-z]+=|\sstyle\s*=/i);
  assert.doesNotMatch(headers, /unsafe-inline|unsafe-eval/i);
  assert.match(headers, /default-src 'none'/);
  assert.match(headers, /script-src 'self' https:\/\/static\.line-scdn\.net/);
  assert.match(headers, /base-uri 'none'/);
  assert.match(headers, /object-src 'none'/);
});

test('frontend avoids DOM HTML injection sinks and renders API data as text nodes', () => {
  assert.doesNotMatch(script, /\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML|document\.write|\beval\s*\(|new Function/);
  assert.match(script, /document\.createTextNode/);
  assert.match(script, /textContent/);
  assert.match(script, /new URL\(item\.photo_url\)/);
});

test('authentication UI covers required states without persisting invitation secrets', () => {
  for (const message of ['ลงทะเบียนครั้งแรก','รหัสเชิญไม่ถูกต้อง หมดอายุ ถูกเพิกถอน หรือถูกใช้แล้ว','บัญชีถูกปิดหรือยังไม่พร้อมใช้งาน','เซสชันหมดอายุ','ออกจากระบบแล้ว']) {
    assert.ok(script.includes(message), message);
  }
  assert.match(script, /REGISTRATION_REQUIRED/);
  assert.match(script, /\/admin\/unlinked-users/);
  assert.match(script, /roleLabels\[user\.role\]/);
  assert.match(script, /statusLabels\[user\.status\]/);
  assert.doesNotMatch(script, /localStorage/);
  assert.doesNotMatch(script, /sessionStorage\.setItem\([^,]+,\s*(?:lastInvitation|invitation)/);
});

test('logout immediately transitions to login view, prevents auto-login bounce, and clears session', () => {
  assert.match(script, /async function logout\(\)/);
  assert.match(script, /sessionStorage\.removeItem\(['"]token['"]\)/);
  assert.match(script, /sessionStorage\.setItem\(['"]logged_out['"],\s*['"]1['"]\)/);
  assert.match(script, /sessionStorage\.removeItem\(['"]logged_out['"]\)/);
  assert.match(script, /notify\(['"]ออกจากระบบแล้ว['"]\)/);
  // logout now reads cfg from loadConfig(), not the module-level config variable
  assert.match(script, /showLogin\(Boolean\(cfg\?\.development\)\)/);
  assert.doesNotMatch(script, /showState\(['"]ออกจากระบบแล้ว['"]/);
});

test('ensureLiff guards liff.init() exactly once and all LIFF call sites use ensureLiff', () => {
  // ensureLiff and loadConfig helpers must exist
  assert.match(script, /async function ensureLiff\(\)/);
  assert.match(script, /async function loadConfig\(\)/);
  // liff.init is called only inside ensureLiff via liffInitPromise memoization
  assert.match(script, /liffInitPromise \|\|= window\.liff\.init\(\s*\{\s*liffId:\s*cfg\.liffId\s*\}\s*\)/);
  // window.liff.init must appear exactly once in the whole file (inside ensureLiff only)
  assert.equal((script.match(/window\.liff\.init\(/g) || []).length, 1,
    'window.liff.init() must appear exactly once — only inside ensureLiff via liffInitPromise');
  // liff.isLoggedIn and liff.login must NOT be called directly on window.liff
  assert.doesNotMatch(script, /window\.liff\.isLoggedIn\(\)/);
  assert.doesNotMatch(script, /window\.liff\.login\(\)/);
  // ensureLiff is awaited and its result is used for isLoggedIn/login checks
  assert.match(script, /const liff = await ensureLiff\(\)/);
  assert.match(script, /if \(!liff\.isLoggedIn\(\)\) return liff\.login\(\)/);
  // loadConfig validates liffId or development before returning cached config
  assert.match(script, /config\?\.liffId \|\| config\?\.development/);
});
