/**
 * Screenshots live in IndexedDB: at 30–120 KB each they'd exhaust
 * localStorage's ~5 MB quota within a few dozen comments. Every call degrades
 * to a no-op where IndexedDB is unavailable (private modes, jsdom).
 */

const DB_NAME = 'grabby';
const STORE = 'screenshots';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? (req.result as T) : null);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function putScreenshot(id: string, blob: Blob): Promise<unknown> {
  return run('readwrite', (s) => s.put(blob, id));
}

export function getScreenshot(id: string): Promise<Blob | null> {
  return run<Blob>('readonly', (s) => s.get(id));
}

export function deleteScreenshots(ids: string[]): Promise<unknown> {
  if (ids.length === 0) return Promise.resolve(null);
  return run('readwrite', (s) => { for (const id of ids) s.delete(id); });
}

export function clearScreenshots(): Promise<unknown> {
  return run('readwrite', (s) => s.clear());
}
