// 2.3 段3：提示膠囊的內容與時間
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getState, showToast, dismissToast, hideToast } from '../src/store';
import { toastRich } from '../src/toastInfo';
import { TOAST_MS, TOAST_EXIT_MS } from '../src/config';
import { sampleData } from '../src/data/seed';
import { addTransaction } from '../src/data/ops';

describe('提示膠囊的時間', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    hideToast();
    vi.useRealTimers();
  });

  it('時間到先「淡出」，再過一小段才拿掉；淡出時不能再算有效的復原', () => {
    showToast('已記一筆', () => {});
    expect(getState().toast?.leaving).toBeFalsy();
    vi.advanceTimersByTime(TOAST_MS - 1);
    expect(getState().toast?.leaving).toBeFalsy();
    vi.advanceTimersByTime(2);
    expect(getState().toast?.leaving).toBe(true);
    vi.advanceTimersByTime(TOAST_EXIT_MS + 1);
    expect(getState().toast).toBeNull();
  });

  it('手指滑掉：馬上開始淡出；新提示會蓋掉舊的（舊的計時不影響新的）', () => {
    showToast('甲', () => {});
    const first = getState().toast!.id;
    dismissToast(first);
    expect(getState().toast?.leaving).toBe(true);
    showToast('乙');
    expect(getState().toast?.text).toBe('乙');
    vi.advanceTimersByTime(TOAST_EXIT_MS + 5);
    expect(getState().toast?.text).toBe('乙');
    // 用舊 id 去收不會誤收到新的
    dismissToast(first);
    expect(getState().toast?.leaving).toBeFalsy();
  });
});

describe('膠囊文字：已記 分類 金額', () => {
  it('支出：減號是「−」，帶分類名稱', () => {
    const d0 = sampleData();
    const cat = d0.categories.find((c) => c.type === 'expense')!;
    const acc = d0.accounts.find((a) => a.kind === 'bank')!;
    const r = addTransaction(d0, { type: 'expense', amount: 450, accountId: acc.id, categoryId: cat.id, note: '', occurredAt: new Date().toISOString() });
    const rich = toastRich('已記', r.data, r.data.transactions.filter((t) => t.id === r.id))!;
    expect(rich.verb).toBe('已記');
    expect(rich.title).toBe(cat.name);
    expect(rich.amt).toBe('−$450');
    expect(rich.cls).toBe('expense');
  });

  it('收入：加號、綠；多筆：顯示 N 筆與合計', () => {
    const d0 = sampleData();
    const cat = d0.categories.find((c) => c.type === 'income')!;
    const acc = d0.accounts.find((a) => a.kind === 'bank')!;
    const a = addTransaction(d0, { type: 'income', amount: 1000, accountId: acc.id, categoryId: cat.id, occurredAt: new Date().toISOString() });
    const rich = toastRich('已記', a.data, a.data.transactions.filter((t) => t.id === a.id))!;
    expect(rich.amt).toBe('+$1,000');
    expect(rich.cls).toBe('income');
    const b = addTransaction(a.data, { type: 'income', amount: 500, accountId: acc.id, categoryId: cat.id, occurredAt: new Date().toISOString() });
    const two = toastRich('已記', b.data, b.data.transactions.filter((t) => t.id === a.id || t.id === b.id))!;
    expect(two.title).toBe('2 筆');
    expect(two.amt).toBe('+$1,500');
  });

  it('轉帳：不帶正負號、紫色', () => {
    const d0 = sampleData();
    const [x, y] = d0.accounts.filter((a) => a.kind === 'bank');
    const r = addTransaction(d0, { type: 'transfer', amount: 300, accountId: x.id, toAccountId: y.id, occurredAt: new Date().toISOString() });
    const rich = toastRich('已轉帳', r.data, r.data.transactions.filter((t) => t.id === r.id))!;
    expect(rich.amt).toBe('$300');
    expect(rich.cls).toBe('transfer');
  });

  it('沒有紀錄時不給膠囊內容', () => {
    expect(toastRich('已記', sampleData(), [])).toBeUndefined();
  });
});
