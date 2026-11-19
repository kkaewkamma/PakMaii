import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const headers = fs.readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/app.css', import.meta.url), 'utf8');

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

test('Phase 0 data integrity: app.js contains no fake fallbacks, hardcoded metrics, or canned certifications', () => {
  // Voice input must not have simulated voice fallback or canned samples
  assert.doesNotMatch(script, /simulateVoiceFallback/);
  assert.doesNotMatch(script, /ฉีดพ่นน้ำหมักสะเดาไล่แมลง/);

  // ICS Dashboard must not have hardcoded fallback literals or canned watchlist array
  assert.doesNotMatch(script, /\?\?\s*65\b/);
  assert.doesNotMatch(script, /\?\?\s*120\b/);
  assert.doesNotMatch(script, /\?\?\s*12\b/);
  assert.doesNotMatch(script, /\?\?\s*86\b/);
  assert.doesNotMatch(script, /Certified EU Organic/);

  // Story Passport must not contain canned certification or fake codes
  assert.doesNotMatch(script, /ผ่านการตรวจประเมิน PGS & ICS ครบถ้วน/);
  assert.doesNotMatch(script, /ปลอดสารเคมีสังเคราะห์ 100%/);
  assert.doesNotMatch(script, /'L-12'/);
  assert.doesNotMatch(script, /แปลง A-03, A-04/);
});

test('Phase 1 design system: IBM Plex Sans Thai, color tokens, and 14-day rhythm track', () => {
  // Self-hosted OFL IBM Plex Sans Thai font-face declarations
  assert.match(css, /@font-face\s*\{[^}]*font-family:\s*['"]IBM Plex Sans Thai['"][^}]*src:\s*url\(['"]\/fonts\/IBMPlexSansThai-400-thai\.woff2['"]\)/);
  assert.match(css, /@font-face\s*\{[^}]*font-family:\s*['"]IBM Plex Sans Thai['"][^}]*src:\s*url\(['"]\/fonts\/IBMPlexSansThai-500-thai\.woff2['"]\)/);
  assert.match(css, /@font-face\s*\{[^}]*font-family:\s*['"]IBM Plex Sans Thai['"][^}]*src:\s*url\(['"]\/fonts\/IBMPlexSansThai-600-thai\.woff2['"]\)/);

  // Design system color tokens
  const requiredTokens = [
    '--green-700: #245C43;',
    '--green-900: #173D2C;',
    '--sage-300:  #A8BDA5;',
    '--sage-50:   #EEF2EC;',
    '--bg:        #F7F8F4;',
    '--surface:   #FFFFFF;',
    '--ink:       #25332B;',
    '--ink-muted: #5E6E64;',
    '--amber-700: #8A5A12;',
    '--red-700:   #A3382E;',
    '--ok-700:    #2F6B3F;'
  ];
  for (const token of requiredTokens) {
    assert.ok(css.includes(token), `app.css must define token ${token}`);
  }

  // Zero linear-gradient in CSS
  assert.doesNotMatch(css, /linear-gradient/);

  // Tabular numbers enabled
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);

  // 14-Day Rhythm Track function exists and implemented
  assert.match(script, /function create14DayRhythmTrack\(plotId,\s*activities\s*=\s*\[\],\s*options\s*=\s*\{\}\)/);
  assert.match(script, /rhythm-track-wrap/);
  assert.match(script, /rhythm-track-row/);
  assert.match(script, /rhythm-cell/);

  // Rhythm track integrated into farmer home (per-plot), watchlist, and lot passport
  assert.match(script, /create14DayRhythmTrack\(plots\[0\]\.id,\s*activities/);
  assert.match(script, /plots\.map\(p\s*=>\s*create14DayRhythmTrack\(p\.id,\s*activities/);
  assert.match(script, /create14DayRhythmTrack\(w\.plot_id,\s*activities,\s*\{\s*compact:\s*true\s*\}\)/);
  assert.match(script, /create14DayRhythmTrack\(lot\.plot_id,\s*activities/);
  assert.match(script, /endDate:\s*lot\.harvest_date/);
  assert.match(script, /a\.kind\s*\|\|\s*a\.activity_type/);

  // Dead synthetic graphics and hardcoded lot certification removed
  assert.doesNotMatch(script, /function createCircularGauge/);
  assert.doesNotMatch(script, /function createDistributionBar/);
  assert.doesNotMatch(script, /function createMilestoneGraphic/);
  assert.doesNotMatch(script, /ผ่านการตรวจรับรอง ICS/);

  // Mobile button rule must not break dock-btn or clip wrapped text
  assert.doesNotMatch(css, /(?:^|[\s;{])height:\s*48px\s*!important/);
  assert.match(css, /button:not\(\.dock-btn\)/);
  assert.match(css, /\.stat-pill\s*\{/);
  assert.match(css, /\.ics-rhythm-summary\s*\{/);
  assert.match(css, /\.ghost\s*\{/);
});

test('Phase 2 shell & navigation: 3-tier responsive shell, 4+More mobile dock, and role-scoped nav', () => {
  // Desktop >=1024px sidebar and max-width 1200px
  assert.match(css, /@media\s*\(min-width:\s*1024px\)/);
  assert.match(css, /max-width:\s*1200px/);
  assert.match(css, /grid-template-columns:\s*240px\s+minmax\(0,\s*1fr\)/);

  // Mobile dock caps primary items at 4 + "เพิ่มเติม" opening openMoreSheet
  assert.match(script, /\.slice\(0,\s*4\)/);
  assert.match(script, /function openMoreSheet\(secondaryItems\)/);
  assert.match(script, /เพิ่มเติม/);
  assert.match(script, /['"]aria-modal['"]:\s*['"]true['"]/);
  assert.match(css, /\.more-sheet-overlay\s*\{/);
  assert.match(css, /\.more-sheet\s*\{/);

  // Role-scoped navigation preserved
  assert.match(script, /function currentTabs\(\)/);
  assert.match(script, /me\.role === 'admin' \? tabsAdmin : me\.role === 'ics'/);
});
