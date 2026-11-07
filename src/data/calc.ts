// 計算規則。餘額一律從紀錄推算，不另外存「目前餘額」，避免重複扣款或對不上。
import type { Account, AccountKind, AppData, Transaction } from './types';

/** 算進「剩餘可用金額」的帳戶類型：不含儲蓄、投資（PK 2026-11-07 定案） */
export const SPENDABLE_KINDS: AccountKind[] = ['bank', 'easycard', 'ewallet', 'other'];

export function balanceOf(accountId: string, accounts: Account[], txs: Transaction[]): number {
  const acc = accounts.find((a) => a.id === accountId);
  let b = acc ? acc.initialBalance : 0;
  for (const t of txs) {
    switch (t.type) {
      case 'income':
        if (t.accountId === accountId) b += t.amount;
        break;
      case 'expense':
        // 報帳支出也會扣款（先扣款，之後報帳入帳再加回）
        if (t.accountId === accountId) b -= t.amount;
        break;
      case 'transfer':
        if (t.accountId === accountId) b -= t.amount;
        if (t.toAccountId === accountId) b += t.amount;
        break;
      case 'reimburse_in':
        if (t.toAccountId === accountId) b += t.amount;
        break;
    }
  }
  return b;
}

export function allBalances(data: Pick<AppData, 'accounts' | 'transactions'>): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of data.accounts) m.set(a.id, a.initialBalance);
  const add = (id: string | undefined, v: number) => {
    if (id && m.has(id)) m.set(id, (m.get(id) ?? 0) + v);
  };
  for (const t of data.transactions) {
    if (t.type === 'income') add(t.accountId, t.amount);
    else if (t.type === 'expense') add(t.accountId, -t.amount);
    else if (t.type === 'transfer') {
      add(t.accountId, -t.amount);
      add(t.toAccountId, t.amount);
    } else if (t.type === 'reimburse_in') add(t.toAccountId, t.amount);
  }
  return m;
}

export function spendableTotal(data: Pick<AppData, 'accounts' | 'transactions'>): number {
  const bal = allBalances(data);
  return data.accounts
    .filter((a) => SPENDABLE_KINDS.includes(a.kind))
    .reduce((s, a) => s + (bal.get(a.id) ?? 0), 0);
}

/** 是否算進收支統計：只算一般的 expense、income；報帳支出、轉帳、報帳入帳都不算 */
export function countsInStats(t: Transaction): boolean {
  if (t.type === 'income') return true;
  if (t.type === 'expense') return !t.reimbursable;
  return false;
}

// ---- 日期工具（一律用手機本地時間） ----
const pad = (n: number) => String(n).padStart(2, '0');
export function dayKey(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}
export function monthKey(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`;
}

export interface Totals {
  income: number;
  expense: number;
}

/** 依條件加總收支。accountId 給了就只算該帳戶 */
export function totals(
  txs: Transaction[],
  opt: { month?: string; day?: string; accountId?: string | null },
): Totals {
  const r = { income: 0, expense: 0 };
  for (const t of txs) {
    if (!countsInStats(t)) continue;
    if (opt.accountId && t.accountId !== opt.accountId) continue;
    if (opt.month && monthKey(t.occurredAt) !== opt.month) continue;
    if (opt.day && dayKey(t.occurredAt) !== opt.day) continue;
    if (t.type === 'income') r.income += t.amount;
    else r.expense += t.amount;
  }
  return r;
}

export interface CategorySum {
  categoryId: string;
  amount: number;
  ratio: number;
}

export function categoryBreakdown(
  txs: Transaction[],
  type: 'expense' | 'income',
  month: string,
  accountId: string | null,
): CategorySum[] {
  const m = new Map<string, number>();
  let total = 0;
  for (const t of txs) {
    if (t.type !== type || !countsInStats(t)) continue;
    if (accountId && t.accountId !== accountId) continue;
    if (monthKey(t.occurredAt) !== month) continue;
    const k = t.categoryId ?? '';
    m.set(k, (m.get(k) ?? 0) + t.amount);
    total += t.amount;
  }
  return [...m.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount, ratio: total ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

/** 當月每日收支，回傳長度＝當月天數 */
export function dailySeries(txs: Transaction[], month: string, accountId: string | null): Totals[] {
  const [y, mo] = month.split('-').map(Number);
  const days = new Date(y, mo, 0).getDate();
  const arr: Totals[] = Array.from({ length: days }, () => ({ income: 0, expense: 0 }));
  for (const t of txs) {
    if (!countsInStats(t)) continue;
    if (accountId && t.accountId !== accountId) continue;
    if (monthKey(t.occurredAt) !== month) continue;
    const d = new Date(t.occurredAt).getDate() - 1;
    if (t.type === 'income') arr[d].income += t.amount;
    else arr[d].expense += t.amount;
  }
  return arr;
}

/** 紀錄是否和某帳戶有關（明細篩選用） */
export function touchesAccount(t: Transaction, accountId: string): boolean {
  return t.accountId === accountId || t.toAccountId === accountId;
}

/** 計算機結果存檔前四捨五入到整數元 */
export function roundAmount(v: number): number {
  return Math.round(v);
}
