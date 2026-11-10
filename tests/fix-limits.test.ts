// 2.0 修正批第二、三段：刪帳戶只能移到同種類；還朋友錢只能用一般帳戶、悠遊卡、電子錢包。
import { describe, expect, it } from 'vitest';
import { allBalances, dayKey, periodKey, spendableTotal, totals } from '../src/data/calc';
import { addTransaction, moveTargets, removeAccount } from '../src/data/ops';
import { markOwedPaid, owedRepayAccounts } from '../src/data/owed';
import { emptyData } from '../src/data/seed';
import type { AppData } from '../src/data/types';

const day = (d: number) => new Date(2026, 10, d, 12, 0);
const NOW = day(10);
const per = periodKey(day(1), 1);
const monthExp = (d: AppData) => totals(d, { period: per }).expense;
const dayExp = (d: AppData, n: number) => totals(d, { day: dayKey(day(n)) }).expense;

/** 現金、郵局（一般）、悠遊卡、LINE Pay、街口（電子錢包）、旅遊基金（儲蓄）、待投入、0050、其他 */
function base(): AppData {
  const d = emptyData();
  d.accounts = [
    { id: 'cash', name: '現金', kind: 'bank', initialBalance: 10000, order: 0 },
    { id: 'post', name: '郵局', kind: 'bank', initialBalance: 20000, order: 1 },
    { id: 'ec', name: '悠遊卡', kind: 'easycard', initialBalance: 500, order: 0 },
    { id: 'lp', name: 'LINE Pay', kind: 'ewallet', initialBalance: 0, order: 0 },
    { id: 'jk', name: '街口', kind: 'ewallet', initialBalance: 0, order: 1 },
    { id: 'trip', name: '旅遊基金', kind: 'saving', initialBalance: 3000, order: 0 },
    { id: 'icash', name: '待投入', kind: 'invest', subtype: 'cash', initialBalance: 0, order: 0 },
    { id: 'h0050', name: '0050', kind: 'invest', subtype: 'holding', initialBalance: 0, order: 1 },
    { id: 'oth', name: '其他', kind: 'other', initialBalance: 0, order: 0 },
  ];
  return d;
}
const exp = (d: AppData, acc: string, amount: number, n: number) =>
  addTransaction(d, { type: 'expense', amount, accountId: acc, categoryId: 'c-e1', occurredAt: day(n).toISOString() }).data;
const ids = (l: { id: string }[]) => l.map((a) => a.id);

describe('刪帳戶：紀錄只能移到同種類（工單驗證）', () => {
  it('1. 刪現金：可移的只有其他一般帳戶，不出現悠遊卡；硬要移到悠遊卡會被擋', () => {
    const d = exp(base(), 'cash', 3000, 1);
    expect(ids(moveTargets(d, 'cash'))).toEqual(['post']);
    expect(() => removeAccount(d, 'cash', { mode: 'move', targetId: 'ec' })).toThrow('同種類');
    expect(() => removeAccount(d, 'cash', { mode: 'move', targetId: 'trip' })).toThrow('同種類');
  });

  it('2. 只剩一個一般帳戶時刪它：沒有可移的帳戶；悠遊卡、儲蓄、其他只有一個也一樣', () => {
    let d = exp(base(), 'cash', 3000, 1);
    d = removeAccount(d, 'post', { mode: 'deleteRecords' });
    expect(moveTargets(d, 'cash')).toEqual([]);
    expect(moveTargets(d, 'ec')).toEqual([]);
    expect(moveTargets(d, 'trip')).toEqual([]);
    expect(moveTargets(d, 'oth')).toEqual([]);
    expect(() => removeAccount(d, 'cash', { mode: 'move', targetId: 'ec' })).toThrow();
  });

  it('電子錢包只能移到電子錢包；投資的待投入和標的不能互移', () => {
    const d = base();
    expect(ids(moveTargets(d, 'lp'))).toEqual(['jk']);
    expect(moveTargets(d, 'icash')).toEqual([]);
    expect(moveTargets(d, 'h0050')).toEqual([]);
  });

  it('3. 同種類移動後：本月支出、剩餘可用、總金額和移動前一樣', () => {
    let d = exp(base(), 'cash', 3000, 1);
    d = exp(d, 'post', 500, 2);
    d = addTransaction(d, { type: 'transfer', amount: 1000, accountId: 'cash', toAccountId: 'lp', occurredAt: day(3).toISOString() }).data;
    const before = { month: monthExp(d), left: spendableTotal(d, NOW) };
    expect(before).toEqual({ month: 4500, left: 25500 });
    const after = removeAccount(d, 'cash', { mode: 'move', targetId: 'post' });
    expect({ month: monthExp(after), left: spendableTotal(after, NOW) }).toEqual(before);
    expect(allBalances(after).get('post')).toBe(25500);
    expect(allBalances(after).get('lp')).toBe(1000);
  });
});

describe('還朋友錢：只能用一般帳戶、悠遊卡、電子錢包（工單驗證）', () => {
  const owed = (d: AppData, n: number, amount = 600) =>
    addTransaction(d, { type: 'owed', amount, accountId: '', categoryId: 'c-e1', note: '吃飯', occurredAt: day(n).toISOString() });

  it('1. 可選的帳戶不含儲蓄、投資、其他；硬用它們還會被擋，資料不變', () => {
    const d = base();
    expect(ids(owedRepayAccounts(d))).toEqual(['cash', 'post', 'ec', 'lp', 'jk']);
    const o = owed(d, 1);
    for (const acc of ['trip', 'icash', 'h0050', 'oth']) {
      expect(() => markOwedPaid(o.data, [o.id], acc, day(3))).toThrow('不能還款');
    }
  });

  it('2. 用一般帳戶還：還款當天算支出 600，帳戶少 600', () => {
    const o = owed(base(), 1);
    const d = markOwedPaid(o.data, [o.id], 'cash', day(3));
    expect(dayExp(d, 1)).toBe(0);
    expect(dayExp(d, 3)).toBe(600);
    expect(monthExp(d)).toBe(600);
    expect(allBalances(d).get('cash')).toBe(9400);
  });

  it('3. 用悠遊卡、電子錢包還：不重複算（儲值時算過）', () => {
    let d = addTransaction(base(), { type: 'transfer', amount: 1000, accountId: 'cash', toAccountId: 'lp', occurredAt: day(1).toISOString() }).data;
    const o = owed(d, 2);
    d = markOwedPaid(o.data, [o.id], 'lp', day(3));
    expect(monthExp(d)).toBe(1000);
    expect(allBalances(d).get('lp')).toBe(400);
    const o2 = owed(d, 4, 200);
    d = markOwedPaid(o2.data, [o2.id], 'ec', day(5));
    expect(monthExp(d)).toBe(1000);
    expect(allBalances(d).get('ec')).toBe(300);
  });

  it('4. 先把儲蓄轉到一般帳戶（不算支出），再用一般帳戶還：支出只算一次 600', () => {
    const o = owed(base(), 1);
    let d = addTransaction(o.data, { type: 'transfer', amount: 600, accountId: 'trip', toAccountId: 'cash', occurredAt: day(2).toISOString() }).data;
    expect(monthExp(d)).toBe(0);
    d = markOwedPaid(d, [o.id], 'cash', day(3));
    expect(monthExp(d)).toBe(600);
    expect(allBalances(d).get('cash')).toBe(10000);
    expect(allBalances(d).get('trip')).toBe(2400);
  });
});
