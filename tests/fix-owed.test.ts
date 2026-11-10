// 2.0 補強批第一段：朋友付改算法（記帳那天不算支出，還錢那天才算）。工單驗證 1～5。
import { describe, expect, it } from 'vitest';
import { allBalances, spendableTotal, totals, periodKey, dayKey } from '../src/data/calc';
import { addTransaction } from '../src/data/ops';
import { markOwedPaid, revertOwedPaid } from '../src/data/owed';
import { emptyData } from '../src/data/seed';
import { exportJson, parseBackup } from '../src/data/backup';
import type { AppData } from '../src/data/types';

const day = (d: number) => new Date(2026, 10, d, 12, 0);
const per = periodKey(day(1), 1);

/** 現金 10,000（一般帳戶）、LINE Pay 0（電子錢包） */
function base(): AppData {
  const d = emptyData();
  d.settings.settleDay = 1;
  d.accounts = [
    { id: 'cash', name: '現金', kind: 'bank', initialBalance: 10000, order: 0 },
    { id: 'lp', name: 'LINE Pay', kind: 'ewallet', initialBalance: 0, order: 0 },
  ];
  return d;
}
const owed = (d: AppData, at: Date, amount = 600) =>
  addTransaction(d, { type: 'owed', amount, accountId: '', categoryId: 'c-e1', note: '吃飯', occurredAt: at.toISOString() });
const monthExp = (d: AppData) => totals(d, { period: per }).expense;
const dayExp = (d: AppData, n: number) => totals(d, { day: dayKey(day(n)) }).expense;

describe('朋友付新算法（工單驗證）', () => {
  it('1. 1 號現金儲值 1,000 到 LINE Pay、2 號朋友付 600、3 號用 LINE Pay 還 → 本月支出 1,000', () => {
    let d = base();
    d = addTransaction(d, { type: 'transfer', amount: 1000, accountId: 'cash', toAccountId: 'lp', occurredAt: day(1).toISOString() }).data;
    const o = owed(d, day(2));
    d = markOwedPaid(o.data, [o.id], 'lp', day(3));
    expect(monthExp(d)).toBe(1000);
    expect(allBalances(d).get('lp')).toBe(400);
    expect(allBalances(d).get('cash')).toBe(9000);
  });

  it('2. 1 號朋友付 600、3 號用現金還 → 1 號支出 0、3 號起本月 600、現金少 600', () => {
    const o = owed(base(), day(1));
    expect(monthExp(o.data)).toBe(0);
    const d = markOwedPaid(o.data, [o.id], 'cash', day(3));
    expect(dayExp(d, 1)).toBe(0);
    expect(dayExp(d, 3)).toBe(600);
    expect(monthExp(d)).toBe(600);
    expect(allBalances(d).get('cash')).toBe(9400);
  });

  it('3. 未還的朋友付：剩餘可用有扣，本月與今日支出沒有', () => {
    const { data: d } = owed(base(), day(2));
    expect(spendableTotal(d)).toBe(9400);
    expect(monthExp(d)).toBe(0);
    expect(dayExp(d, 2)).toBe(0);
  });

  it('4. 結案後退回：回到結案前的狀態，數字都對', () => {
    const o = owed(base(), day(1));
    const before = o.data;
    const paid = markOwedPaid(before, [o.id], 'cash', day(3));
    const d = revertOwedPaid(paid, o.id);
    expect(allBalances(d)).toEqual(allBalances(before));
    expect(spendableTotal(d)).toBe(spendableTotal(before));
    expect(monthExp(d)).toBe(0);
    expect(dayExp(d, 3)).toBe(0);
    expect(JSON.parse(JSON.stringify(d.transactions))).toEqual(JSON.parse(JSON.stringify(before.transactions)));
  });

  it('5. 舊規則時期的備份（未還＋已還的朋友付）匯入：沒有重複算或少算', () => {
    let d = base();
    const a = owed(d, day(1), 600); // 舊規則時記的，還沒還
    d = a.data;
    const b = owed(d, day(2), 300); // 舊規則時記的，已經用現金還了
    d = markOwedPaid(b.data, [b.id], 'cash', day(4));
    // 模擬舊版 App 匯出的檔案（格式與 v5 相同，欄位沒有變）
    const old = JSON.parse(exportJson(d));
    const back = parseBackup(JSON.stringify(old));
    // 未還的 600：只扣剩餘可用，不算支出；已還的 300：在 4 號算一次
    expect(monthExp(back)).toBe(300);
    expect(dayExp(back, 1)).toBe(0);
    expect(dayExp(back, 2)).toBe(0);
    expect(dayExp(back, 4)).toBe(300);
    expect(spendableTotal(back)).toBe(10000 - 300 - 600);
    // 之後把未還的 600 用現金還 → 本月共 900，每筆只算一次
    const after = markOwedPaid(back, [a.id], 'cash', day(5));
    expect(monthExp(after)).toBe(900);
    expect(spendableTotal(after)).toBe(10000 - 900);
  });
});
