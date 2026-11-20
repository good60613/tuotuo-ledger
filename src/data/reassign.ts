// 2.4：首頁把帳戶卡（或小帳戶球）拖到一筆紀錄上＝改那筆的帳戶。
// 一律走 updateTransaction（現有的改紀錄流程），不另寫算法；餘額、預、剩餘可用、本月與今日都由紀錄重算。
import type { AppData, Transaction } from './types';
import { updateTransaction, isLocked, isPaidBudget, isBudgetPayment, OpError, type TxInput } from './ops';

/**
 * 這筆紀錄能不能被拖帳戶來改（不看拖過來的是哪個帳戶）。
 * 可以：一般支出／收入、定期扣款、未結案的報帳與我先付、未付預算、已付預算與預算付款那筆。
 * 不行：轉帳、校正、市值、報帳入帳、朋友付、還朋友錢、投資與儲蓄頁記的、已報帳／已收回。
 */
export function canReassign(t: Transaction): boolean {
  if (t.type !== 'expense' && t.type !== 'income') return false;
  if (t.source) return false;
  if (isLocked(t)) return false;
  return true;
}

/** 實際要改的那一筆：已付款的預算改的是付款那筆（2.3 的規則） */
function realTarget(data: AppData, t: Transaction): Transaction {
  if (isPaidBudget(t)) {
    const pay = data.transactions.find((x) => x.id === t.budgetPaidTxId);
    if (!pay) throw new OpError('找不到這筆預算的付款紀錄');
    return pay;
  }
  return t;
}

/** 這筆目前顯示的帳戶（已付預算看付款那筆） */
export function shownAccountId(data: AppData, t: Transaction): string {
  try {
    return realTarget(data, t).accountId;
  } catch {
    return t.accountId;
  }
}

/**
 * 改帳戶。回傳新資料與「復原用的舊紀錄」（被改到的每一筆原樣）。
 * 帳戶相同回傳 null（不做事）。不能改會丟 OpError。
 */
export function reassignAccount(data: AppData, txId: string, accountId: string): { data: AppData; olds: Transaction[] } | null {
  const t = data.transactions.find((x) => x.id === txId);
  if (!t) throw new OpError('找不到這筆紀錄');
  if (!canReassign(t)) throw new OpError('這筆紀錄不能用拖的改帳戶');
  const tgt = realTarget(data, t);
  if (tgt.accountId === accountId) return null;
  const input: TxInput = {
    type: tgt.type as 'expense' | 'income',
    amount: tgt.amount,
    accountId,
    categoryId: tgt.categoryId,
    note: tgt.note,
    occurredAt: tgt.occurredAt,
    reimbursable: tgt.reimbursable,
    reimburseKind: tgt.reimburseKind,
    budget: isBudgetPayment(tgt) ? false : tgt.budget,
    // 不給算式：金額沒變，updateTransaction 會保留原本的算式
  };
  let next = updateTransaction(data, tgt.id, input);
  // 已付預算：預算那一列不動餘額，帳戶跟著改，畫面才看得出改好了
  const budgetRow = isPaidBudget(t) ? t : isBudgetPayment(tgt) ? data.transactions.find((x) => x.id === tgt.budgetOfId && isPaidBudget(x)) : undefined;
  if (budgetRow) {
    next = { ...next, transactions: next.transactions.map((x) => (x.id === budgetRow.id ? { ...x, accountId } : x)) };
  }
  const changed = new Set([tgt.id, ...(budgetRow ? [budgetRow.id] : [])]);
  return { data: next, olds: data.transactions.filter((x) => changed.has(x.id)) };
}

/** 復原：把舊紀錄原樣放回去（只換掉同 id 的那幾筆） */
export function restoreTxs(data: AppData, olds: Transaction[]): AppData {
  const m = new Map(olds.map((t) => [t.id, t]));
  return { ...data, transactions: data.transactions.map((t) => m.get(t.id) ?? t) };
}
