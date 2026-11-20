// 2.5 段C：明細拖曳換位置（改時間）、拖去刪除、多選刪除
import { describe, expect, it } from 'vitest';
import { allBalances, totals, dayKey } from '../src/data/calc';
import { addTransaction } from '../src/data/ops';
import { canMoveTx, slotTime, moveTx, deleteMany, restoreDeleted } from '../src/data/txMove';
import { emptyData } from '../src/data/seed';
import type { AppData } from '../src/data/types';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString();
function base(): AppData {
  let d = emptyData();
  d.accounts = [
    { id: 'A', name: '現金', kind: 'bank', initialBalance: 10000, order: 0 },
    { id: 'B', name: '郵局', kind: 'bank', initialBalance: 0, order: 1 },
  ];
  const add = (id: string, when: string, amount = 100) => {
    d = addTransaction(d, { type: 'expense', amount, accountId: 'A', categoryId: 'c-e1', occurredAt: when }, id).data;
  };
  add('t1', at(20, 18)); // 最新
  add('t2', at(20, 12));
  add('t3', at(20, 8));
  add('y1', at(19, 21));
  add('y2', at(19, 9));
  return d;
}
const time = (d: AppData, id: string) => d.transactions.find((t) => t.id === id)!.occurredAt;

describe('拖曳換位置', () => {
  it('放到兩筆中間：時間＝兩筆中間', () => {
    const d = base();
    // t3（08:00）拖到 t1（18:00）與 t2（12:00）中間 → 15:00
    expect(slotTime(d, 't3', { day: dayKey(at(20, 0)), aboveId: 't1', belowId: 't2' })).toBe(at(20, 15));
  });

  it('拖到別天的兩筆中間：日期跟著改', () => {
    const d = base();
    expect(slotTime(d, 't2', { day: dayKey(at(19, 0)), aboveId: 'y1', belowId: 'y2' })).toBe(at(19, 15));
  });

  it('那天最上面＝比下面那筆晚 1 分鐘；最下面＝比上面那筆早 1 分鐘', () => {
    const d = base();
    expect(slotTime(d, 't2', { day: dayKey(at(19, 0)), aboveId: null, belowId: 'y1' })).toBe(at(19, 21, 1));
    expect(slotTime(d, 't2', { day: dayKey(at(19, 0)), aboveId: 'y2', belowId: null })).toBe(at(19, 8, 59));
  });

  it('不會超出那一天（00:00～23:59:59）', () => {
    let d = base();
    d = addTransaction(d, { type: 'expense', amount: 1, accountId: 'A', categoryId: 'c-e1', occurredAt: at(18, 23, 59) }, 'z1').data;
    d = addTransaction(d, { type: 'expense', amount: 1, accountId: 'A', categoryId: 'c-e1', occurredAt: at(18, 0, 0) }, 'z2').data;
    expect(slotTime(d, 't2', { day: dayKey(at(18, 0)), aboveId: null, belowId: 'z1' })).toBe(new Date(2026, 10, 18, 23, 59, 59).toISOString());
    expect(slotTime(d, 't2', { day: dayKey(at(18, 0)), aboveId: 'z2', belowId: null })).toBe(at(18, 0));
  });

  it('放回原位：不動', () => {
    const d = base();
    expect(slotTime(d, 't2', { day: dayKey(at(20, 0)), aboveId: 't1', belowId: 't3' })).toBeNull();
  });

  it('只改時間：餘額不變、本月不變、今日跟著換天', () => {
    const d = base();
    const r = moveTx(d, 't1', at(19, 15));
    expect(allBalances(r.data)).toEqual(allBalances(d));
    expect(totals(r.data, { day: dayKey(at(20, 0)) }).expense).toBe(200);
    expect(totals(r.data, { day: dayKey(at(19, 0)) }).expense).toBe(300);
    expect(r.old.occurredAt).toBe(time(d, 't1'));
  });

  it('轉帳、校正不能拖', () => {
    let d = base();
    d = addTransaction(d, { type: 'transfer', amount: 5, accountId: 'A', toAccountId: 'B', occurredAt: at(20, 10) }, 'tr').data;
    const tr = d.transactions.find((t) => t.id === 'tr')!;
    expect(canMoveTx(tr)).toBe(false);
    expect(canMoveTx({ ...tr, type: 'adjust' })).toBe(false);
    expect(() => moveTx(d, 'tr', at(19, 10))).toThrow();
  });
});

describe('刪除', () => {
  it('多選刪除與復原：餘額回到原狀', () => {
    const d = base();
    const r = deleteMany(d, ['t1', 't2']);
    expect(r.deleted.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(allBalances(r.data).get('A')).toBe(9700);
    const back = restoreDeleted(r.data, r.deleted);
    expect(allBalances(back).get('A')).toBe(9500);
    expect(back.transactions.length).toBe(d.transactions.length);
  });

  it('不能刪的略過並說明原因', () => {
    const d = base();
    const locked = { ...d, transactions: d.transactions.map((t) => (t.id === 't1' ? { ...t, reimbursable: true, reimburseStatus: 'done' as const } : t)) };
    const r = deleteMany(locked, ['t1', 't2']);
    expect(r.deleted.map((t) => t.id)).toEqual(['t2']);
    expect(r.skipped[0].id).toBe('t1');
  });
});
