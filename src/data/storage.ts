// 儲存層：用手機瀏覽器內建的 IndexedDB（手機本機資料庫）。
//
// 2.0 修正批：
// - 主資料一個資料庫（ledger-app），自動存檔另一個資料庫（ledger-app-snapshots），
//   兩邊是各自的寫入動作，主資料寫壞不會連留底一起壞。
// - 寫入鎖：開啟時預設鎖住，讀檔成功才打開（見 boot.ts）。保護狀態下任何存檔都會失敗，
//   不會發生「讀不到資料 → 畫面上的範例資料被存進去 → 真帳本被蓋掉」。
import type { AppData } from './types';
import type { Storage } from './boot';
import type { Snapshot, SnapshotMeta } from './snapshots';
import { metaOf } from './snapshots';

const DB_NAME = 'ledger-app';
const STORE = 'kv';
const KEY = 'data';

const SNAP_DB = 'ledger-app-snapshots';
const SNAP_META = 'meta';
const SNAP_DATA = 'data';

function open(name: string, upgrade: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
const db = () => (dbPromise ??= open(DB_NAME, (d) => d.createObjectStore(STORE)).catch((e) => {
  dbPromise = null; // 下次重試時重新開
  throw e;
}));

let snapPromise: Promise<IDBDatabase> | null = null;
const snapDb = () => (snapPromise ??= open(SNAP_DB, (d) => {
  d.createObjectStore(SNAP_META, { keyPath: 'id' });
  d.createObjectStore(SNAP_DATA);
}).catch((e) => {
  snapPromise = null;
  throw e;
}));

let writeLocked = true;

/** 鎖住時存檔一律失敗 */
export function setWriteLock(locked: boolean) {
  writeLocked = locked;
}

/** 讀出手機上的原始資料（不升級）；沒有資料＝null */
export async function loadRaw(): Promise<unknown> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveData(data: AppData): Promise<void> {
  if (writeLocked) throw new Error('資料保護中，沒有存檔');
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(data, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ---------------- 自動存檔 ----------------

export async function listSnapshots(): Promise<SnapshotMeta[]> {
  const d = await snapDb();
  return new Promise((resolve, reject) => {
    const req = d.transaction(SNAP_META, 'readonly').objectStore(SNAP_META).getAll();
    req.onsuccess = () => resolve(req.result as SnapshotMeta[]);
    req.onerror = () => reject(req.error);
  });
}

export async function getSnapshot(id: string): Promise<Snapshot | undefined> {
  const d = await snapDb();
  return new Promise((resolve, reject) => {
    const tx = d.transaction([SNAP_META, SNAP_DATA], 'readonly');
    const m = tx.objectStore(SNAP_META).get(id);
    const v = tx.objectStore(SNAP_DATA).get(id);
    tx.oncomplete = () => resolve(m.result ? { ...(m.result as SnapshotMeta), data: v.result } : undefined);
    tx.onerror = () => reject(tx.error);
  });
}

/** 留底不受寫入鎖限制：保護狀態下也要能把壞掉的原樣留下來 */
export async function addSnapshot(s: Snapshot): Promise<void> {
  const d = await snapDb();
  return new Promise((resolve, reject) => {
    const tx = d.transaction([SNAP_META, SNAP_DATA], 'readwrite');
    tx.objectStore(SNAP_META).put(metaOf(s));
    tx.objectStore(SNAP_DATA).put(s.data, s.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function deleteSnapshots(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const d = await snapDb();
  return new Promise((resolve, reject) => {
    const tx = d.transaction([SNAP_META, SNAP_DATA], 'readwrite');
    for (const id of ids) {
      tx.objectStore(SNAP_META).delete(id);
      tx.objectStore(SNAP_DATA).delete(id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 給 boot.ts 用的實際儲存 */
export const deviceStorage: Storage = { loadRaw, saveData, setWriteLock, listSnapshots, getSnapshot, addSnapshot, deleteSnapshots };

/** 請瀏覽器把資料標成「不要自動清除」（Android Chrome 支援） */
export async function requestPersistence(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* 不支援就算了 */
  }
}
