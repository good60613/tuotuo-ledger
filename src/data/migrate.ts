// 舊資料升級：讀取手機資料、匯入備份時都會經過這裡，舊版資料自動補成新格式。
import type { Account, AppData } from './types';
import { DATA_VERSION } from './types';
import { SETTLE } from '../config';

/**
 * v1 → v2（第二批）：
 * - 設定補上結算日（1 號）、分類自動排序（關閉）。
 * - 備註標籤補上「未釘選」。第一批的常用標籤保留在清單裡，但不自動釘選。
 * - 投資：原本的投資帳戶變成「待投入」；若一個都沒有，補一個待投入。
 */
export function migrate(raw: unknown): AppData {
  const d = raw as AppData & { version: number };
  if (d.version === DATA_VERSION) return d;
  if (d.version !== 1) throw new Error('不支援的資料版本');

  let accounts: Account[] = d.accounts.map((a) => ({ ...a }));
  const inv = accounts.filter((a) => a.kind === 'invest');
  if (inv.length === 0) {
    accounts.push({ id: 'a-invest-cash', name: '待投入', kind: 'invest', subtype: 'cash', initialBalance: 0, order: 0 });
  } else {
    // 第一個當待投入，其餘當標的（初始餘額視為本金與現值）
    inv.forEach((a, i) => (a.subtype = i === 0 ? 'cash' : 'holding'));
  }

  return {
    ...d,
    version: DATA_VERSION,
    accounts,
    noteTags: d.noteTags.map((t) => ({ ...t, pinned: (t as { pinned?: boolean }).pinned ?? false })),
    settings: {
      ...d.settings,
      settleDay: d.settings.settleDay ?? SETTLE.defaultDay,
      autoSortCategories: d.settings.autoSortCategories ?? false,
    },
  };
}
