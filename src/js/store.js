// Persistent key/value store on top of localStorage with change events.
// Falls back to in-memory storage when localStorage is blocked (private mode,
// disabled cookies), and reports quota errors instead of throwing.

export function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
  };
}

function detectStorage() {
  try {
    const s = globalThis.localStorage;
    s.setItem('lumen:__probe', '1');
    s.removeItem('lumen:__probe');
    return { storage: s, persistent: true };
  } catch {
    return { storage: memoryStorage(), persistent: false };
  }
}

export function isQuotaError(err) {
  return !!err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22);
}

export function createStore(storage, { prefix = 'lumen:', persistent = true } = {}) {
  const listeners = new Map(); // key -> Set<fn>; '*' receives every change; 'error' receives failures

  const emit = (key, value) => {
    for (const fn of listeners.get(key) || []) fn(value, key);
    if (key !== 'error') for (const fn of listeners.get('*') || []) fn(value, key);
  };

  const api = {
    persistent,
    get(key, fallback = null) {
      try {
        const raw = storage.getItem(prefix + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    /** Returns true on success, false on failure (e.g. quota exceeded). */
    set(key, value) {
      try {
        storage.setItem(prefix + key, JSON.stringify(value));
      } catch (err) {
        emit('error', { key, error: err, quota: isQuotaError(err) });
        return false;
      }
      emit(key, value);
      return true;
    },
    update(key, fn, fallback = null) {
      return api.set(key, fn(api.get(key, fallback)));
    },
    remove(key) {
      try { storage.removeItem(prefix + key); } catch { /* ignore */ }
      emit(key, null);
    },
    /** Remove every key that starts with prefix + keyPrefix. */
    removeWhere(keyPrefix) {
      const doomed = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(prefix + keyPrefix)) doomed.push(k);
      }
      doomed.forEach((k) => storage.removeItem(k));
    },
    on(key, fn) {
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key).add(fn);
      return () => listeners.get(key).delete(fn);
    },
  };
  return api;
}

const detected = typeof window !== 'undefined' ? detectStorage() : { storage: memoryStorage(), persistent: false };
export const store = createStore(detected.storage, { persistent: detected.persistent });

export const DEFAULT_SETTINGS = Object.freeze({ theme: 'system', speed: 1, autoplay: true, sidebarCollapsed: false });

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...store.get('settings', {}) };
}

export function updateSettings(patch) {
  return store.set('settings', { ...getSettings(), ...patch });
}
