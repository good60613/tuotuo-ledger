// 資料備份：匯出／匯入（JSON 檔）。
//
// 備份檔格式（第三批起，檔案版本 2）：
//   { app: 'ledger-app', type: 'full' | 'settings', fileVersion: 2, exportedAt, data }
//   - type='full'：完整備份，data＝整份資料（含紀錄）。
//   - type='settings'：只有設定，data＝帳戶、小帳戶、分類、備註標籤、設定（沒有 transactions）。
//   - data.version 是資料本身的版本（見 types.ts 的 DATA_VERSION），舊版會自動升級。
//   - 補強批起資料版本 6：多了 recurring（定期扣款），完整備份與「只有設定」都會帶；舊備份沒有＝空的。
//     舊版 App（資料版本 5）讀不了版本 6 的檔案，會顯示「不支援的資料版本」。
//   - 2.1 起資料版本 7：帳戶多了 icon、iconStyle，分類 icon 改存圖示名稱；兩種備份都會帶。
//     舊版 App（2.0.x，資料版本 6）讀不了版本 7 的檔案。
// 舊版備份檔（第一、二批）沒有 type 與 fileVersion，一律當完整備份。
import type { Account, AppData, Category, CategoryType, Transaction } from './types';
import { migrate } from './migrate';
import { normalizeBatches } from './ops';
import { normalizeBudgets } from './budget';
import { normalizeOwed } from './owed';

export const BACKUP_FILE_VERSION = 2;

export type BackupType = 'full' | 'settings';

/** 只匯出設定時的內容：整份資料去掉紀錄 */
export type SettingsData = Omit<AppData, 'transactions'>;

export type ParsedBackup = { type: 'full'; data: AppData } | { type: 'settings'; data: SettingsData };

export function exportJson(data: AppData, type: BackupType = 'full'): string {
  const payload: AppData | SettingsData =
    type === 'full' ? data : (({ transactions: _t, ...rest }) => rest)(data);
  return JSON.stringify(
    { app: 'ledger-app', type, fileVersion: BACKUP_FILE_VERSION, exportedAt: new Date().toISOString(), data: payload },
    null,
    2,
  );
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** 讀備份檔，自動判斷是完整備份還是只有設定 */
export function readBackup(text: string): ParsedBackup {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('檔案不是正確的備份格式');
  }
  if (!isObj(obj)) throw new Error('檔案不是這個 App 的備份');
  const wrapped = isObj(obj.data);
  const d = (wrapped ? obj.data : obj) as Record<string, unknown>;
  const type: BackupType = wrapped && obj.type === 'settings' ? 'settings' : 'full';
  if (wrapped && typeof obj.fileVersion === 'number' && obj.fileVersion > BACKUP_FILE_VERSION) {
    throw new Error('這個備份檔是較新版本的 App 匯出的，請先更新 App');
  }
  const okBase =
    typeof d.version === 'number' &&
    Array.isArray(d.accounts) &&
    Array.isArray(d.categories) &&
    Array.isArray(d.noteTags) &&
    isObj(d.settings);
  if (!okBase || (type === 'full' && !Array.isArray(d.transactions))) throw new Error('檔案不是這個 App 的備份');

  if (type === 'full') return { type, data: migrate(d) };
  // 只有設定：借用同一套升級流程（暫時補空紀錄），升級完再拿掉
  const { transactions: _t, ...rest } = migrate({ ...d, transactions: [] });
  return { type, data: rest };
}

/** 讀完整備份（舊介面，測試與其他地方沿用）；只有設定的檔案會丟錯 */
export function parseBackup(text: string): AppData {
  const r = readBackup(text);
  if (r.type !== 'full') throw new Error('這是「只有設定」的備份檔');
  return r.data;
}

// ---------------- 只匯入設定 ----------------

export interface MissingAccount {
  id: string;
  /** 目前資料裡的名稱（找不到就顯示「（已刪除）」） */
  name: string;
  kind: Account['kind'] | null;
  count: number;
  /** 可以搬過去的帳戶（新設定裡同一種類的帳戶） */
  candidates: Account[];
}
export interface MissingCategory {
  id: string;
  name: string;
  type: CategoryType;
  count: number;
  /** 可以搬過去的分類（新設定裡同類型的分類） */
  candidates: Category[];
}
export interface SettingsImportCheck {
  missingAccounts: MissingAccount[];
  missingCategories: MissingCategory[];
}

/** 搬到同一種類：投資的「待投入」和「標的」也要分開 */
function sameKind(a: Account, kind: Account['kind'] | null, subtype: string | undefined): boolean {
  if (!kind) return true;
  if (a.kind !== kind) return false;
  return kind !== 'invest' || (a.subtype ?? 'cash') === (subtype ?? 'cash');
}

/**
 * 只匯入設定之前的檢查：現有紀錄用到、但新設定裡找不到的帳戶與分類。
 * 不會改任何資料。
 */
export function checkSettingsImport(current: AppData, incoming: SettingsData): SettingsImportCheck {
  const newAcc = new Set(incoming.accounts.map((a) => a.id));
  const newCat = new Set(incoming.categories.map((c) => c.id));
  const accCount = new Map<string, number>();
  const catCount = new Map<string, { n: number; type: CategoryType }>();
  for (const t of current.transactions) {
    const ids = new Set([t.accountId, t.toAccountId].filter((x): x is string => !!x));
    for (const id of ids) if (!newAcc.has(id)) accCount.set(id, (accCount.get(id) ?? 0) + 1);
    if (t.categoryId && !newCat.has(t.categoryId)) {
      const prev = catCount.get(t.categoryId);
      catCount.set(t.categoryId, { n: (prev?.n ?? 0) + 1, type: prev?.type ?? (t.type === 'income' ? 'income' : 'expense') });
    }
  }
  const missingAccounts = [...accCount].map(([id, count]) => {
    const old = current.accounts.find((a) => a.id === id);
    const kind = old?.kind ?? null;
    return {
      id,
      name: old?.name ?? '（已刪除）',
      kind,
      count,
      candidates: incoming.accounts.filter((a) => sameKind(a, kind, old?.subtype)).sort((a, b) => a.order - b.order),
    };
  });
  const missingCategories = [...catCount].map(([id, { n, type: guess }]) => {
    const old = current.categories.find((c) => c.id === id);
    const type = old?.type ?? guess;
    return {
      id,
      name: old?.name ?? '（已刪除）',
      type,
      count: n,
      candidates: incoming.categories.filter((c) => c.type === type).sort((a, b) => a.order - b.order),
    };
  });
  return { missingAccounts, missingCategories };
}

export interface SettingsImportMapping {
  /** 找不到的帳戶 id → 搬去的帳戶 id */
  accounts: Record<string, string>;
  /** 找不到的分類 id → 搬去的分類 id */
  categories: Record<string, string>;
}

/**
 * 只取代設定，紀錄保留。找不到的帳戶、分類照 mapping 搬過去（每一個都要有去處，否則丟錯）。
 * 搬完變成「自己轉給自己」的轉帳沒有意義，會移除，數量回傳給畫面顯示。
 */
export function applySettingsImport(
  current: AppData,
  incoming: SettingsData,
  mapping: SettingsImportMapping = { accounts: {}, categories: {} },
): { data: AppData; removedSelfTransfers: number } {
  const check = checkSettingsImport(current, incoming);
  for (const m of check.missingAccounts) {
    const to = mapping.accounts[m.id];
    if (!to || !m.candidates.some((a) => a.id === to)) throw new Error(`「${m.name}」的紀錄還沒選好要移到哪個帳戶`);
  }
  for (const m of check.missingCategories) {
    const to = mapping.categories[m.id];
    if (!to || !m.candidates.some((c) => c.id === to)) throw new Error(`「${m.name}」的紀錄還沒選好要移到哪個分類`);
  }
  const acc = (id: string | undefined) => (id && mapping.accounts[id]) || id;
  const cat = (id: string | undefined) => (id && mapping.categories[id]) || id;
  let removed = 0;
  const transactions: Transaction[] = [];
  for (const t of current.transactions) {
    const next: Transaction = { ...t, accountId: acc(t.accountId)!, toAccountId: acc(t.toAccountId), categoryId: cat(t.categoryId) };
    if (t.toAccountId === undefined) delete next.toAccountId;
    if (t.categoryId === undefined) delete next.categoryId;
    if (next.type === 'transfer' && next.accountId === next.toAccountId) {
      removed++;
      continue;
    }
    transactions.push(next);
  }
  const ids = new Set(incoming.accounts.map((a) => a.id));
  const settings = { ...incoming.settings };
  if (settings.defaultReimburseAccountId && !ids.has(settings.defaultReimburseAccountId)) settings.defaultReimburseAccountId = null;
  if (settings.lastUsedAccountId && !ids.has(settings.lastUsedAccountId)) settings.lastUsedAccountId = null;
  // 定期扣款：同一項在現在的資料裡已經扣到比較後面的月份 → 用比較後面的，避免舊設定檔讓已扣過的月份再扣一次
  const curNext = new Map((current.recurring ?? []).map((r) => [r.id, r.nextMonth]));
  const recurring = (incoming.recurring ?? []).map((r) => {
    const c = curNext.get(r.id);
    return c && c > r.nextMonth ? { ...r, nextMonth: c } : r;
  });
  const data = normalizeOwed(normalizeBudgets(normalizeBatches({ ...incoming, recurring, settings, transactions })));
  return { data, removedSelfTransfers: removed };
}

// ---------------- 存檔到手機 ----------------

/** 在手機上觸發下載 */
export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 匯出備份檔。網頁版：直接下載。APK 版：Android 的內嵌網頁不能下載檔案，
 * 改成先存到 App 的暫存資料夾，再跳出「分享」選單，讓使用者存到雲端硬碟、檔案管理或傳給自己。
 * 回傳要顯示給使用者的提示文字；使用者取消分享時回傳 null。
 */
export async function saveBackupFile(filename: string, text: string): Promise<string | null> {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) {
    downloadText(filename, text);
    return '已匯出備份檔（在手機的「下載」資料夾）';
  }
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const r = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
  try {
    await Share.share({ title: filename, files: [r.uri], dialogTitle: '把備份檔存到…' });
  } catch {
    return null; // 使用者關掉分享選單
  }
  return '已產生備份檔，請確認已存到雲端硬碟或檔案管理';
}
