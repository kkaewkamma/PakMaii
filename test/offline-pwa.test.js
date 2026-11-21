import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const manifestRaw = fs.readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8');
const swCode = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const offlineStoreCode = fs.readFileSync(new URL('../public/js/core/offline-store.js', import.meta.url), 'utf8');
const farmerViewCode = fs.readFileSync(new URL('../public/js/views/farmer.js', import.meta.url), 'utf8');
const appCode = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('PWA manifest is valid JSON and contains required standalone metadata', () => {
  const manifest = JSON.parse(manifestRaw);
  assert.equal(manifest.name, 'ปลูกของดี — PakMaii (Ready to Grow)');
  assert.equal(manifest.short_name, 'ปลูกของดี');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/?pwa=1');
  assert.equal(manifest.theme_color, '#183F32');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'Must have at least one icon');
  assert.match(manifest.icons[0].src, /icon\.svg/);
});

test('index.html links PWA manifest, app icons, and offline banner', () => {
  assert.match(html, /<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"/);
  assert.match(html, /<link\s+rel="icon"\s+type="image\/svg\+xml"\s+href="\/icon\.svg"/);
  assert.match(html, /<link\s+rel="apple-touch-icon"\s+href="\/icon\.svg"/);
  assert.match(html, /<meta\s+name="mobile-web-app-capable"\s+content="yes"/);
  assert.match(html, /id="offlineSyncBanner"/);
  assert.match(html, /id="offlineStatusBadge"/);
});

test('Service Worker caches App Shell and avoids caching mutating requests', () => {
  assert.match(swCode, /CACHE_NAME\s*=\s*['"]pakmaii-app-v\d+['"]/);
  assert.match(swCode, /self\.addEventListener\(['"]install['"]/);
  assert.match(swCode, /self\.addEventListener\(['"]activate['"]/);
  assert.match(swCode, /self\.addEventListener\(['"]fetch['"]/);
  assert.match(swCode, /url\.pathname\.startsWith\(['"]\/api\/['"]\)/);
  assert.match(swCode, /request\.method !== 'GET'/);
  assert.match(swCode, /caches\.match\(['"]\/index\.html['"]\)/);
  // Security invariant: never use localStorage in SW
  assert.doesNotMatch(swCode, /localStorage/);
});

test('Offline store provides IndexedDB queue with memory fallback and zero localStorage', () => {
  assert.match(offlineStoreCode, /export async function savePendingActivity/);
  assert.match(offlineStoreCode, /export async function getPendingActivities/);
  assert.match(offlineStoreCode, /export async function removePendingActivity/);
  assert.match(offlineStoreCode, /export async function countPendingActivities/);
  assert.match(offlineStoreCode, /export async function syncPendingActivities/);
  assert.match(offlineStoreCode, /indexedDB/);
  // Strict Security Invariant: NO localStorage
  assert.doesNotMatch(offlineStoreCode, /localStorage/);
});

test('Farmer view integrates offline activity saving and history queue rendering', () => {
  assert.match(farmerViewCode, /savePendingActivity/);
  assert.match(farmerViewCode, /getPendingActivities/);
  assert.match(farmerViewCode, /OFFLINE_NETWORK/);
  assert.match(farmerViewCode, /บันทึกในเครื่องแล้ว \(โหมดออฟไลน์กลางทุ่ง\)/);
  assert.match(farmerViewCode, /card-pending-offline/);
  assert.doesNotMatch(farmerViewCode, /localStorage/);
});

test('App shell registers Service Worker and manages offline status UI', () => {
  assert.match(appCode, /navigator\.serviceWorker\.register\(['"]\/sw\.js['"]/);
  assert.match(appCode, /updateOfflineStatusUI/);
  assert.match(appCode, /syncPendingActivities/);
  assert.match(appCode, /offlineSyncBanner/);
  assert.doesNotMatch(appCode, /localStorage/);
});
