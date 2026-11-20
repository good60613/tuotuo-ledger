// 2.5 段A、B：儲蓄轉移（一般轉帳）、儲蓄存入／取出可編輯並保留來源標記
import { describe, expect, it } from 'vitest';
import { allBalances } from '../src/data/calc';
import { addTransaction, updateTransaction } from '../src/data/ops';
import { isSavingTransfer } from '../src/actions';
import { emptyData } from '../src/data/seed';
import type { AppData } from '../src/data/types';

const iso = new Date(2026, 10, 20, 12).toISOString();
function base(): AppData {
  const d = emptyData();
  d.accounts = [
    { id: 'A', name: '現金', kind: 'bank', initialBalance: 10000, order: 0 },
    { id: 'G1', name: '緊急預備金', kind: 'saving', initialBalance: 6000, order: 1, target: 9600 },
    { id: 'G2', name: '下半年房租', kind: 'saving', initialBalance: 3000, order: 0, target: 3000 },
  ];
  return d;
}

describe('儲蓄', () => {
  it('轉移＝一般轉帳：兩邊金額正確', () => {
    const d = addTransaction(base(), { type: 'transfer', amount: 1000, accountId: 'G2', toAccountId: 'G1', occurredAt: iso }).data;
    expect(allBalances(d).get('G1')).toBe(7000);
    expect(allBalances(d).get('G2')).toBe(2000);
  });

  it('存入可編輯：改金額與來源帳戶，兩邊金額正確、標記保留', () => {
    const r = addTransaction(base(), { type: 'transfer', amount: 500, accountId: 'A', toAccountId: 'G1', occurredAt: iso, source: 'saving-in' });
    expect(isSavingTransfer(r.data.transactions[0])).toBe(true);
    const d = updateTransaction(r.data, r.id, { type: 'transfer', amount: 800, accountId: 'A', toAccountId: 'G2', occurredAt: iso, note: '改' });
    const b = allBalances(d);
    expect([b.get('A'), b.get('G1'), b.get('G2')]).toEqual([9200, 6000, 3800]);
    expect(d.transactions[0].source).toBe('saving-in');
  });

  it('改成別的類型就不保留標記；利息仍不能用記帳頁編輯', () => {
    const r = addTransaction(base(), { type: 'transfer', amount: 500, accountId: 'G1', toAccountId: 'A', occurredAt: iso, source: 'saving-out' });
    const d = updateTransaction(r.data, r.id, { type: 'expense', amount: 500, accountId: 'A', categoryId: 'c-e1', occurredAt: iso });
    expect(d.transactions[0].source).toBeUndefined();
    const i = addTransaction(base(), { type: 'income', amount: 30, accountId: 'G1', occurredAt: iso, source: 'saving-interest' });
    expect(isSavingTransfer(i.data.transactions[0])).toBe(false);
  });
});
