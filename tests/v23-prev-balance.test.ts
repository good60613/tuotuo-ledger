// 2.3 段4：明細的「記帳前餘額」查表
import { describe, expect, it } from 'vitest';
import { buildPrevBalances, prevBalances, prevBalanceOf } from '../src/data/prevBalance';
import { allBalances } from '../src/data/calc';
import { addTransaction, deleteTransaction, updateTransaction, uid } from '../src/data/ops';
import { markBudgetPaid } from '../src/data/budget';
import { emptyData, sampleData } from '../src/data/seed';
import { exportJson, readBackup } from '../src/data/backup';
import { prevBalanceOn } from '../src/features';
import type { AppData, Transaction } from '../src/data/types';

const at = (d: number, h = 10, m = 0) => new Date(2026, 10, d, h, m).toISOString();

function base(): AppData {
  const d = emptyData();
  d.accounts = [
    { id: 'A', name: '現金', kind: 'bank', initialBalance: 1000, order: 0 },
    { id: 'B', name: '郵局', kind: 'bank', initialBalance: 5000, order: 1 },
  ];
  return d;
}
/** 直接塞一筆（控制建立時間，測同一分鐘的先後） */
function put(d: AppData, t: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'amount' | 'accountId' | 'occurredAt' | 'createdAt'>): AppData {
  return { ...d, transactions: [...d.transactions, { note: '', reimbursable: false, categoryId: 'c-e1', ...t } as Transaction] };
}
const exp = (d: AppData, amount: number, accountId: string, when: string) =>
  addTransaction(d, { type: 'expense', amount, accountId, categoryId: 'c-e1', occurredAt: when });
const prev = (d: AppData, id: string, acc: string) => prevBalanceOf(prevBalances(d), id, acc);

describe('記帳前餘額', () => {
  it('一般支出：顯示扣這筆之前的餘額（現金 1000、支出 700 → 1000）', () => {
    const r = exp(base(), 700, 'A', at(1));
    expect(prev(r.data, r.id, 'A')).toBe(1000);
    // 下一筆接著上一筆扣完的錢
    const r2 = exp(r.data, 100, 'A', at(2));
    expect(prev(r2.data, r2.id, 'A')).toBe(300);
  });

  it('各帳戶各自算，互不影響', () => {
    const r1 = exp(base(), 700, 'A', at(1));
    const r2 = exp(r1.data, 200, 'B', at(2));
    expect(prev(r2.data, r2.id, 'B')).toBe(5000);
    const r3 = exp(r2.data, 50, 'A', at(3));
    expect(prev(r3.data, r3.id, 'A')).toBe(300);
  });

  it('同一分鐘的兩筆：照建立順序，不會亂', () => {
    let d = base();
    d = put(d, { id: 'x1', type: 'expense', amount: 100, accountId: 'A', occurredAt: at(1), createdAt: '2026-11-01T10:00:00.100Z' });
    d = put(d, { id: 'x2', type: 'expense', amount: 300, accountId: 'A', occurredAt: at(1), createdAt: '2026-11-01T10:00:00.200Z' });
    expect(prev(d, 'x1', 'A')).toBe(1000);
    expect(prev(d, 'x2', 'A')).toBe(900);
    // 陣列順序顛倒也一樣（排序不靠陣列順序）
    const swapped = { ...d, transactions: [...d.transactions].reverse() };
    expect(prev(swapped, 'x1', 'A')).toBe(1000);
    expect(prev(swapped, 'x2', 'A')).toBe(900);
  });

  it('轉帳：轉出、轉入兩邊都算，兩邊各自有前餘額', () => {
    const r = addTransaction(base(), { type: 'transfer', amount: 400, accountId: 'A', toAccountId: 'B', occurredAt: at(1) });
    expect(prev(r.data, r.id, 'A')).toBe(1000);
    expect(prev(r.data, r.id, 'B')).toBe(5000);
    const r2 = exp(r.data, 10, 'B', at(2));
    expect(prev(r2.data, r2.id, 'B')).toBe(5400);
    const r3 = exp(r2.data, 10, 'A', at(3));
    expect(prev(r3.data, r3.id, 'A')).toBe(600);
  });

  it('收入、校正都算進去', () => {
    let d = base();
    const inc = addTransaction(d, { type: 'income', amount: 500, accountId: 'A', categoryId: 'c-i1', occurredAt: at(1) });
    d = put(inc.data, { id: 'adj', type: 'adjust', amount: 200, accountId: 'A', adjustDir: 'down', occurredAt: at(2), createdAt: at(2) });
    const e = exp(d, 1, 'A', at(3));
    expect(prev(e.data, inc.id, 'A')).toBe(1000);
    expect(prev(e.data, 'adj', 'A')).toBe(1500);
    expect(prev(e.data, e.id, 'A')).toBe(1300);
  });

  it('修改舊帳：後面每一筆的前餘額跟著變', () => {
    const a = exp(base(), 100, 'A', at(1));
    const b = exp(a.data, 200, 'A', at(2));
    const c = exp(b.data, 300, 'A', at(3));
    expect(prev(c.data, c.id, 'A')).toBe(700);
    const d2 = updateTransaction(c.data, a.id, { type: 'expense', amount: 500, accountId: 'A', categoryId: 'c-e1', occurredAt: at(1) });
    expect(prev(d2, a.id, 'A')).toBe(1000);
    expect(prev(d2, b.id, 'A')).toBe(500);
    expect(prev(d2, c.id, 'A')).toBe(300);
    // 把舊帳改到別的帳戶：原帳戶後面的也跟著回升
    const d3 = updateTransaction(d2, a.id, { type: 'expense', amount: 500, accountId: 'B', categoryId: 'c-e1', occurredAt: at(1) });
    expect(prev(d3, b.id, 'A')).toBe(1000);
    expect(prev(d3, c.id, 'A')).toBe(800);
  });

  it('刪除舊帳：後面每一筆的前餘額跟著變', () => {
    const a = exp(base(), 100, 'A', at(1));
    const b = exp(a.data, 200, 'A', at(2));
    const c = exp(b.data, 300, 'A', at(3));
    const d2 = deleteTransaction(c.data, a.id);
    expect(prev(d2, a.id, 'A')).toBeUndefined();
    expect(prev(d2, b.id, 'A')).toBe(1000);
    expect(prev(d2, c.id, 'A')).toBe(800);
  });

  it('未付預算：不顯示、也不算進去；付款後付款那筆照常算', () => {
    const bud = addTransaction(base(), { type: 'expense', amount: 400, accountId: 'A', categoryId: 'c-e1', occurredAt: at(1), budget: true });
    const e = exp(bud.data, 100, 'A', at(2));
    expect(prev(e.data, bud.id, 'A')).toBeUndefined();
    expect(prev(e.data, e.id, 'A')).toBe(1000); // 預算沒扣帳戶
    const paid = markBudgetPaid(e.data, [{ id: bud.id, amount: 400 }], new Date(2026, 10, 5, 9, 0));
    const pay = paid.transactions.find((t) => t.budgetOfId === bud.id)!;
    expect(prev(paid, pay.id, 'A')).toBe(900);
    // 預算那列本身不動餘額，不顯示
    expect(prev(paid, bud.id, 'A')).toBeUndefined();
  });

  it('先欠不動餘額：不顯示；還朋友錢那筆才扣', () => {
    let d = base();
    d = put(d, { id: 'o1', type: 'owed', amount: 300, accountId: '', owedStatus: 'pending', occurredAt: at(1), createdAt: at(1) });
    d = put(d, { id: 'r1', type: 'owed_repay', amount: 300, accountId: 'A', owedOfId: 'o1', occurredAt: at(2), createdAt: at(2) });
    expect(prev(d, 'o1', '')).toBeUndefined();
    expect(prev(d, 'r1', 'A')).toBe(1000);
  });

  it('每個帳戶最後一筆：前餘額＋這筆的影響＝帳戶現在的餘額（和 allBalances 一致）', () => {
    const d0 = sampleData();
    const t = buildPrevBalances(d0.accounts, d0.transactions);
    const bal = allBalances(d0);
    for (const a of d0.accounts) {
      const last = [...d0.transactions]
        .filter((x) => t.has(`${x.id}|${a.id}`))
        .sort((x, y) => (x.occurredAt + x.createdAt + x.id).localeCompare(y.occurredAt + y.createdAt + y.id))
        .pop();
      if (!last) continue;
      const before = t.get(`${last.id}|${a.id}`)!;
      const delta = (bal.get(a.id) ?? 0) - before;
      const one = allBalances({ accounts: [{ ...a, initialBalance: 0 }], transactions: [last] }).get(a.id) ?? 0;
      expect(delta).toBe(one);
    }
  });

  it('資料沒變就沿用上次算好的表；資料變了才重算', () => {
    const r = exp(base(), 10, 'A', at(1));
    expect(prevBalances(r.data)).toBe(prevBalances(r.data));
    const r2 = exp(r.data, 10, 'A', at(2));
    expect(prevBalances(r2.data)).not.toBe(prevBalances(r.data));
  });

  it('大量紀錄也很快（一次掃完，不是每列往前加總）', () => {
    const d = base();
    const txs: Transaction[] = [];
    for (let i = 0; i < 20000; i++) {
      const w = new Date(2020, 0, 1, 0, i).toISOString();
      txs.push({ id: uid('t'), type: 'expense', amount: 1, accountId: i % 2 ? 'A' : 'B', categoryId: 'c-e1', note: '', occurredAt: w, reimbursable: false, createdAt: w });
    }
    const t0 = Date.now();
    const table = buildPrevBalances(d.accounts, txs);
    expect(table.size).toBe(20000);
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});

describe('開關「明細顯示記帳前餘額」', () => {
  it('預設開；關掉後完整備份、只匯出設定都帶著；舊備份沒有就用預設（開）', () => {
    const d = sampleData();
    expect(prevBalanceOn(d.settings)).toBe(true);
    d.settings = { ...d.settings, showPrevBalance: false };
    for (const type of ['full', 'settings'] as const) {
      expect(prevBalanceOn(readBackup(exportJson(d, type)).data.settings)).toBe(false);
    }
    const { showPrevBalance: _s, ...old } = d.settings;
    expect(prevBalanceOn(readBackup(exportJson({ ...d, settings: old }, 'full')).data.settings)).toBe(true);
  });
});
