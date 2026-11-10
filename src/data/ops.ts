// 所有會改動資料的操作。全部是「舊資料 → 新資料」的純函式，方便單元測試。
import type { Account, AppData, Category, Transaction, TxType } from './types';
import { TX_SOURCE_NO_CATEGORY } from './types';
import { allBalances } from './calc';
import { normalizeBudgets } from './budget';
import { normalizeOwed } from './owed';

export function uid(prefix = ''): string {
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${r}`;
}

export interface TxInput {
  type: Exclude<TxType, 'reimburse_in' | 'adjust' | 'valuation' | 'owed_repay'>;
  amount: number;
  accountId: string;
  toAccountId?: string;
  categoryId?: string;
  note?: string;
  occurredAt: string;
  reimbursable?: boolean;
  /** 預算（只限一般帳戶的支出，和報帳互斥） */
  budget?: boolean;
  /** 我先付（2.0）：reimbursable 為 true 時，'advance'＝我先付、缺值＝報帳 */
  reimburseKind?: 'advance';
  /** 拖拖計算機的算式、標記項次、拆帳群組（見 Transaction） */
  calcExpr?: string;
  calcTerm?: number;
  splitId?: string;
  /** 來源畫面標記（投資、儲蓄的記一筆），見 Transaction.source */
  source?: string;
}

export class OpError extends Error {}

function validate(data: AppData, input: TxInput) {
  if (!(input.amount > 0) || !Number.isInteger(input.amount)) throw new OpError('金額必須大於 0');
  if (input.type === 'owed') {
    // 朋友付：不選帳戶、要分類、不能同時是報帳／我先付／預算
    if (!input.categoryId) throw new OpError('請選分類');
    if (input.reimbursable || input.budget) throw new OpError('朋友付不能同時設成報帳、我先付或預算');
    return;
  }
  if (!data.accounts.some((a) => a.id === input.accountId)) throw new OpError('找不到帳戶');
  if (input.type === 'transfer') {
    if (!input.toAccountId || !data.accounts.some((a) => a.id === input.toAccountId))
      throw new OpError('找不到目的帳戶');
    if (input.toAccountId === input.accountId) throw new OpError('來源和目的不能相同');
  } else if (!input.categoryId && !TX_SOURCE_NO_CATEGORY.includes(input.source ?? '')) throw new OpError('請選分類');
  if (input.budget) {
    if (input.type !== 'expense') throw new OpError('只有支出可以設成預算');
    if (input.reimbursable) throw new OpError('預算和報帳只能選一個');
    if (data.accounts.find((a) => a.id === input.accountId)?.kind !== 'bank') throw new OpError('預算只能掛在一般帳戶');
  }
}

function build(input: TxInput, id: string, createdAt: string): Transaction {
  const isBudget = input.type === 'expense' && !!input.budget;
  const isReimb = input.type === 'expense' && !!input.reimbursable && !isBudget;
  const isOwed = input.type === 'owed';
  return {
    id,
    type: input.type,
    amount: input.amount,
    accountId: isOwed ? '' : input.accountId,
    toAccountId: input.type === 'transfer' ? input.toAccountId : undefined,
    categoryId: input.type === 'transfer' ? undefined : input.categoryId,
    note: input.note ?? '',
    occurredAt: input.occurredAt,
    reimbursable: isReimb,
    reimburseStatus: isReimb ? 'pending' : undefined,
    reimburseKind: isReimb && input.reimburseKind === 'advance' ? 'advance' : undefined,
    owedStatus: isOwed ? 'pending' : undefined,
    calcExpr: input.calcExpr || undefined,
    calcTerm: input.calcTerm,
    splitId: input.splitId,
    budget: isBudget || undefined,
    budgetStatus: isBudget ? 'pending' : undefined,
    source: input.source,
    createdAt,
  };
}

export function addTransaction(data: AppData, input: TxInput, id = uid('t')): { data: AppData; id: string } {
  validate(data, input);
  const tx = build(input, id, new Date().toISOString());
  return {
    id,
    data: {
      ...data,
      transactions: [...data.transactions, tx],
      settings: input.type === 'owed' ? data.settings : { ...data.settings, lastUsedAccountId: input.accountId },
    },
  };
}

/**
 * 一次新增多筆（拖拖計算機拆帳）。全部檢查過才一起存，任何一筆不合格就整批不存，
 * 不會出現「拆一半」的情況。回傳新增的 id（復原時一起刪）。
 */
export function addTransactions(data: AppData, inputs: TxInput[], mkId: () => string = () => uid('t')): { data: AppData; ids: string[] } {
  if (inputs.length === 0) throw new OpError('沒有要記的紀錄');
  for (const i of inputs) validate(data, i);
  const now = new Date().toISOString();
  const ids = inputs.map(() => mkId());
  const txs = inputs.map((i, k) => build(i, ids[k], now));
  const lastAcc = [...inputs].reverse().find((i) => i.type !== 'owed')?.accountId;
  return {
    ids,
    data: {
      ...data,
      transactions: [...data.transactions, ...txs],
      settings: lastAcc ? { ...data.settings, lastUsedAccountId: lastAcc } : data.settings,
    },
  };
}

/** 已報帳（done）、已付（paid）預算的紀錄，金額、帳戶、類型、報帳／預算不能改，要先在待辦頁退回 */
export function isLocked(t: Transaction): boolean {
  return t.reimburseStatus === 'done' || (!!t.budget && t.budgetStatus === 'paid') || (t.type === 'owed' && t.owedStatus === 'paid');
}

/** 預算付款時新增的那筆支出 */
export function isBudgetPayment(t: Transaction): boolean {
  return !!t.budgetOfId;
}

export function updateTransaction(data: AppData, id: string, input: TxInput): AppData {
  const old = data.transactions.find((t) => t.id === id);
  if (!old) throw new OpError('找不到這筆紀錄');
  if (old.type === 'reimburse_in') throw new OpError('報帳入帳請用「退回待報帳」處理');
  if (old.type === 'adjust' || old.type === 'valuation') throw new OpError('調整、市值紀錄不能編輯，只能刪除後重新校正');
  if (old.type === 'owed_repay') throw new OpError('這筆是還朋友的款項，要改請在待辦頁退回未還');
  validate(data, input);
  let next: Transaction;
  if (isLocked(old)) {
    const paidBudget = !!old.budget;
    const paidOwed = old.type === 'owed';
    const sameMark = paidOwed
      ? !input.reimbursable && !input.budget
      : paidBudget
        ? input.budget !== false && !input.reimbursable
        : input.reimbursable !== false && !input.budget && (input.reimburseKind === 'advance') === (old.reimburseKind === 'advance');
    if (
      input.amount !== old.amount ||
      (!paidOwed && input.accountId !== old.accountId) ||
      input.type !== old.type ||
      !sameMark
    )
      throw new OpError(
        paidOwed
          ? '這筆朋友付已還，要改金額請先在待辦頁退回未還'
          : paidBudget
            ? '這筆預算已付款，要改金額或帳戶，請先在待辦頁退回未付'
            : old.reimburseKind === 'advance'
              ? '這筆我先付已收回，要改金額或帳戶，請先在待辦頁退回未收'
              : '這筆已報帳，要改金額或帳戶，請先在待辦頁退回待報帳',
      );
    next = { ...old, categoryId: input.categoryId, note: input.note ?? '', occurredAt: input.occurredAt };
  } else if (isBudgetPayment(old)) {
    // 預算付款那筆：可以改金額、分類、備註、日期、帳戶，但要維持是一般支出
    if (input.type !== 'expense' || input.reimbursable || input.budget)
      throw new OpError('這筆是預算付款，要改類型請先在待辦頁退回未付');
    next = { ...build(input, old.id, old.createdAt), budgetOfId: old.budgetOfId };
  } else {
    next = build(input, old.id, old.createdAt);
    // 編輯時不重新拆帳：拆帳群組保留；金額沒改才保留原本的算式（改了金額，舊算式就對不上了）
    next.splitId = old.splitId;
    if (input.calcExpr === undefined && input.amount === old.amount) {
      next.calcExpr = old.calcExpr;
      next.calcTerm = old.calcTerm;
    }
  }
  return { ...data, transactions: data.transactions.map((t) => (t.id === id ? next : t)) };
}

export function deleteTransaction(data: AppData, id: string): AppData {
  const old = data.transactions.find((t) => t.id === id);
  if (!old) return data;
  if (isLocked(old))
    throw new OpError(
      old.type === 'owed'
        ? '這筆朋友付已還，請先在待辦頁退回未還再刪除'
        : old.budget
          ? '這筆預算已付款，請先在待辦頁退回未付再刪除'
          : old.reimburseKind === 'advance'
            ? '這筆我先付已收回，請先在待辦頁退回未收再刪除'
            : '這筆已報帳，請先在待辦頁退回待報帳再刪除',
    );
  if (old.type === 'owed_repay') throw new OpError('這筆是還朋友的款項，請在待辦頁退回未還');
  if (isBudgetPayment(old)) throw new OpError('這筆是預算付款，請先在待辦頁退回未付再刪除');
  if (old.type === 'reimburse_in') throw new OpError('報帳入帳請用「退回待報帳」處理');
  return { ...data, transactions: data.transactions.filter((t) => t.id !== id) };
}

// ---------------- 報帳 ----------------

/** 依工單規則決定退回帳戶的預設值 */
export function defaultReimburseAccount(data: AppData, txIds: string[]): string | null {
  const pref = data.settings.defaultReimburseAccountId;
  if (pref && data.accounts.some((a) => a.id === pref)) return pref;
  const first = data.transactions.find((t) => t.id === txIds[0]);
  return first?.accountId ?? null;
}

export function markReimbursed(
  data: AppData,
  txIds: string[],
  toAccountId: string,
  now: Date = new Date(),
  batchId = uid('b'),
): AppData {
  const set = new Set(txIds);
  const items = data.transactions.filter((t) => set.has(t.id));
  if (items.length === 0) throw new OpError('請先選擇紀錄');
  if (items.length !== set.size || items.some((t) => t.reimburseStatus !== 'pending'))
    throw new OpError('只能選待報帳的紀錄');
  // 我先付和報帳不能混在同一批（收回的錢來源不同）
  const advance = items[0].reimburseKind === 'advance';
  if (items.some((t) => (t.reimburseKind === 'advance') !== advance)) throw new OpError('我先付和報帳要分開結案');
  if (!data.accounts.some((a) => a.id === toAccountId)) throw new OpError('找不到入帳帳戶');
  const sum = items.reduce((s, t) => s + t.amount, 0);
  const inTx: Transaction = {
    id: uid('t'),
    type: 'reimburse_in',
    amount: sum,
    accountId: toAccountId,
    toAccountId,
    note: advance ? `我先付收回（${items.length} 筆）` : `報帳入帳（${items.length} 筆）`,
    reimburseKind: advance ? 'advance' : undefined,
    occurredAt: now.toISOString(),
    reimbursable: false,
    reimburseBatchId: batchId,
    createdAt: now.toISOString(),
  };
  return {
    ...data,
    transactions: [
      ...data.transactions.map((t) =>
        set.has(t.id) ? { ...t, reimburseStatus: 'done' as const, reimburseBatchId: batchId } : t,
      ),
      inTx,
    ],
  };
}

/** 整批退回待報帳：刪掉該批的報帳入帳（錢從入帳帳戶扣回），紀錄回到待報帳 */
export function revertBatch(data: AppData, batchId: string): AppData {
  return {
    ...data,
    transactions: data.transactions
      .filter((t) => !(t.type === 'reimburse_in' && t.reimburseBatchId === batchId))
      .map((t) =>
        t.reimburseBatchId === batchId
          ? { ...t, reimburseStatus: 'pending' as const, reimburseBatchId: undefined }
          : t,
      ),
  };
}

export function batchItems(data: AppData, batchId: string) {
  const items = data.transactions.filter((t) => t.type === 'expense' && t.reimburseBatchId === batchId);
  const inTx = data.transactions.find((t) => t.type === 'reimburse_in' && t.reimburseBatchId === batchId);
  return { items, inTx };
}

/**
 * 刪除帳戶/分類後，整理報帳批次，確保帳一定對得上：
 * - 入帳那筆沒了 → 剩下的紀錄回到待報帳
 * - 部分紀錄沒了 → 入帳金額改成剩下的合計；全部沒了就刪掉入帳
 */
export function normalizeBatches(data: AppData): AppData {
  let txs = data.transactions;
  const batchIds = new Set(txs.filter((t) => t.reimburseBatchId).map((t) => t.reimburseBatchId!));
  for (const b of batchIds) {
    const items = txs.filter((t) => t.type === 'expense' && t.reimburseBatchId === b);
    const inTx = txs.find((t) => t.type === 'reimburse_in' && t.reimburseBatchId === b);
    if (!inTx) {
      txs = txs.map((t) =>
        t.reimburseBatchId === b ? { ...t, reimburseStatus: 'pending' as const, reimburseBatchId: undefined } : t,
      );
    } else if (items.length === 0) {
      txs = txs.filter((t) => t.id !== inTx.id);
    } else {
      const sum = items.reduce((s, t) => s + t.amount, 0);
      if (sum !== inTx.amount) txs = txs.map((t) => (t.id === inTx.id ? { ...t, amount: sum } : t));
    }
  }
  return { ...data, transactions: txs };
}

// ---------------- 帳戶 ----------------

export function countAccountRecords(data: AppData, accountId: string): number {
  return data.transactions.filter((t) => t.accountId === accountId || t.toAccountId === accountId).length;
}

export type RemoveMode = { mode: 'move'; targetId: string } | { mode: 'deleteRecords' };

export function removeAccount(data: AppData, accountId: string, how: RemoveMode): AppData {
  let txs = data.transactions;
  if (how.mode === 'deleteRecords') {
    txs = txs.filter((t) => t.accountId !== accountId && t.toAccountId !== accountId);
  } else {
    const to = how.targetId;
    if (to === accountId || !data.accounts.some((a) => a.id === to)) throw new OpError('請選另一個帳戶');
    txs = txs
      .map((t) => ({
        ...t,
        accountId: t.accountId === accountId ? to : t.accountId,
        toAccountId: t.toAccountId === accountId ? to : t.toAccountId,
      }))
      // 搬移後變成「自己轉給自己」的轉帳沒有意義，移除
      .filter((t) => !(t.type === 'transfer' && t.accountId === t.toAccountId));
    if (data.accounts.find((a) => a.id === accountId)) {
      // 被刪帳戶的初始餘額一併併入目標帳戶，總額不變
      const src = data.accounts.find((a) => a.id === accountId)!;
      data = {
        ...data,
        accounts: data.accounts.map((a) =>
          a.id === to ? { ...a, initialBalance: a.initialBalance + src.initialBalance } : a,
        ),
      };
    }
  }
  const settings = { ...data.settings };
  if (settings.defaultReimburseAccountId === accountId) settings.defaultReimburseAccountId = null;
  if (settings.lastUsedAccountId === accountId) settings.lastUsedAccountId = null;
  return normalizeOwed(normalizeBudgets(normalizeBatches({
    ...data,
    settings,
    accounts: data.accounts.filter((a) => a.id !== accountId),
    transactions: txs,
  })));
}

export function upsertAccount(data: AppData, acc: Account): AppData {
  const exists = data.accounts.some((a) => a.id === acc.id);
  return {
    ...data,
    accounts: exists ? data.accounts.map((a) => (a.id === acc.id ? acc : a)) : [...data.accounts, acc],
  };
}

// ---------------- 分類 ----------------

export function countCategoryRecords(data: AppData, categoryId: string): number {
  return data.transactions.filter((t) => t.categoryId === categoryId).length;
}

export function removeCategory(data: AppData, categoryId: string, how: RemoveMode): AppData {
  let txs = data.transactions;
  if (how.mode === 'deleteRecords') {
    txs = txs.filter((t) => t.categoryId !== categoryId);
  } else {
    const src = data.categories.find((c) => c.id === categoryId);
    const dst = data.categories.find((c) => c.id === how.targetId);
    if (!dst || dst.id === categoryId || dst.type !== src?.type) throw new OpError('請選同類型的另一個分類');
    txs = txs.map((t) => (t.categoryId === categoryId ? { ...t, categoryId: dst.id } : t));
  }
  return normalizeOwed(normalizeBudgets(normalizeBatches({
    ...data,
    categories: data.categories.filter((c) => c.id !== categoryId),
    transactions: txs,
  })));
}

export function upsertCategory(data: AppData, cat: Category): AppData {
  const exists = data.categories.some((c) => c.id === cat.id);
  return {
    ...data,
    categories: exists ? data.categories.map((c) => (c.id === cat.id ? cat : c)) : [...data.categories, cat],
  };
}

/** 依給定順序重設 order 欄位 */
export function reorder<T extends { id: string; order: number }>(list: T[], ids: string[]): T[] {
  return list.map((x) => {
    const i = ids.indexOf(x.id);
    return i >= 0 ? { ...x, order: i } : x;
  });
}

export const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

// ---------------- 小帳戶：校正、投資、儲蓄 ----------------

/**
 * 校正：輸入實際餘額，差額自動產生一筆「調整」紀錄（不算主帳收支）。
 * 差額為 0 時不產生紀錄，回傳原資料。投資標的請用 updateMarketValue。
 */
export function calibrate(
  data: AppData,
  accountId: string,
  actual: number,
  now: Date = new Date(),
  id = uid('t'),
): AppData {
  const acc = data.accounts.find((a) => a.id === accountId);
  if (!acc) throw new OpError('找不到帳戶');
  if (acc.kind === 'invest' && acc.subtype === 'holding') throw new OpError('投資標的請用「更新市值」');
  if (!Number.isInteger(actual)) throw new OpError('金額必須是整數');
  const diff = actual - (allBalances(data).get(accountId) ?? 0);
  if (diff === 0) return data;
  const at = now.toISOString();
  const tx: Transaction = {
    id,
    type: 'adjust',
    amount: Math.abs(diff),
    adjustDir: diff > 0 ? 'up' : 'down',
    accountId,
    note: '',
    occurredAt: at,
    reimbursable: false,
    createdAt: at,
  };
  return { ...data, transactions: [...data.transactions, tx] };
}

/**
 * 設定頁「修改帳戶」（第三批第 2 項）：名稱、目標等照改；初始餘額一律不動。
 * current＝使用者填的「目前金額」（null＝不改，例如投資標的）。和帳上不同時，差額自動產生一筆「調整」。
 * 小數四捨五入到整數元。
 */
export function editAccount(data: AppData, acc: Account, current: number | null, now: Date = new Date(), id = uid('t')): AppData {
  const old = data.accounts.find((a) => a.id === acc.id);
  if (!old) throw new OpError('找不到帳戶');
  let next = upsertAccount(data, { ...acc, initialBalance: old.initialBalance });
  if (current !== null) {
    if (!Number.isFinite(current)) throw new OpError('請輸入金額');
    next = calibrate(next, acc.id, Math.round(current), now, id);
  }
  return next;
}

/** 投資標的「更新市值」：記下現值，損益由 holdingStats 推算（不算主帳收支） */
export function updateMarketValue(
  data: AppData,
  holdingId: string,
  value: number,
  now: Date = new Date(),
  id = uid('t'),
): AppData {
  const acc = data.accounts.find((a) => a.id === holdingId);
  if (!acc || acc.kind !== 'invest' || acc.subtype !== 'holding') throw new OpError('找不到投資標的');
  if (!(value >= 0) || !Number.isInteger(value)) throw new OpError('現值必須是 0 以上的整數');
  const at = now.toISOString();
  const tx: Transaction = {
    id,
    type: 'valuation',
    amount: value,
    accountId: holdingId,
    note: '',
    occurredAt: at,
    reimbursable: false,
    createdAt: at,
  };
  return { ...data, transactions: [...data.transactions, tx] };
}

/** 投資的「待投入」帳戶（固定一個） */
export function investCashAccount(data: AppData): Account | undefined {
  return data.accounts.find((a) => a.kind === 'invest' && a.subtype !== 'holding');
}

/** 投資標的，照排序 */
export const holdings = (data: AppData) =>
  data.accounts.filter((a) => a.kind === 'invest' && a.subtype === 'holding').sort(byOrder);

/** 儲蓄目標，照畫面由上到下（order 小→大；越下面越必要） */
export const savingGoals = (data: AppData) => data.accounts.filter((a) => a.kind === 'saving').sort(byOrder);

/** 從首頁拖到小帳戶球時，預設的目的帳戶 */
export function ballDropTarget(data: AppData, kind: Account['kind']): Account | undefined {
  if (kind === 'invest') return investCashAccount(data);
  if (kind === 'saving') {
    const g = savingGoals(data);
    return g[g.length - 1]; // 最下面（最必要）的目標
  }
  return data.accounts.filter((a) => a.kind === kind).sort(byOrder)[0];
}

/** 新分類的排序：排在同類型最後（用最大值＋1，刪除過分類也不會撞號） */
export function nextCategoryOrder(data: AppData, type: Category['type']): number {
  return Math.max(-1, ...data.categories.filter((c) => c.type === type).map((c) => c.order)) + 1;
}
