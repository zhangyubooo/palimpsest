import type { World } from '../sim';

/**
 * Saves the world in the browser (IndexedDB) so it is still there when the
 * visitor comes back. IndexedDB stores typed arrays and plain objects as they
 * are, so a saved world is the World object itself plus a little bookkeeping.
 */
export interface SavedWorld {
  world: World;
  /** Ids of the lifeforms this visitor released. */
  mine: number[];
  /** Date.now() at the moment of saving. */
  savedAt: number;
}

const DB_NAME = 'palimpsest';
const STORE = 'worlds';
const KEY = 'current';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = action(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export function saveWorld(saved: SavedWorld): Promise<void> {
  return run('readwrite', (store) => store.put(saved, KEY)).then(() => undefined);
}

/** Resolves to null when nothing is saved or storage is unavailable. */
export function loadWorld(): Promise<SavedWorld | null> {
  return run<SavedWorld | undefined>('readonly', (store) => store.get(KEY))
    .then((saved) => saved ?? null)
    .catch(() => null);
}

export function clearWorld(): Promise<void> {
  return run('readwrite', (store) => store.delete(KEY))
    .then(() => undefined)
    .catch(() => undefined);
}
