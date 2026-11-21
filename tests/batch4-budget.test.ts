// 第四批第 3 段：預算的錢怎麼算、資料 v4、舊備份匯入。
import { describe, expect, it } from 'vitest';
import { allBalances, spendableTotal, totals, pendingBudgetByAccount, pendingBudgetTotal, periodKey, categoryBreakdown } from '../src/data/calc';
import { addTransaction, deleteTransaction, updateTransaction, removeAccount, OpError } from '../src/data/ops';
import { markBudgetPaid, revertBudgetPaid, isOverdueBudget, overdueCount, budgetPeriodSummary, BudgetError } from '../src/data/budget';
import { emptyData } from '../src/data/seed';
import { legacySampleData as sampleData } from './fixtures/legacySample';
import { exportJson, parseBackup } from '../src/data/backup';
import { migrate } from '../src/data/migrate';
import { DATA_VERSION, type AppData } from '../src/data/types';

const NOW = new Date(2026, 10, 8, 12, 0); // 2026-11-08
const iso = (m0: number, d: number) => new Date(2026, m0, d, 10).toISOString();

function base(): AppData {
  const d = emptyData();
  d.accounts = [
    { id: 'A', name: '薪轉', kind: 'bank', initialBalance: 10000, order: 0 },
    { id: 'B', name: '郵局', kind: 'bank', initialBalance: 5000, order: 1 },
    { id: 'E', name: '悠遊卡', kind: 'easycard', initialBalance: 100, order: 0 },
  ];
  return d;
}
const budget = (d: AppData, amount = 1000, accountId = 'A', at = NOW.toISOString()) =>
  addTransaction(d, { type: 'expense', amount, accountId, categoryId: 'c-e1', note: '房租', occurredAt: at, budget: true });
const per = periodKey(NOW, 1);
const tx = (d: AppData, id: string) => d.transactions.find((t) => t.id === id);

describe('記預算', () => {
  it('帳戶不扣、剩餘可用扣掉、不算當月支出、卡片顯示預算', () => {
    const { data: d } = budget(base());
    expect(allBalances(d).get('A')).toBe(10000);
    expect(spendableTotal(d)).toBe(15000 - 1000);
    expect(totals(d, { period: per }).expense).toBe(0);
    expect(categoryBreakdown(d, 'expense', per, null)).toEqual([]);
    expect(pendingBudgetByAccount(d).get('A')).toBe(1000);
    expect(pendingBudgetTotal(d)).toBe(1000);
  });

  it('只能掛在一般帳戶、只能是支出、不能同時是報帳', () => {
    expect(() => budget(base(), 100, 'E')).toThrow(OpError);
    expect(() =>
      addTransaction(base(), { type: 'income', amount: 1, accountId: 'A', categoryId: 'c-i1', occurredAt: NOW.toISOString(), budget: true }),
    ).toThrow(OpError);
    expect(() =>
      addTransaction(base(), { type: 'expense', amount: 1, accountId: 'A', categoryId: 'c-e1', occurredAt: NOW.toISOString(), budget: true, reimbursable: true }),
    ).toThrow(OpError);
  });

  it('未付的預算可以編輯；取消預算就變一般支出（開始扣款）', () => {
    const { data: d0, id } = budget(base());
    const d = updateTransaction(d0, id, { type: 'expense', amount: 1000, accountId: 'A', categoryId: 'c-e1', occurredAt: NOW.toISOString(), budget: false });
    expect(allBalances(d).get('A')).toBe(9000);
    expect(spendableTotal(d)).toBe(14000);
    expect(pendingBudgetTotal(d)).toBe(0);
  });
});

describe('已支付', () => {
  it('當天新增真正支出：帳戶扣款、計入當月支出、預算消掉，剩餘可用不會重複扣', () => {
    const { data: d0, id } = budget(base(), 1000, 'A', iso(10, 2));
    const d = markBudgetPaid(d0, [{ id, amount: 1000 }], NOW, () => 'P1');
    expect(allBalances(d).get('A')).toBe(9000);
    expect(spendableTotal(d)).toBe(14000); // 付款前 14000，付款後還是 14000
    expect(totals(d, { period: per }).expense).toBe(1000);
    expect(pendingBudgetTotal(d)).toBe(0);
    const pay = tx(d, 'P1');
    expect(pay?.occurredAt).toBe(NOW.toISOString());
    expect(pay?.budgetOfId).toBe(id);
    expect(pay?.note).toBe('房租');
  });

  it('實際金額不同：帳戶依實際金額扣（預算 1000 實付 980）', () => {
    const { data: d0, id } = budget(base());
    const d = markBudgetPaid(d0, [{ id, amount: 980 }], NOW);
    expect(allBalances(d).get('A')).toBe(9020);
    expect(spendableTotal(d)).toBe(14020);
    expect(totals(d, { period: per }).expense).toBe(980);
  });

  it('不可重複扣款：已付的預算再付一次會被擋', () => {
    const { data: d0, id } = budget(base());
    const d = markBudgetPaid(d0, [{ id, amount: 1000 }], NOW);
    expect(() => markBudgetPaid(d, [{ id, amount: 1000 }], NOW)).toThrow(BudgetError);
    expect(() => markBudgetPaid(d0, [{ id, amount: 1000 }, { id, amount: 1000 }], NOW)).toThrow(BudgetError);
    expect(() => markBudgetPaid(d0, [{ id, amount: 0 }], NOW)).toThrow(BudgetError);
  });

  it('整批付款：兩個帳戶各自扣', () => {
    let d = base();
    const a = budget(d, 1000, 'A');
    d = a.data;
    const b = budget(d, 300, 'B');
    d = b.data;
    d = markBudgetPaid(d, [{ id: a.id, amount: 1000 }, { id: b.id, amount: 300 }], NOW);
    expect(allBalances(d).get('A')).toBe(9000);
    expect(allBalances(d).get('B')).toBe(4700);
    expect(totals(d, { period: per }).expense).toBe(1300);
  });

  it('已付的預算（2.3 起可直接編輯）：改的是付款那筆；類型不能改、不能刪；付款那筆不能直接刪', () => {
    const { data: d0, id } = budget(base());
    const d = markBudgetPaid(d0, [{ id, amount: 1000 }], NOW, () => 'P1');
    // 2.3：改金額 → 改到付款那筆，不再擋
    const dAmt = updateTransaction(d, id, { type: 'expense', amount: 500, accountId: 'A', categoryId: 'c-e1', occurredAt: NOW.toISOString(), budget: true });
    expect(tx(dAmt, 'P1')?.amount).toBe(500);
    expect(() =>
      updateTransaction(d, id, { type: 'income', amount: 500, accountId: 'A', categoryId: 'c-i1', occurredAt: NOW.toISOString() }),
    ).toThrow(OpError);
    expect(() => deleteTransaction(d, id)).toThrow(OpError);
    expect(() => deleteTransaction(d, 'P1')).toThrow(OpError);
    // 備註、分類可以改
    const d2 = updateTransaction(d, id, { type: 'expense', amount: 1000, accountId: 'A', categoryId: 'c-e2', note: '十一月房租', occurredAt: NOW.toISOString(), budget: true });
    expect(tx(d2, id)?.note).toBe('十一月房租');
    expect(tx(d2, id)?.budgetStatus).toBe('paid');
    // 付款那筆可以改金額，連結保留
    const d3 = updateTransaction(d, 'P1', { type: 'expense', amount: 990, accountId: 'A', categoryId: 'c-e1', occurredAt: NOW.toISOString() });
    expect(tx(d3, 'P1')?.budgetOfId).toBe(id);
    expect(allBalances(d3).get('A')).toBe(9010);
    expect(() =>
      updateTransaction(d, 'P1', { type: 'expense', amount: 990, accountId: 'A', categoryId: 'c-e1', occurredAt: NOW.toISOString(), reimbursable: true }),
    ).toThrow(OpError);
  });

  it('退回未付：付款那筆刪掉、錢加回、預算回到未付', () => {
    const { data: d0, id } = budget(base());
    const d = revertBudgetPaid(markBudgetPaid(d0, [{ id, amount: 1000 }], NOW), id);
    expect(d.transactions.length).toBe(1);
    expect(allBalances(d).get('A')).toBe(10000);
    expect(spendableTotal(d)).toBe(14000);
    expect(() => revertBudgetPaid(d, id)).toThrow(BudgetError);
  });
});

describe('逾期與統計', () => {
  it('結算期結束還沒付＝逾期，保留不延期', () => {
    const { data: d } = budget(base(), 1000, 'A', iso(9, 20)); // 10/20
    const b = d.transactions[0];
    expect(isOverdueBudget(b, 1, NOW)).toBe(true);
    expect(isOverdueBudget(b, 1, new Date(2026, 9, 31))).toBe(false);
    expect(overdueCount(d, NOW)).toBe(1);
    expect(b.occurredAt).toBe(iso(9, 20));
  });

  it('本期預算：已付（實際金額）／還剩', () => {
    let d = base();
    const a = budget(d, 1000);
    d = a.data;
    d = budget(d, 500, 'B').data;
    d = budget(d, 700, 'A', iso(9, 3)).data; // 上一期，不算
    d = markBudgetPaid(d, [{ id: a.id, amount: 980 }], NOW);
    expect(budgetPeriodSummary(d, per)).toEqual({ paid: 980, remaining: 500, count: 2 });
    expect(budgetPeriodSummary(d, per, 'B')).toEqual({ paid: 0, remaining: 500, count: 1 });
  });
});

describe('資料 v4 與備份', () => {
  it('v4 備份匯出再匯入，預算狀態與連結都保留', () => {
    let d = base();
    const a = budget(d);
    d = a.data;
    d = markBudgetPaid(d, [{ id: a.id, amount: 990 }], NOW);
    d = budget(d, 200, 'B').data;
    const back = parseBackup(exportJson(d));
    expect(back.version).toBe(DATA_VERSION);
    expect(spendableTotal(back)).toBe(spendableTotal(d));
    expect(allBalances(back)).toEqual(allBalances(d));
    expect(JSON.parse(JSON.stringify(back.transactions))).toEqual(JSON.parse(JSON.stringify(d.transactions)));
  });

  it('舊 v3 備份（沒有預算欄位）照常匯入，金額不變', () => {
    const v3 = { ...sampleData(), version: 3 };
    const before = spendableTotal(v3 as unknown as AppData);
    const d = parseBackup(JSON.stringify(v3));
    expect(d.version).toBe(DATA_VERSION);
    expect(spendableTotal(d)).toBe(before);
    expect(d.transactions.every((t) => !t.budget)).toBe(true);
  });

  it('手動改壞的備份：已付卻找不到付款那筆 → 回到未付；預算同時是報帳 → 以預算為準', () => {
    const d = base();
    const at = NOW.toISOString();
    d.transactions = [
      { id: 'X', type: 'expense', amount: 100, accountId: 'A', categoryId: 'c-e1', note: '', occurredAt: at, reimbursable: false, budget: true, budgetStatus: 'paid', budgetPaidTxId: 'gone', createdAt: at },
      { id: 'Y', type: 'expense', amount: 50, accountId: 'A', categoryId: 'c-e1', note: '', occurredAt: at, reimbursable: true, reimburseStatus: 'pending', budget: true, createdAt: at },
      { id: 'Z', type: 'expense', amount: 30, accountId: 'A', categoryId: 'c-e1', note: '', occurredAt: at, reimbursable: false, budgetOfId: 'nope', createdAt: at },
    ];
    const m = migrate(JSON.parse(JSON.stringify(d)));
    expect(m.transactions[0].budgetStatus).toBe('pending');
    expect(m.transactions[1]).toMatchObject({ budget: true, budgetStatus: 'pending', reimbursable: false });
    expect(m.transactions[2].budgetOfId).toBeUndefined();
    expect(allBalances(m).get('A')).toBe(10000 - 30);
    expect(spendableTotal(m)).toBe(15000 - 30 - 150);
  });

  it('付款那筆跟著帳戶被刪掉後，預算回到未付', () => {
    let d = base();
    const a = budget(d, 1000, 'A');
    d = a.data;
    d = markBudgetPaid(d, [{ id: a.id, amount: 1000 }], NOW, () => 'P1');
    d = updateTransaction(d, 'P1', { type: 'expense', amount: 1000, accountId: 'B', categoryId: 'c-e1', occurredAt: NOW.toISOString() });
    d = removeAccount(d, 'B', { mode: 'deleteRecords' });
    expect(tx(d, a.id)?.budgetStatus).toBe('pending');
    expect(spendableTotal(d)).toBe(10000 - 1000);
  });
});
