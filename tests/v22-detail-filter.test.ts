import { describe, it, expect } from 'vitest';
import { matchType, matchSearch } from '../src/detailFilter';
import { sampleData } from '../src/data/seed';
import type { Transaction } from '../src/data/types';

const base: Transaction = { id: 'x', type: 'expense', amount: 100, accountId: 'a', note: '', occurredAt: '2026-11-05T10:00:00', reimbursable: false };
const tx = (p: Partial<Transaction>): Transaction => ({ ...base, ...p });

describe('2.2 明細類型篩選', () => {
  it('一般支出不含報帳、先付、預算', () => {
    expect(matchType(tx({}), 'expense')).toBe(true);
    expect(matchType(tx({ reimbursable: true }), 'expense')).toBe(false);
    expect(matchType(tx({ budget: true }), 'expense')).toBe(false);
  });
  it('報帳和先付分開，收回那筆跟著各自的類型', () => {
    expect(matchType(tx({ reimbursable: true }), 'reimb')).toBe(true);
    expect(matchType(tx({ reimbursable: true, reimburseKind: 'advance' }), 'reimb')).toBe(false);
    expect(matchType(tx({ reimbursable: true, reimburseKind: 'advance' }), 'advance')).toBe(true);
    expect(matchType(tx({ type: 'reimburse_in', reimburseKind: 'advance' }), 'advance')).toBe(true);
    expect(matchType(tx({ type: 'reimburse_in' }), 'reimb')).toBe(true);
  });
  it('先欠含還朋友錢、預算含付款那筆', () => {
    expect(matchType(tx({ type: 'owed' }), 'owed')).toBe(true);
    expect(matchType(tx({ type: 'owed_repay' }), 'owed')).toBe(true);
    expect(matchType(tx({ budgetOfId: 'b' }), 'budget')).toBe(true);
  });
});

describe('2.2 明細搜尋', () => {
  const d = sampleData();
  const cat = d.categories[0];
  it('搜備註與分類名稱，不分大小寫', () => {
    expect(matchSearch(d, tx({ note: 'Starbucks 拿鐵' }), 'starbucks')).toBe(true);
    expect(matchSearch(d, tx({ categoryId: cat.id }), cat.name)).toBe(true);
    expect(matchSearch(d, tx({ note: '午餐' }), '晚餐')).toBe(false);
  });
  it('沒有分類的轉帳不會因「已刪除」字樣被搜到', () => {
    expect(matchSearch(d, tx({ type: 'transfer' }), '刪除')).toBe(false);
  });
});
