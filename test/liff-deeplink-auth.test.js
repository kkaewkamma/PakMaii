import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PENDING_TAB_KEY,
  parseDeepLinkTab,
  capturePendingTab,
  clearPendingTab,
  stripTabFromUrl,
  consumePendingTab,
  isLineInAppUserAgent,
  shouldAttemptLiffAutoLogin
} from '../public/js/core/deep-link.js';

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    dump() { return Object.fromEntries(map.entries()); }
  };
}

test('parseDeepLinkTab accepts valid tab slugs and rejects unsafe or malformed values', () => {
  for (const valid of ['home', 'record', 'approval', 'plots', '  RECORD  ']) {
    assert.equal(parseDeepLinkTab(`?tab=${encodeURIComponent(valid)}`), valid.trim().toLowerCase());
  }
  assert.equal(parseDeepLinkTab(''), null);
  assert.equal(parseDeepLinkTab('?tutorial=1'), null);
  assert.equal(parseDeepLinkTab('?tab=<script>'), null);
  assert.equal(parseDeepLinkTab('?tab=../admin'), null);
  assert.equal(parseDeepLinkTab('?tab=123'), null);
  assert.equal(parseDeepLinkTab('?tab=a'), null);
  assert.equal(parseDeepLinkTab('?tab=' + 'a'.repeat(25)), null);
});

test('capturePendingTab and consumePendingTab survive login redirect, consume once, preserve tutorial param, and enforce validTabs', () => {
  const storage = createMemoryStorage();
  let replacedUrl = null;

  // 1. Capture before OAuth / Login
  const captured = capturePendingTab({ search: '?tutorial=1&tab=record', storage });
  assert.equal(captured, 'record');
  assert.equal(storage.getItem(PENDING_TAB_KEY), 'record');

  // 2. Subsequent startup without ?tab= in query (post-OAuth callback) still finds pending tab
  assert.equal(capturePendingTab({ search: '', storage }), 'record');

  // 3. Consume once as Farmer with validTabs
  const selected = consumePendingTab({
    validTabs: ['home', 'plots', 'record', 'approval', 'reviews', 'lots'],
    storage,
    locationHref: 'https://pakmaii.example/?tutorial=1&tab=record#top',
    replaceUrl: (next) => { replacedUrl = next; }
  });
  assert.equal(selected, 'record');
  assert.equal(storage.getItem(PENDING_TAB_KEY), null);
  assert.equal(replacedUrl, '/?tutorial=1#top');

  // 4. Role restriction: Admin cannot open farmer-only tab
  capturePendingTab({ search: '?tab=record', storage });
  const adminSelected = consumePendingTab({
    validTabs: ['overview', 'invites', 'users', 'assignments'],
    storage,
    locationHref: 'https://pakmaii.example/?tab=record',
    replaceUrl: (next) => { replacedUrl = next; }
  });
  assert.equal(adminSelected, null);
  assert.equal(storage.getItem(PENDING_TAB_KEY), null);
  assert.equal(replacedUrl, '/');

  // 5. Logout helper clears pending tab
  capturePendingTab({ search: '?tab=approval', storage });
  clearPendingTab(storage);
  assert.equal(storage.getItem(PENDING_TAB_KEY), null);
  assert.equal(stripTabFromUrl('https://pakmaii.example/?tutorial=1'), null);
});

test('shouldAttemptLiffAutoLogin isolates Demo/Dev, respects logged_out, and enables in-app LINE LIFF login on Staging/Prod', () => {
  const lineUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari Line/14.0.0';
  const chromeUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36';
  const stagingCfg = { liffId: '2012022503-PE16sYjU', development: false, demoOnly: false };

  assert.equal(isLineInAppUserAgent(lineUa), true);
  assert.equal(isLineInAppUserAgent(chromeUa), false);

  // Public Demo & Local Dev never auto-login via LINE
  assert.equal(shouldAttemptLiffAutoLogin({
    cfg: { liffId: '2012022503-PE16sYjU', development: false, demoOnly: true },
    storage: createMemoryStorage(),
    userAgent: lineUa
  }), false);
  assert.equal(shouldAttemptLiffAutoLogin({
    cfg: { liffId: '2012022503-PE16sYjU', development: true, demoOnly: false },
    storage: createMemoryStorage(),
    userAgent: lineUa
  }), false);
  assert.equal(shouldAttemptLiffAutoLogin({
    cfg: { liffId: '', development: false, demoOnly: false },
    storage: createMemoryStorage(),
    userAgent: lineUa
  }), false);

  // Explicit logout prevents bounce even inside LINE WebView
  assert.equal(shouldAttemptLiffAutoLogin({
    cfg: stagingCfg,
    storage: createMemoryStorage({ logged_out: '1', admin_login: '1' }),
    userAgent: lineUa
  }), false);

  // Staging/Prod inside LINE App -> auto-login enabled
  assert.equal(shouldAttemptLiffAutoLogin({
    cfg: stagingCfg,
    storage: createMemoryStorage(),
    userAgent: lineUa
  }), true);

  // Staging/Prod on external browser without explicit LINE click -> stays on login screen
  assert.equal(shouldAttemptLiffAutoLogin({
    cfg: stagingCfg,
    storage: createMemoryStorage(),
    userAgent: chromeUa
  }), false);

  // Staging/Prod on external browser after explicit LINE button click -> resumes LINE login
  assert.equal(shouldAttemptLiffAutoLogin({
    cfg: stagingCfg,
    storage: createMemoryStorage({ admin_login: '1' }),
    userAgent: chromeUa
  }), true);
});
