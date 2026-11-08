// 預算（第四批第 3 段，PK 2026-11-08 定案）。
// - 記預算：帳戶不扣、不算當月支出；剩餘可用扣掉未付預算（見 calc.ts）。
// - 已支付：當天新增一筆真正的支出（金額可改成實際付款金額），帳戶扣款、算當月支出，預算改成已付。
//   只有「未付」的預算能付款，所以同一筆預算不會扣兩次。
// - 退回未付：刪掉付款時新增的那筆支出（錢加回帳戶），預算回到未付。
// - 逾期：預算日期所在的結算期已經結束還沒付，保留並提醒，不自動延期。
// - 只能掛在一般帳戶。
import type { AppData, Transaction } from './types';
import { isPendingBudget, kindLookup, periodKey } from './calc';

export class BudgetError extends Error {}

const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export interface BudgetPay {
  /** 預算紀錄 id */
  id: string;
  /** 實際付款金額（整數元，大於 0） */
  amount: number;
}

/** 整批「已支付」。now＝付款日（當天） */
export function markBudgetPaid(data: AppData, pays: BudgetPay[], now: Date = new Date(), mkId: () => string = newId): AppData {
  if (pays.length === 0) throw new BudgetError('請先選擇預算');
  const ids = new Set(pays.map((p) => p.id));
  if (ids.size !== pays.length) throw new BudgetError('同一筆預算不能重複付款');
  const nowIso = now.toISOString();
  const created: Transaction[] = [];
  const paidMap = new Map<string, string>();
  for (const p of pays) {
    const b = data.transactions.find((t) => t.id === p.id);
    if (!b || !isPendingBudget(b)) throw new BudgetError('只能選未付的預算');
    if (!(p.amount > 0) || !Number.isInteger(p.amount)) throw new BudgetError('付款金額必須大於 0');
    if (!data.accounts.some((a) => a.id === b.accountId)) throw new BudgetError('找不到這筆預算的帳戶');
    const id = mkId();
    created.push({
      id,
      type: 'expense',
      amount: p.amount,
      accountId: b.accountId,
      categoryId: b.categoryId,
      note: b.note,
      occurredAt: nowIso,
      reimbursable: false,
      budgetOfId: b.id,
      createdAt: nowIso,
    });
    paidMap.set(b.id, id);
  }
  return {
    ...data,
    transactions: [
      ...data.transactions.map((t) =>
        paidMap.has(t.id) ? { ...t, budgetStatus: 'paid' as const, budgetPaidTxId: paidMap.get(t.id) } : t,
      ),
      ...created,
    ],
  };
}

/** 退回未付：刪掉付款那筆支出，預算回到未付 */
export function revertBudgetPaid(data: AppData, budgetId: string): AppData {
  const b = data.transactions.find((t) => t.id === budgetId);
  if (!b || !b.budget || b.budgetStatus !== 'paid') throw new BudgetError('這筆預算還沒付款');
  return {
    ...data,
    transactions: data.transactions
      .filter((t) => !(t.budgetOfId === budgetId && t.id === b.budgetPaidTxId))
      .map((t) => (t.id === budgetId ? { ...t, budgetStatus: 'pending' as const, budgetPaidTxId: undefined } : t)),
  };
}

/**
 * 確保預算和付款那筆一定對得上（匯入備份、刪帳戶／分類後都會跑）：
 * - 已付但付款那筆不見了 → 回到未付（避免錢「付了」卻沒扣）
 * - 付款那筆指向的預算不見了 → 變回一般支出
 */
export function normalizeBudgets<T extends Pick<AppData, 'transactions'>>(data: T): T {
  const txs = data.transactions;
  if (!txs.some((t) => t.budget || t.budgetOfId)) return data;
  const byId = new Map(txs.map((t) => [t.id, t]));
  let changed = false;
  const next = txs.map((t) => {
    if (t.budget && t.budgetStatus === 'paid') {
      const p = t.budgetPaidTxId ? byId.get(t.budgetPaidTxId) : undefined;
      if (!p || p.budgetOfId !== t.id) {
        changed = true;
        return { ...t, budgetStatus: 'pending' as const, budgetPaidTxId: undefined };
      }
    }
    if (t.budgetOfId) {
      const b = byId.get(t.budgetOfId);
      if (!b || !b.budget || b.budgetPaidTxId !== t.id) {
        changed = true;
        return { ...t, budgetOfId: undefined };
      }
    }
    return t;
  });
  return changed ? { ...data, transactions: next } : data;
}

/** 逾期：預算日期所在的結算期已經結束還沒付 */
export function isOverdueBudget(t: Transaction, settleDay: number, now: Date = new Date()): boolean {
  return isPendingBudget(t) && periodKey(t.occurredAt, settleDay) < periodKey(now, settleDay);
}

export function pendingBudgets(data: AppData): Transaction[] {
  return data.transactions.filter(isPendingBudget);
}

export function paidBudgets(data: AppData): Transaction[] {
  return data.transactions.filter((t) => t.type === 'expense' && t.budget && t.budgetStatus === 'paid');
}

export function overdueCount(data: AppData, now: Date = new Date()): number {
  return data.transactions.filter((t) => isOverdueBudget(t, data.settings.settleDay, now)).length;
}

/**
 * 統計頁「本期預算：已付 X／還剩 Y」：只看日期在這一期、掛在一般帳戶的預算。
 * 已付＝實際付款金額合計；還剩＝未付預算合計。accountId 給了就只算該帳戶。
 */
export function budgetPeriodSummary(
  data: AppData,
  period: string,
  accountId: string | null = null,
): { paid: number; remaining: number; count: number } {
  const kindOf = kindLookup(data.accounts);
  const byId = new Map(data.transactions.map((t) => [t.id, t]));
  let paid = 0, remaining = 0, count = 0;
  for (const t of data.transactions) {
    if (t.type !== 'expense' || !t.budget) continue;
    if (kindOf(t.accountId) !== 'bank') continue;
    if (accountId && t.accountId !== accountId) continue;
    if (periodKey(t.occurredAt, data.settings.settleDay) !== period) continue;
    count++;
    if (t.budgetStatus === 'paid') paid += byId.get(t.budgetPaidTxId ?? '')?.amount ?? 0;
    else remaining += t.amount;
  }
  return { paid, remaining, count };
}
