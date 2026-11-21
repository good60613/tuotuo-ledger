// 2.3 段5：已付款的預算可以直接編輯，也保留退回未付（含復原）
import { describe, expect, it } from 'vitest';
import { allBalances, spendableTotal, periodKey } from '../src/data/calc';
import { addTransaction, deleteTransaction, updateTransaction, isLocked, isPaidBudget, OpError } from '../src/data/ops';
import { markBudgetPaid, revertBudgetPaid, restoreBudgetPaid, budgetPeriodSummary } from '../src/data/budget';
import { prevBalances, prevBalanceOf } from '../src/data/prevBalance';
import { emptyData } from '../src/data/seed';
import type { AppData } from '../src/data/types';

const NOW = new Date(2026, 10, 8, 12, 0);
const per = periodKey(NOW, 1);

function base(): AppData {
  const d = emptyData();
  d.accounts = [
    { id: 'A', name: '現金', kind: 'bank', initialBalance: 10000, order: 0 },
    { id: 'B', name: '郵局', kind: 'bank', initialBalance: 5000, order: 1 },
  ];
  return d;
}
/** 記一筆 1000 的預算並付款（付款 id＝P1） */
function paid(amount = 1000, payAmount = 1000) {
  const r = addTransaction(base(), { type: 'expense', amount, accountId: 'A', categoryId: 'c-e1', note: '房租', occurredAt: NOW.toISOString(), budget: true });
  const d = markBudgetPaid(r.data, [{ id: r.id, amount: payAmount }], NOW, () => 'P1');
  return { d, id: r.id };
}
const edit = (d: AppData, id: string, over: Partial<{ amount: number; accountId: string; categoryId: string; note: string; occurredAt: string }>) =>
  updateTransaction(d, id, {
    type: 'expense', amount: 1000, accountId: 'A', categoryId: 'c-e1', note: '房租', occurredAt: NOW.toISOString(), budget: true, ...over,
  });
const tx = (d: AppData, id: string) => d.transactions.find((t) => t.id === id)!;

describe('已付預算直接編輯', () => {
  it('不再鎖定', () => {
    const { d, id } = paid();
    expect(isPaidBudget(tx(d, id))).toBe(true);
    expect(isLocked(tx(d, id))).toBe(false);
  });

  it('改金額：帳戶餘額照新金額、預算已用金額跟著變', () => {
    const { d, id } = paid();
    expect(allBalances(d).get('A')).toBe(9000);
    const d2 = edit(d, id, { amount: 800 });
    expect(allBalances(d2).get('A')).toBe(9200);
    expect(tx(d2, 'P1').amount).toBe(800);
    expect(budgetPeriodSummary(d2, per).paid).toBe(800);
    // 預算那列自己的金額（當初圈的 1000）不動
    expect(tx(d2, id).amount).toBe(1000);
    expect(tx(d2, id).budgetStatus).toBe('paid');
    expect(tx(d2, 'P1').budgetOfId).toBe(id);
  });

  it('改帳戶：舊帳戶加回、新帳戶扣款，剩餘可用總數不變', () => {
    const { d, id } = paid();
    const before = spendableTotal(d);
    const d2 = edit(d, id, { accountId: 'B' });
    expect(allBalances(d2).get('A')).toBe(10000);
    expect(allBalances(d2).get('B')).toBe(4000);
    expect(spendableTotal(d2)).toBe(before);
  });

  it('改日期、分類、備註：付款那筆改日期；兩列的分類與備註同步', () => {
    const { d, id } = paid();
    const when = new Date(2026, 10, 3, 9, 0).toISOString();
    const d2 = edit(d, id, { occurredAt: when, categoryId: 'c-e2', note: '十一月房租' });
    expect(tx(d2, 'P1').occurredAt).toBe(when);
    expect(tx(d2, 'P1').categoryId).toBe('c-e2');
    expect(tx(d2, id).categoryId).toBe('c-e2');
    expect(tx(d2, 'P1').note).toBe('十一月房租');
    expect(tx(d2, id).note).toBe('十一月房租');
    // 預算那列的日期（決定它屬於哪一期）不動
    expect(tx(d2, id).occurredAt).toBe(tx(d, id).occurredAt);
  });

  it('編輯付款那一列時，預算那一列的分類與備註也同步', () => {
    const { d, id } = paid();
    const d2 = updateTransaction(d, 'P1', { type: 'expense', amount: 1000, accountId: 'A', categoryId: 'c-e2', note: '改備註', occurredAt: NOW.toISOString() });
    expect(tx(d2, id).categoryId).toBe('c-e2');
    expect(tx(d2, id).note).toBe('改備註');
  });

  it('不能改成別的類型、不能掛報帳；仍然不能直接刪', () => {
    const { d, id } = paid();
    expect(() => updateTransaction(d, id, { type: 'income', amount: 1000, accountId: 'A', categoryId: 'c-i1', occurredAt: NOW.toISOString() })).toThrow(OpError);
    expect(() => updateTransaction(d, id, { type: 'expense', amount: 1000, accountId: 'A', categoryId: 'c-e1', occurredAt: NOW.toISOString(), reimbursable: true })).toThrow(OpError);
    expect(() => deleteTransaction(d, id)).toThrow(OpError);
  });

  it('付款改到小帳戶也可以（和一般記帳一樣）；付款帳戶不存在會被擋', () => {
    const d0 = base();
    d0.accounts.push({ id: 'E', name: '悠遊卡', kind: 'easycard', initialBalance: 100, order: 0 });
    const r = addTransaction(d0, { type: 'expense', amount: 300, accountId: 'A', categoryId: 'c-e1', occurredAt: NOW.toISOString(), budget: true });
    const d = markBudgetPaid(r.data, [{ id: r.id, amount: 300 }], NOW, () => 'P1');
    const d2 = edit(d, r.id, { amount: 300, accountId: 'E' });
    expect(allBalances(d2).get('E')).toBe(-200);
    expect(allBalances(d2).get('A')).toBe(10000);
    expect(() => edit(d, r.id, { amount: 300, accountId: 'ZZ' })).toThrow(OpError);
  });

  it('編輯後，明細的記帳前餘額跟著重算', () => {
    const { d, id } = paid();
    const later = addTransaction(d, { type: 'expense', amount: 10, accountId: 'A', categoryId: 'c-e1', occurredAt: new Date(2026, 10, 9, 9, 0).toISOString() });
    // 付款在 11/8 12:00，之後那筆前餘額＝9000
    expect(prevBalanceOf(prevBalances(later.data), later.id, 'A')).toBe(9000);
    const d2 = edit(later.data, id, { amount: 800 });
    expect(prevBalanceOf(prevBalances(d2), later.id, 'A')).toBe(9200);
    expect(prevBalanceOf(prevBalances(d2), 'P1', 'A')).toBe(10000);
    // 改帳戶後：A 後面的那筆回升，付款那筆在 B 的前餘額＝5000
    const d3 = edit(later.data, id, { accountId: 'B' });
    expect(prevBalanceOf(prevBalances(d3), later.id, 'A')).toBe(10000);
    expect(prevBalanceOf(prevBalances(d3), 'P1', 'B')).toBe(5000);
  });
});

describe('退回未付、再復原', () => {
  it('編輯過金額與帳戶後退回：錢加回對的帳戶、預算回未付；復原：原樣回來', () => {
    const { d, id } = paid();
    const edited = edit(edit(d, id, { amount: 800 }), id, { amount: 800, accountId: 'B' });
    expect(allBalances(edited).get('B')).toBe(4200);
    const pay = tx(edited, 'P1');
    const reverted = revertBudgetPaid(edited, id);
    expect(allBalances(reverted).get('A')).toBe(10000);
    expect(allBalances(reverted).get('B')).toBe(5000);
    expect(tx(reverted, id).budgetStatus).toBe('pending');
    expect(budgetPeriodSummary(reverted, per).paid).toBe(0);
    expect(budgetPeriodSummary(reverted, per).remaining).toBe(1000);
    const restored = restoreBudgetPaid(reverted, id, pay);
    expect(allBalances(restored).get('A')).toBe(10000);
    expect(allBalances(restored).get('B')).toBe(4200);
    expect(tx(restored, id).budgetStatus).toBe('paid');
    expect(tx(restored, id).budgetPaidTxId).toBe('P1');
    expect(budgetPeriodSummary(restored, per).paid).toBe(800);
    expect(spendableTotal(restored)).toBe(spendableTotal(edited));
  });

  it('復原只在預算還是未付時才生效（不會重複扣）', () => {
    const { d, id } = paid();
    const pay = tx(d, 'P1');
    // 還是已付：再放一次不會多一筆
    expect(restoreBudgetPaid(d, id, pay)).toBe(d);
    const reverted = revertBudgetPaid(d, id);
    const once = restoreBudgetPaid(reverted, id, pay);
    expect(restoreBudgetPaid(once, id, pay)).toBe(once);
    expect(allBalances(once).get('A')).toBe(9000);
  });
});
