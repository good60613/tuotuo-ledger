// 明細的「記帳前餘額」（2.3 段4）：每一筆紀錄影響到的帳戶，記這一筆「之前」那個帳戶有多少錢。
//
// 做法（PK 的性能要求）：不在畫每一列時才往前加總。資料有變動時，把全部紀錄按「記帳時間＋建立順序」
// 排好，從頭掃一遍，每個帳戶各自累加，掃到哪一筆就把「掃到之前」的餘額記進查表。列表只查表。
// - 影響餘額的算法與帳戶餘額是同一個函式（calc.ts 的 balanceDeltas）：支出、收入、轉帳（兩邊都算）、
//   報帳入帳、校正、還朋友錢、預算付款那筆支出、先付的支出。
// - 未付的預算、先欠、更新市值不動餘額，查表裡沒有它們（列表就不顯示）。
// - 一樣的時間用建立時間分先後，再不行用 id，所以同一分鐘的兩筆順序固定，不會亂。
// - 資料沒變（紀錄與帳戶清單都沒換）時直接用上次的結果；改舊帳、刪舊帳、匯入、校正都會換掉紀錄清單，自然重算。
import type { Account, AppData, Transaction } from './types';
import { balanceDeltas } from './calc';

export type PrevBalanceTable = Map<string, number>;

const keyOf = (txId: string, accountId: string) => `${txId}|${accountId}`;

/** 記帳先後：記帳時間 → 建立時間 → id */
export function ledgerOrder(a: Transaction, b: Transaction): number {
  return (
    (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0) ||
    (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** 從頭掃一遍，算出每一筆對每個受影響帳戶的「記帳前餘額」 */
export function buildPrevBalances(accounts: Account[], txs: Transaction[]): PrevBalanceTable {
  const running = new Map<string, number>(accounts.map((a) => [a.id, a.initialBalance]));
  const table: PrevBalanceTable = new Map();
  for (const t of [...txs].sort(ledgerOrder)) {
    // 同一筆轉帳兩邊都記；同一個帳戶出現兩次（不該發生）時，後面的接著前面的累加
    for (const [id, v] of balanceDeltas(t)) {
      if (!id || !running.has(id)) continue;
      const before = running.get(id)!;
      if (!table.has(keyOf(t.id, id))) table.set(keyOf(t.id, id), before);
      running.set(id, before + v);
    }
  }
  return table;
}

let cacheTx: Transaction[] | null = null;
let cacheAcc: Account[] | null = null;
let cacheTable: PrevBalanceTable = new Map();

/** 查表（資料沒變就沿用上次算好的） */
export function prevBalances(data: Pick<AppData, 'accounts' | 'transactions'>): PrevBalanceTable {
  if (cacheTx !== data.transactions || cacheAcc !== data.accounts) {
    cacheTable = buildPrevBalances(data.accounts, data.transactions);
    cacheTx = data.transactions;
    cacheAcc = data.accounts;
  }
  return cacheTable;
}

/** 這一筆在某帳戶「記帳前」的餘額；這筆不影響該帳戶餘額（例如未付預算）＝undefined */
export function prevBalanceOf(table: PrevBalanceTable, txId: string, accountId: string | undefined): number | undefined {
  return accountId ? table.get(keyOf(txId, accountId)) : undefined;
}
