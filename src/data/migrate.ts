// 舊資料升級：讀取手機資料、匯入備份時都會經過這裡，舊版資料自動補成新格式。
// 一版一版往上升：v1 → v2 → v3 → v4 → v5 → v6 → v7。
import type { Account, AppData, Category, Transaction } from './types';
import { DATA_VERSION } from './types';
import { SETTLE } from '../config';
import { normalizeBudgets } from './budget';
import { normalizeOwed } from './owed';
import { normalizeRecurring } from './recurring';
import { DEFAULT_COLOR, MISSING_ICON, isColorKey, withAccountIcon } from '../categoryStyle';
import { emojiToIcon } from './emojiIcons';

type AnyData = Omit<AppData, 'version'> & { version: number };

/**
 * v1 → v2（第二批）：
 * - 設定補上結算日（1 號）、分類自動排序（關閉）。
 * - 備註標籤補上「未釘選」。第一批的常用標籤保留在清單裡，但不自動釘選。
 * - 投資：原本的投資帳戶變成「待投入」；若一個都沒有，補一個待投入。
 */
function v1to2(d: AnyData): AnyData {
  const accounts: Account[] = d.accounts.map((a) => ({ ...a }));
  const inv = accounts.filter((a) => a.kind === 'invest');
  if (inv.length === 0) {
    accounts.push({ id: 'a-invest-cash', name: '待投入', kind: 'invest', subtype: 'cash', initialBalance: 0, order: 0 });
  } else {
    // 第一個當待投入，其餘當標的（初始餘額視為本金與現值）
    inv.forEach((a, i) => (a.subtype = i === 0 ? 'cash' : 'holding'));
  }
  return {
    ...d,
    version: 2,
    accounts,
    noteTags: d.noteTags.map((t) => ({ ...t, pinned: (t as { pinned?: boolean }).pinned ?? false })),
    settings: {
      ...d.settings,
      settleDay: d.settings.settleDay ?? SETTLE.defaultDay,
      autoSortCategories: d.settings.autoSortCategories ?? false,
    },
  };
}

/** v2 → v3（第三批）：分類補上顏色（沒有＝「其他」灰色）；沒有圖示的補問號 */
function v2to3(d: AnyData): AnyData {
  return { ...d, version: 3, categories: d.categories.map(fixCategory) };
}

/** v3 → v4（第四批）：加入預算欄位。舊紀錄沒有欄位＝不是預算，不用補 */
function v3to4(d: AnyData): AnyData {
  return { ...d, version: 4 };
}

/**
 * v4 → v5（2.0 第一批）：加入我先付（reimburseKind）、朋友付（owed、owed_repay）、算式欄位，
 * 設定加外觀、我先付／朋友付開關。舊紀錄、舊設定沒有這些欄位＝報帳／一般紀錄、亮色、開關開啟，不用補。
 */
function v4to5(d: AnyData): AnyData {
  return { ...d, version: 5 };
}

/** v5 → v6（2.0 補強批）：加入定期扣款清單（舊資料沒有＝空的）、定期扣款開關（缺值＝開啟） */
function v5to6(d: AnyData): AnyData {
  return { ...d, version: 6, recurring: Array.isArray(d.recurring) ? d.recurring : [] };
}

/**
 * v6 → v7（2.1）：圖示改用圖示名稱。
 * - 分類：舊 emoji 依對照表換成圖示名稱；對不到的保留原 emoji（照常顯示，使用者之後自己換）。
 * - 帳戶：補 icon（依種類預設）與 iconStyle（圖示）——由 withAccountIcon 補。
 */
function v6to7(d: AnyData): AnyData {
  const categories = d.categories.map((c) => {
    const name = typeof c.icon === 'string' ? emojiToIcon(c.icon) : undefined;
    return name ? { ...c, icon: name } : c;
  });
  return { ...d, version: 7, categories };
}


/** 我先付標記只能掛在報帳類紀錄上；亂填的值拿掉 */
function fixAdvance(t: Transaction): Transaction {
  if (t.reimburseKind === undefined) return t;
  const ok = t.reimburseKind === 'advance' && (t.reimbursable || t.type === 'reimburse_in');
  return ok ? t : { ...t, reimburseKind: undefined };
}

/** 預算欄位缺漏或矛盾時修正（v4 資料也會檢查，防手動改過的備份檔） */
function fixBudget(t: Transaction): Transaction {
  if (!t.budget) {
    if (t.budgetStatus || t.budgetPaidTxId) return { ...t, budget: undefined, budgetStatus: undefined, budgetPaidTxId: undefined };
    return t;
  }
  if (t.type !== 'expense') return { ...t, budget: undefined, budgetStatus: undefined, budgetPaidTxId: undefined };
  const status = t.budgetStatus === 'paid' && t.budgetPaidTxId ? 'paid' : 'pending';
  // 預算和報帳不能同時存在：以預算為準
  if (status === t.budgetStatus && !t.reimbursable && (status === 'paid' || !t.budgetPaidTxId)) return t;
  return {
    ...t,
    budgetStatus: status,
    budgetPaidTxId: status === 'paid' ? t.budgetPaidTxId : undefined,
    reimbursable: false,
    reimburseStatus: undefined,
    reimburseBatchId: undefined,
  };
}

/** 分類的圖示、顏色缺漏時補預設值（v3 資料也會檢查，防手動改過的備份檔） */
function fixCategory(c: Category): Category {
  const icon = typeof c.icon === 'string' && c.icon.trim() ? c.icon : MISSING_ICON;
  const color = isColorKey(c.color) ? c.color : DEFAULT_COLOR;
  return icon === c.icon && color === c.color ? c : { ...c, icon, color };
}

export function migrate(raw: unknown): AppData {
  let d = raw as AnyData;
  if (typeof d?.version !== 'number' || d.version < 1 || d.version > DATA_VERSION) {
    throw new Error('不支援的資料版本');
  }
  if (d.version === 1) d = v1to2(d);
  if (d.version === 2) d = v2to3(d);
  if (d.version === 3) d = v3to4(d);
  if (d.version === 4) d = v4to5(d);
  if (d.version === 5) d = v5to6(d);
  if (d.version === 6) d = v6to7(d);
  const accounts = d.accounts.map(withAccountIcon);
  const categories = d.categories.map(fixCategory);
  const transactions = Array.isArray(d.transactions) ? d.transactions.map((t) => fixAdvance(fixBudget(t))) : d.transactions;
  return normalizeRecurring(normalizeOwed(normalizeBudgets({ ...d, version: DATA_VERSION, accounts, categories, transactions } as AppData)));
}
