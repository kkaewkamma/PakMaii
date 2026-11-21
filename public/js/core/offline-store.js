'use strict';

/**
 * Offline Store for PakMaii (Ready to Grow)
 * Uses W3C IndexedDB for offline-first activity logging in the field.
 * In-memory fallback if storage is restricted.
 */

const DB_NAME = 'pakmaii_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'pending_activities';

// In-memory fallback if IndexedDB is restricted or unavailable
const memoryQueue = new Map();

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dispatchQueueChange(count) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('pakmaii:offline-change', { detail: { count } }));
  }
}

export async function savePendingActivity(payload) {
  const item = {
    id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    payload: { ...payload },
    kind: payload.kind || 'activity',
    details: payload.details || '',
    activity_date: payload.activity_date || new Date().toISOString().slice(0, 10),
    plot_id: payload.plot_id || '',
    photo_url: payload.photo_url || '',
    created_at: new Date().toISOString(),
    status: 'pending_sync'
  };

  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    memoryQueue.set(item.id, item);
  }

  const count = await countPendingActivities();
  dispatchQueueChange(count);
  return item;
}

export async function getPendingActivities() {
  try {
    const db = await openDb();
    const items = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(tx.error);
    });
    return items;
  } catch {
    return Array.from(memoryQueue.values());
  }
}

export async function removePendingActivity(id) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    memoryQueue.delete(id);
  }

  const count = await countPendingActivities();
  dispatchQueueChange(count);
}

export async function countPendingActivities() {
  try {
    const db = await openDb();
    const count = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(tx.error);
    });
    return count;
  } catch {
    return memoryQueue.size;
  }
}

export async function syncPendingActivities(apiCaller) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const current = await countPendingActivities();
    return { synced: 0, failed: 0, remaining: current };
  }

  const pending = await getPendingActivities();
  if (!pending.length) {
    return { synced: 0, failed: 0, remaining: 0 };
  }

  let synced = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      await apiCaller('/activities', 'POST', item.payload);
      await removePendingActivity(item.id);
      synced++;
    } catch (err) {
      failed++;
      // If network failure or offline, stop sync loop to avoid hammering
      if (/network|fetch|offline|Failed to fetch/i.test(String(err?.message || ''))) {
        break;
      }
    }
  }

  const remaining = await countPendingActivities();
  dispatchQueueChange(remaining);
  return { synced, failed, remaining };
}

export function onOfflineQueueChange(callback) {
  if (typeof window === 'undefined') return () => {};
  const handler = (e) => callback(e?.detail?.count ?? 0);
  window.addEventListener('pakmaii:offline-change', handler);
  return () => window.removeEventListener('pakmaii:offline-change', handler);
}
