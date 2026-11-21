// 2.5 段D：記帳預設帳戶、上一筆帳戶只記記帳頁的紀錄、長按刪除後復原
import { describe, expect, it } from 'vitest';
import { addTransaction } from '../src/data/ops';
import { entryAccountMode } from '../src/features';
import { deleteMany, restoreDeleted } from '../src/data/txMove';
import { allBalances } from '../src/data/calc';
import { emptyData } from '../src/data/seed';
import type { AppData } from '../src/data/types';

const iso = new Date(2026, 10, 20, 12).toISOString();
function base(): AppData {
  const d = emptyData();
  d.accounts = [
    { id: 'A', name: '現金', kind: 'bank', initialBalance: 1000, order: 0 },
    { id: 'B', name: '郵局', kind: 'bank', initialBalance: 1000, order: 1 },
    { id: 'G', name: '旅行', kind: 'saving', initialBalance: 0, order: 0 },
  ];
  return d;
}

describe('記帳預設帳戶', () => {
  it('缺值＝上一筆用的帳戶', () => {
    expect(entryAccountMode(undefined)).toBe('last');
    expect(entryAccountMode({ entryAccount: 'first' })).toBe('first');
  });

  it('記帳頁記的會更新上一筆帳戶；儲蓄、投資子畫面記的不會', () => {
    let d = addTransaction(base(), { type: 'expense', amount: 10, accountId: 'B', categoryId: 'c-e1', occurredAt: iso }).data;
    expect(d.settings.lastUsedAccountId).toBe('B');
    d = addTransaction(d, { type: 'transfer', amount: 10, accountId: 'G', toAccountId: 'A', occurredAt: iso, source: 'saving-out' }).data;
    expect(d.settings.lastUsedAccountId).toBe('B');
  });

  it('長按刪除剛記的拆帳兩筆，再復原：餘額回到記完的樣子', () => {
    let d = base();
    const r1 = addTransaction(d, { type: 'expense', amount: 100, accountId: 'A', categoryId: 'c-e1', occurredAt: iso, splitId: 's' });
    const r2 = addTransaction(r1.data, { type: 'expense', amount: 50, accountId: 'A', categoryId: 'c-e1', occurredAt: iso, splitId: 's', reimbursable: true });
    d = r2.data;
    const del = deleteMany(d, [r1.id, r2.id]);
    expect(allBalances(del.data).get('A')).toBe(1000);
    const back = restoreDeleted(del.data, del.deleted);
    expect(allBalances(back).get('A')).toBe(850);
    expect(back.transactions.find((t) => t.id === r2.id)?.reimbursable).toBe(true);
  });
});
