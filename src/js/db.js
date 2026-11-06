// IndexedDB storage for uploaded videos (the files are too large for
// localStorage). If IndexedDB is unavailable (some private modes), uploads
// are kept in memory for the current tab only and `db.persistent` is false.

const DB_NAME = 'lumen';
const DB_VERSION = 1;
const STORE = 'uploads';

let dbPromise = null;
const memory = new Map();
export const db = { persistent: true };

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (!('indexedDB' in globalThis)) { db.persistent = false; resolve(null); return; }
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch { db.persistent = false; resolve(null); return; }
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) {
        const s = d.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('ownerId', 'ownerId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { db.persistent = false; resolve(null); };
    req.onblocked = () => { db.persistent = false; resolve(null); };
  });
  return dbPromise;
}

function wrapError(err) {
  if (err && (err.name === 'QuotaExceededError' || /quota/i.test(err.message || ''))) {
    return Object.assign(new Error('Your browser storage is full. Delete some uploads and try again.'), { code: 'quota' });
  }
  return err || new Error('Storage error');
}

function tx(mode, fn) {
  return open().then((d) => new Promise((resolve, reject) => {
    if (!d) { resolve(fn(null)); return; }
    let result;
    let t;
    try { t = d.transaction(STORE, mode); } catch (e) { reject(wrapError(e)); return; }
    const s = t.objectStore(STORE);
    const req = fn(s);
    if (req) req.onsuccess = () => { result = req.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(wrapError(t.error));
    t.onabort = () => reject(wrapError(t.error));
  }));
}

export function putUpload(record) {
  return tx('readwrite', (s) => (s ? s.put(record) : void memory.set(record.id, record)));
}

export async function getUpload(id) {
  const r = await tx('readonly', (s) => (s ? s.get(id) : null));
  return r ?? memory.get(id) ?? null;
}

export async function getAllUploads() {
  const r = await tx('readonly', (s) => (s ? s.getAll() : null));
  return r ?? Array.from(memory.values());
}

export function deleteUpload(id) {
  return tx('readwrite', (s) => (s ? s.delete(id) : void memory.delete(id)));
}

/** Resolves true once we know whether IndexedDB works. */
export const ready = () => open().then(() => db.persistent);
