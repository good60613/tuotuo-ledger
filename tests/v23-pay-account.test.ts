// 2.3 段2：付款確認可以改從哪個帳戶扣
import { describe, expect, it } from 'vitest';
import { allBalances, spendableTotal } from '../src/data/calc';
import { addTransaction } from '../src/data/ops';
import { markBudgetPaid, revertBudgetPaid, BudgetError } from '../src/data/budget';
import { emptyData } from '../src/data/seed';
import type { AppData } from '../src/data/types';

const NOW = new Date(2026, 10, 8, 12, 0);

function base(): AppData {
  const d = emptyData();
  d.accounts = [
    { id: 'A', name: '現金', kind: 'bank', initialBalance: 10000, order: 0 },
    { id: 'B', name: '郵局', kind: 'bank', initialBalance: 5000, order: 1 },
    { id: 'E', name: '悠遊卡', kind: 'easycard', initialBalance: 100, order: 0 },
  ];
  return d;
}
const mk = (d: AppData, amount: number, accountId = 'A') =>
  addTransaction(d, { type: 'expense', amount, accountId, categoryId: 'c-e1', note: '', occurredAt: NOW.toISOString(), budget: true });

describe('付款確認改帳戶', () => {
  it('沒指定帳戶＝預算原本的帳戶', () => {
    const { data, id } = mk(base(), 500);
    const d = markBudgetPaid(data, [{ id, amount: 500 }], NOW);
    expect(allBalances(d).get('A')).toBe(9500);
    expect(allBalances(d).get('B')).toBe(5000);
  });

  it('改從別的帳戶付：新帳戶扣、原帳戶不動', () => {
    const { data, id } = mk(base(), 500);
    const d = markBudgetPaid(data, [{ id, amount: 500, accountId: 'B' }], NOW);
    expect(allBalances(d).get('A')).toBe(10000);
    expect(allBalances(d).get('B')).toBe(4500);
    expect(d.transactions.find((t) => t.budgetOfId === id)!.accountId).toBe('B');
  });

  it('一批裡有的改、有的不改，各扣各的；退回後各自加回', () => {
    const a = mk(base(), 500);
    const b = mk(a.data, 300);
    const d = markBudgetPaid(
      b.data,
      [{ id: a.id, amount: 500, accountId: 'B' }, { id: b.id, amount: 300 }],
      NOW,
    );
    expect(allBalances(d).get('A')).toBe(9700);
    expect(allBalances(d).get('B')).toBe(4500);
    const r = revertBudgetPaid(d, a.id);
    expect(allBalances(r).get('B')).toBe(5000);
    expect(allBalances(r).get('A')).toBe(9700);
  });

  it('找不到的帳戶整批不付', () => {
    const { data, id } = mk(base(), 500);
    expect(() => markBudgetPaid(data, [{ id, amount: 500, accountId: 'ZZ' }], NOW)).toThrow(BudgetError);
  });

  it('剩餘可用：預算消掉、扣到新帳戶，總數一致', () => {
    const { data, id } = mk(base(), 500);
    const before = spendableTotal(data);
    const d = markBudgetPaid(data, [{ id, amount: 500, accountId: 'B' }], NOW);
    expect(spendableTotal(d)).toBe(before);
  });
});
