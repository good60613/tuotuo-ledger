// 明細頁底部篩選膠囊（2.2 B2）的「類型」與「搜尋」規則。只決定要不要顯示，不算金額。
import type { AppData, Transaction } from './data/types';
import { categoryDisplay } from './selectors';

export type TypeFilter = 'expense' | 'income' | 'transfer' | 'reimb' | 'advance' | 'owed' | 'budget' | 'adjust';

/** 類型膠囊的選項（順序＝選單順序） */
export const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: 'expense', label: '支出' },
  { key: 'income', label: '收入' },
  { key: 'transfer', label: '轉帳' },
  { key: 'reimb', label: '報帳' },
  { key: 'advance', label: '先付' },
  { key: 'owed', label: '先欠' },
  { key: 'budget', label: '預算' },
  { key: 'adjust', label: '校正' },
];

/**
 * - 支出／收入：一般的支出、收入（不含掛了報帳、先付、預算的；那些各有自己的選項）
 * - 報帳、先付：掛標記的那筆＋收回入帳那筆；先欠：先欠那筆＋還朋友錢那筆；預算：預算那筆＋付款那筆
 */
export function matchType(t: Transaction, k: TypeFilter): boolean {
  const adv = t.reimburseKind === 'advance';
  switch (k) {
    case 'expense': return t.type === 'expense' && !t.reimbursable && !t.budget && !t.budgetOfId;
    case 'income': return t.type === 'income' && !t.reimbursable;
    case 'transfer': return t.type === 'transfer';
    case 'reimb': return (t.reimbursable && !adv) || (t.type === 'reimburse_in' && !adv);
    case 'advance': return (t.reimbursable && adv) || (t.type === 'reimburse_in' && adv);
    case 'owed': return t.type === 'owed' || t.type === 'owed_repay';
    case 'budget': return !!t.budget || !!t.budgetOfId;
    case 'adjust': return t.type === 'adjust' || t.type === 'valuation';
  }
}

/** 搜尋備註與分類名稱（不分大小寫）；空字串＝不篩 */
export function matchSearch(d: AppData, t: Transaction, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  if (t.note.toLowerCase().includes(s)) return true;
  return !!t.categoryId && categoryDisplay(d, t.categoryId).name.toLowerCase().includes(s);
}
