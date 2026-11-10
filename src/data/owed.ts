// 朋友付（2.0 第一批；補強批 2026-11-10 PK 改算法）：別人先幫我付，之後我要還。
// - 記朋友付：不選帳戶、任何帳戶都不動；本月／今日支出不算；剩餘可用扣掉未還的。
// - 還錢：選從哪個帳戶付（任何帳戶都可以，包括悠遊卡、電子錢包），新增一筆 owed_repay 扣款，
//   用一般帳戶還＝還錢當天算一筆支出；用小帳戶還＝小帳戶內消費，不算主帳（儲值時算過，不重複）。
//   朋友付改成已還，剩餘可用不再變動（一般帳戶付：帳戶少 600、未還朋友錢也少 600）。
//   用小帳戶付時一般帳戶不用再預留這筆，剩餘可用變多是對的（PK 定案）。
// - 退回未還：刪掉還款那筆（錢加回帳戶），朋友付回到未還。
import type { AppData, Transaction } from './types';
import { isPendingOwed, OWED_REPAY_KINDS } from './calc';
import type { Account } from './types';

/** 可以用來還朋友錢的帳戶（還款畫面只列這些） */
export const owedRepayAccounts = (data: AppData): Account[] => data.accounts.filter((a) => OWED_REPAY_KINDS.includes(a.kind));

export class OwedError extends Error {}

const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** 整批還錢：同一個帳戶付。每筆朋友付各自產生一筆還款紀錄（金額＝朋友付金額） */
export function markOwedPaid(
  data: AppData,
  owedIds: string[],
  accountId: string,
  now: Date = new Date(),
  mkId: () => string = newId,
): AppData {
  if (owedIds.length === 0) throw new OwedError('請先選擇朋友付紀錄');
  if (new Set(owedIds).size !== owedIds.length) throw new OwedError('同一筆不能重複還');
  const acc = data.accounts.find((a) => a.id === accountId);
  if (!acc) throw new OwedError('找不到付款帳戶');
  if (!OWED_REPAY_KINDS.includes(acc.kind)) throw new OwedError('這個帳戶不能還款，請先轉到一般帳戶');
  const nowIso = now.toISOString();
  const paid = new Map<string, string>();
  const created: Transaction[] = [];
  for (const id of owedIds) {
    const o = data.transactions.find((t) => t.id === id);
    if (!o || !isPendingOwed(o)) throw new OwedError('只能選還沒還的朋友付');
    const rid = mkId();
    created.push({
      id: rid,
      type: 'owed_repay',
      amount: o.amount,
      accountId,
      categoryId: o.categoryId,
      note: o.note,
      occurredAt: nowIso,
      reimbursable: false,
      owedOfId: o.id,
      createdAt: nowIso,
    });
    paid.set(o.id, rid);
  }
  return {
    ...data,
    transactions: [
      ...data.transactions.map((t) =>
        paid.has(t.id) ? { ...t, owedStatus: 'paid' as const, owedPaidTxId: paid.get(t.id) } : t,
      ),
      ...created,
    ],
  };
}

/** 退回未還：刪掉還款那筆，朋友付回到未還 */
export function revertOwedPaid(data: AppData, owedId: string): AppData {
  const o = data.transactions.find((t) => t.id === owedId);
  if (!o || o.type !== 'owed' || o.owedStatus !== 'paid') throw new OwedError('這筆朋友付還沒還');
  return {
    ...data,
    transactions: data.transactions
      .filter((t) => !(t.type === 'owed_repay' && t.owedOfId === owedId))
      .map((t) => (t.id === owedId ? { ...t, owedStatus: 'pending' as const, owedPaidTxId: undefined } : t)),
  };
}

/**
 * 確保朋友付和還款對得上（匯入備份、刪帳戶後都會跑）：
 * - 朋友付欄位缺漏：帳戶清空、狀態補「未還」，拿掉不該有的報帳／預算標記
 * - 已還但還款那筆不見了 → 回到未還（避免「還了」卻沒扣錢）
 * - 還款那筆找不到對應的已還朋友錢 → 刪掉還款（避免重複扣錢；朋友付本身仍在待辦）
 */
export function normalizeOwed<T extends Pick<AppData, 'transactions'>>(data: T): T {
  const txs = data.transactions;
  if (!txs.some((t) => t.type === 'owed' || t.type === 'owed_repay')) return data;
  const byId = new Map(txs.map((t) => [t.id, t]));
  let changed = false;
  const next: Transaction[] = [];
  for (const t of txs) {
    if (t.type === 'owed') {
      let o = t;
      if (o.accountId !== '' || o.reimbursable || o.budget || (o.owedStatus !== 'pending' && o.owedStatus !== 'paid')) {
        o = {
          ...o,
          accountId: '',
          toAccountId: undefined,
          reimbursable: false,
          reimburseStatus: undefined,
          reimburseBatchId: undefined,
          reimburseKind: undefined,
          budget: undefined,
          budgetStatus: undefined,
          budgetPaidTxId: undefined,
          owedStatus: o.owedStatus === 'paid' ? 'paid' : 'pending',
        };
      }
      if (o.owedStatus === 'paid') {
        const r = o.owedPaidTxId ? byId.get(o.owedPaidTxId) : undefined;
        if (!r || r.type !== 'owed_repay' || r.owedOfId !== o.id) o = { ...o, owedStatus: 'pending', owedPaidTxId: undefined };
      } else if (o.owedPaidTxId) o = { ...o, owedPaidTxId: undefined };
      if (o !== t) changed = true;
      next.push(o);
    } else if (t.type === 'owed_repay') {
      const o = t.owedOfId ? byId.get(t.owedOfId) : undefined;
      if (!o || o.type !== 'owed' || o.owedStatus !== 'paid' || o.owedPaidTxId !== t.id) {
        changed = true;
        continue;
      }
      next.push(t);
    } else next.push(t);
  }
  return changed ? { ...data, transactions: next } : data;
}

export function pendingOwed(data: AppData): Transaction[] {
  return data.transactions.filter(isPendingOwed);
}

export function paidOwed(data: AppData): Transaction[] {
  return data.transactions.filter((t) => t.type === 'owed' && t.owedStatus === 'paid');
}
