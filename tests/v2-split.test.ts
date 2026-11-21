// 2.0 第一批：拖拖計算機拆帳規則（含邊界情況）。
import { describe, expect, it } from 'vitest';
import { parseTerms, canMark, reconcileMarks, splitPlan, splitInputs, previewText, type SplitPlan } from '../src/splitCalc';
import { addTransactions, deleteTransaction, OpError } from '../src/data/ops';
import { allBalances, spendableTotal, totals, periodKey } from '../src/data/calc';
import { emptyData } from '../src/data/seed';
import type { AppData } from '../src/data/types';

const money = (n: number) => n.toLocaleString('en-US');
const ok = (p: SplitPlan) => {
  if (!p.ok) throw new Error(p.error);
  return p;
};
const NOW = new Date(2026, 10, 10, 12);
const AT = NOW.toISOString();
function base(): AppData {
  const d = emptyData();
  d.accounts = [
    { id: 'A', name: '現金', kind: 'bank', initialBalance: 10000, order: 0 },
    { id: 'E', name: '悠遊卡', kind: 'easycard', initialBalance: 500, order: 0 },
  ];
  return d;
}
const B = (expr: string, accountId: string | null = 'A') => ({
  type: 'expense' as const, accountId, categoryId: 'c-e1', note: '吃飯', occurredAt: AT, expr, splitId: 's1',
});

describe('算式拆成數字', () => {
  it('加減乘除、末尾運算子', () => {
    const t = parseTerms('1100−600+3×200');
    expect(t.map((x) => [x.text, x.op, x.inProduct])).toEqual([
      ['1100', '+', false], ['600', '−', false], ['3', '+', true], ['200', '×', true],
    ]);
    expect(parseTerms('12+').length).toBe(1);
    expect(canMark(t[2])).toBe(false);
  });
});

describe('拆帳', () => {
  it('工單例：1100−600，600 掛我先付 → 一般 500＋我先付 600，帳戶共扣 1,100', () => {
    const p = ok(splitPlan('1100−600', { 1: 'advance' }));
    expect(p).toEqual({ ok: true, general: 500, parts: [{ term: 1, mark: 'advance', amount: 600 }] });
    expect(previewText(p, '吃飯', money)).toBe('會拆成：吃飯 500＋先付 600');
    const r = addTransactions(base(), splitInputs(p, B('1100−600')));
    expect(allBalances(r.data).get('A')).toBe(8900);
    expect(totals(r.data, { period: periodKey(NOW, 1) }).expense).toBe(500);
    expect(r.data.transactions.every((t) => t.calcExpr === '1100−600' && t.splitId === 's1')).toBe(true);
    expect(r.data.transactions.find((t) => t.reimburseKind === 'advance')?.calcTerm).toBe(1);
  });

  it('500＋600，600 掛我先付 → 一般 500＋我先付 600', () => {
    expect(ok(splitPlan('500+600', { 1: 'advance' })).general).toBe(500);
  });

  it('1100−600，600 掛朋友付 → 一般 500 扣帳戶，朋友付 600 不扣；剩餘可用少 1,100', () => {
    const p = ok(splitPlan('1100−600', { 1: 'owed' }));
    const r = addTransactions(base(), splitInputs(p, B('1100−600')));
    expect(allBalances(r.data).get('A')).toBe(9500);
    expect(spendableTotal(r.data)).toBe(8900);
    // 補強批：朋友付那 600 還錢時才算支出，記帳當下只算一般的 500
    expect(totals(r.data, { period: periodKey(NOW, 1) }).expense).toBe(500);
  });

  it('同一個標記掛兩個數字 → 兩筆', () => {
    const p = ok(splitPlan('300+400+500', { 0: 'advance', 1: 'advance' }));
    expect(p.general).toBe(500);
    expect(p.parts.map((x) => x.amount)).toEqual([300, 400]);
  });

  it('只有一個數字掛標記 → 整筆變成那個標記，沒有一般那筆、沒有群組、沒有算式', () => {
    const p = ok(splitPlan('600', { 0: 'budget' }));
    expect(p.general).toBe(0);
    expect(previewText(p, '吃飯', money)).toBe('整筆記成：預算 600');
    const inputs = splitInputs(p, B('600'));
    expect(inputs).toHaveLength(1);
    expect(inputs[0].budget).toBe(true);
    expect(inputs[0].splitId).toBeUndefined();
    expect(inputs[0].calcExpr).toBeUndefined();
  });

  it('全部是朋友付：不需要帳戶', () => {
    const p = ok(splitPlan('600', { 0: 'owed' }));
    expect(splitInputs(p, B('600', null))[0].type).toBe('owed');
  });

  it('有一般部分但沒選帳戶 → 丟錯', () => {
    const p = ok(splitPlan('1100−600', { 1: 'owed' }));
    expect(() => splitInputs(p, B('1100−600', null))).toThrow();
  });

  it('一般部分是負數 → 不能存', () => {
    expect(splitPlan('500−600', { 1: 'advance' })).toMatchObject({ ok: false });
    expect(splitPlan('1100−600', { 0: 'advance' })).toMatchObject({ ok: false, error: '一般支出變成負數，請檢查算式' });
  });

  it('掛標記的數字是 0 → 不能存', () => {
    expect(splitPlan('500+0', { 1: 'advance' })).toMatchObject({ ok: false });
  });

  it('乘除裡的數字不能掛', () => {
    expect(splitPlan('3×200+100', { 0: 'advance' })).toMatchObject({ ok: false, error: '乘除裡的數字不能掛標記' });
    // 乘除項本身沒掛標記時照常：3×200＋100，100 掛我先付 → 一般 600
    expect(ok(splitPlan('3×200+100', { 2: 'advance' })).general).toBe(600);
  });

  it('沒有標記 → 一般一筆；有運算子才存算式', () => {
    const p = ok(splitPlan('120+35', {}));
    expect(p.general).toBe(155);
    expect(previewText(p, '吃飯', money)).toBeNull();
    expect(splitInputs(p, B('120+35'))[0].calcExpr).toBe('120+35');
  });

  it('小數四捨五入到整數元', () => {
    const p = ok(splitPlan('100.6+50.4', { 1: 'advance' }));
    expect(p.parts[0].amount).toBe(50);
    expect(p.general).toBe(101);
  });

  it('預算掛在非一般帳戶 → 整批不存（不會拆一半）', () => {
    const p = ok(splitPlan('1100−600', { 1: 'budget' }));
    const d = base();
    expect(() => addTransactions(d, splitInputs(p, B('1100−600', 'E')))).toThrow(OpError);
  });

  it('復原：拆出來的幾筆一起刪掉，錢回原狀', () => {
    const p = ok(splitPlan('1100−600', { 1: 'advance' }));
    const d0 = base();
    const r = addTransactions(d0, splitInputs(p, B('1100−600')));
    const back = r.ids.reduce((x, id) => deleteTransaction(x, id), r.data);
    expect(allBalances(back)).toEqual(allBalances(d0));
    expect(back.transactions).toHaveLength(0);
  });
});

describe('改算式時標記保留或拿掉', () => {
  it('後面多打數字：前面的標記保留', () => {
    expect(reconcileMarks('1100−600', '1100−600+5', { 1: 'advance' })).toEqual({ 1: 'advance' });
  });
  it('掛標記的數字被改：拿掉', () => {
    expect(reconcileMarks('1100−600', '1100−60', { 1: 'advance' })).toEqual({});
  });
  it('掛標記的數字後面接乘號：拿掉', () => {
    expect(reconcileMarks('1100−600', '1100−600×', { 1: 'advance' })).toEqual({});
  });
  it('AC 清空：全拿掉', () => {
    expect(reconcileMarks('1100−600', '', { 0: 'owed', 1: 'advance' })).toEqual({});
  });
});
