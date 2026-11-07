// 常用的資料查詢
import type { Account, AccountKind, AppData, Category } from './data/types';
import { SMALL_KINDS, KIND_LABEL } from './data/types';
import { byOrder } from './data/ops';
import { TOPUP_CAT_PREFIX } from './data/calc';

export const bankAccounts = (d: AppData) => d.accounts.filter((a) => a.kind === 'bank').sort(byOrder);

export const accountsOfKind = (d: AppData, k: AccountKind) => d.accounts.filter((a) => a.kind === k).sort(byOrder);

/** 首頁/明細的五顆小帳戶球 */
export function balls(d: AppData) {
  return SMALL_KINDS.map((kind) => ({ kind, label: KIND_LABEL[kind], accounts: accountsOfKind(d, kind) }));
}

/** 所有帳戶，依「一般帳戶 → 五顆球」排列（帳戶選單用） */
export function orderedAccounts(d: AppData): Account[] {
  return [...bankAccounts(d), ...SMALL_KINDS.flatMap((k) => accountsOfKind(d, k))];
}

export const accountName = (d: AppData, id: string | null | undefined) =>
  d.accounts.find((a) => a.id === id)?.name ?? '（已刪除）';

export const categoriesOf = (d: AppData, type: 'expense' | 'income'): Category[] =>
  d.categories.filter((c) => c.type === type).sort(byOrder);

export const categoryOf = (d: AppData, id: string | undefined) => d.categories.find((c) => c.id === id);

export const KIND_ICON: Record<AccountKind, string> = {
  bank: '🏦',
  easycard: '🚇',
  ewallet: '📲',
  invest: '📈',
  saving: '🐷',
  other: '🗂️',
};

/** 統計用的分類顯示：儲值（轉入悠遊卡、電子錢包）是系統分類，不在分類設定裡 */
export function categoryDisplay(d: AppData, id: string | undefined): { icon: string; name: string } {
  if (id?.startsWith(TOPUP_CAT_PREFIX)) {
    const kind = id.slice(TOPUP_CAT_PREFIX.length) as AccountKind;
    return { icon: KIND_ICON[kind] ?? '💳', name: `${KIND_LABEL[kind] ?? ''}儲值` };
  }
  const c = categoryOf(d, id);
  return { icon: c?.icon ?? '？', name: c?.name ?? '（已刪除）' };
}
