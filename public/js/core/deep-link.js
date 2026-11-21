'use strict';

export const PENDING_TAB_KEY = 'pending_tab';

const TAB_PATTERN = /^[a-z]{2,20}$/;

/**
 * Parse and sanitize the `?tab=` query parameter or pathname slug for LINE Rich Menu / LIFF deep links.
 * Returns normalized lowercase tab key or null when invalid/missing.
 */
export function parseDeepLinkTab(search, pathname = '') {
  if (search) {
    const raw = new URLSearchParams(String(search)).get('tab');
    if (raw) {
      const normalized = String(raw).trim().toLowerCase();
      if (TAB_PATTERN.test(normalized)) return normalized;
    }
  }
  if (pathname) {
    const segments = String(pathname).split('/').filter(Boolean);
    const last = segments[segments.length - 1]?.trim().toLowerCase();
    if (last && TAB_PATTERN.test(last) && !last.includes('.')) {
      return last;
    }
  }
  return null;
}

/**
 * Persist a valid `?tab=` deep link in sessionStorage before authentication or LIFF OAuth redirect.
 */
export function capturePendingTab({ search, pathname, storage }) {
  const fromQuery = parseDeepLinkTab(search, pathname);
  if (fromQuery) {
    storage?.setItem(PENDING_TAB_KEY, fromQuery);
    return fromQuery;
  }
  const stored = storage?.getItem(PENDING_TAB_KEY);
  const normalized = stored ? String(stored).trim().toLowerCase() : '';
  return TAB_PATTERN.test(normalized) ? normalized : null;
}

/**
 * Remove any pending deep-link target (e.g., upon explicit logout).
 */
export function clearPendingTab(storage) {
  storage?.removeItem(PENDING_TAB_KEY);
}

/**
 * Strip `tab` from a URL while preserving other parameters (e.g., `?tutorial=1`) and hash fragments.
 */
export function stripTabFromUrl(href) {
  if (!href) return null;
  const url = new URL(String(href), 'http://localhost');
  let changed = false;
  if (url.searchParams.has('tab')) {
    url.searchParams.delete('tab');
    changed = true;
  }
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 1 && TAB_PATTERN.test(segments[0])) {
    url.pathname = '/';
    changed = true;
  }
  if (!changed) return null;
  const qs = url.searchParams.toString();
  return `${url.pathname}${qs ? `?${qs}` : ''}${url.hash || ''}`;
}

/**
 * Consume pending deep-link tab exactly once after authenticated `/me` and clean the browser URL.
 * Enforces `validTabs` role whitelist so restricted tabs are ignored.
 */
export function consumePendingTab({ validTabs, storage, locationHref, replaceUrl }) {
  const raw = storage?.getItem(PENDING_TAB_KEY);
  const normalized = raw ? String(raw).trim().toLowerCase() : '';
  storage?.removeItem(PENDING_TAB_KEY);

  if (typeof replaceUrl === 'function' && locationHref) {
    try {
      const cleaned = stripTabFromUrl(locationHref);
      if (cleaned) replaceUrl(cleaned);
    } catch {}
  }

  if (!normalized || !Array.isArray(validTabs)) return null;
  return validTabs.includes(normalized) ? normalized : null;
}

/**
 * Detect whether the page is opened inside the LINE in-app browser (LIFF WebView).
 */
export function isLineInAppUserAgent(userAgent) {
  return /\bLine\//i.test(String(userAgent || ''));
}

/**
 * Determine whether startup should run LIFF auto-login without bypassing Demo-first or logout state.
 */
export function shouldAttemptLiffAutoLogin({ cfg, storage, userAgent }) {
  if (!cfg || cfg.demoOnly || cfg.development || !cfg.liffId) return false;
  if (storage?.getItem('logged_out') === '1') return false;
  if (storage?.getItem('admin_login') === '1') return true;
  return isLineInAppUserAgent(userAgent);
}
