// 儲存層：試玩版用瀏覽器內建的 IndexedDB（手機本機資料庫）。
// 之後包 APK 若要換成 Capacitor 的儲存方式，只需要改這個檔案。
import type { AppData } from './types';
import { migrate } from './migrate';

const DB_NAME = 'ledger-app';
const STORE = 'kv';
const KEY = 'data';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
const db = () => (dbPromise ??= openDb());

export async function loadData(): Promise<AppData | null> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    req.onsuccess = () => {
      try {
        resolve(req.result ? migrate(req.result) : null);
      } catch (e) {
        reject(e);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveData(data: AppData): Promise<void> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(data, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 請瀏覽器把資料標成「不要自動清除」（Android Chrome 支援） */
export async function requestPersistence(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* 不支援就算了 */
  }
}
