import { describe, it, expect } from 'vitest';
import { sampleData } from '../src/data/seed';
import { scopeTotals, scopeBreakdown, scopeSeries, totals, customDays } from '../src/data/calc';
import type { AppData, Transaction } from '../src/data/types';

// 2.2 C 段：統計「年」「自訂」加總。規則與月檢視相同，只差時間範圍。
function makeData(settleDay: number, list: [string, number, Partial<Transaction>?][]): AppData {
  const d = sampleData();
  const bank = d.accounts.find((a) => a.kind === 'bank')!;
  const cat = d.categories.find((c) => c.type === 'expense')!;
  d.settings = { ...d.settings, settleDay };
  d.transactions = list.map(([at, amount, extra], i) => ({
    id: 't' + i, type: 'expense', amount, accountId: bank.id, categoryId: cat.id, note: '',
    occurredAt: at, reimbursable: false, ...extra,
  })) as Transaction[];
  return d;
}

describe('統計：年加總', () => {
  it('結算日 1 號：2026 年＝1/1～12/31', () => {
    const d = makeData(1, [
      ['2025-12-31T23:00:00', 1],     // 前一年
      ['2026-01-01T08:00:00', 10],
      ['2026-06-15T08:00:00', 100],
      ['2026-12-31T22:00:00', 1000],
      ['2027-01-01T00:30:00', 5],     // 下一年
      ['2026-03-03T08:00:00', 7, { type: 'income' }],
      ['2026-03-04T08:00:00', 999, { reimbursable: true }], // 報帳支出不計入（沿用現有規則）
    ]);
    const y = scopeTotals(d, { kind: 'year', year: 2026 });
    expect(y).toEqual({ expense: 1110, income: 7 });
    // 年加總＝12 期月加總相加
    let sum = 0;
    for (let m = 1; m <= 12; m++) sum += totals(d, { period: `2026-${String(m).padStart(2, '0')}` }).expense;
    expect(y.expense).toBe(sum);
    const s = scopeSeries(d, { kind: 'year', year: 2026 }, 31);
    expect(s.keys.length).toBe(12);
    expect(s.series[0].expense).toBe(10);
    expect(s.series[11].expense).toBe(1000);
  });

  it('結算日 5 號：2026 年＝2026/1/5～2027/1/4', () => {
    const d = makeData(5, [
      ['2026-01-04T12:00:00', 1],     // 屬於 2025 年十二月期
      ['2026-01-05T00:10:00', 10],    // 2026 一月期第一天
      ['2026-12-31T12:00:00', 100],   // 2026 十二月期
      ['2027-01-04T23:50:00', 1000],  // 2026 十二月期最後一天
      ['2027-01-05T00:00:00', 5],     // 2027 一月期
    ]);
    expect(scopeTotals(d, { kind: 'year', year: 2026 }).expense).toBe(1110);
    expect(scopeTotals(d, { kind: 'year', year: 2025 }).expense).toBe(1);
    const s = scopeSeries(d, { kind: 'year', year: 2026 }, 31);
    expect(s.series[0].expense).toBe(10);
    expect(s.series[11].expense).toBe(1100);
    expect(scopeBreakdown(d, 'expense', { kind: 'year', year: 2026 })[0].amount).toBe(1110);
  });
});

describe('統計：自訂區間', () => {
  it('跨月：兩端都含，31 天內用每日', () => {
    const d = makeData(1, [
      ['2026-10-19T23:59:00', 1],
      ['2026-10-20T00:00:00', 10],
      ['2026-11-10T23:59:00', 100],
      ['2026-11-11T00:00:00', 1000],
    ]);
    const scope = { kind: 'custom' as const, from: '2026-10-20', to: '2026-11-10' };
    expect(scopeTotals(d, scope).expense).toBe(110);
    const s = scopeSeries(d, scope, 31);
    expect(s.by).toBe('day');
    expect(s.keys.length).toBe(22);
    expect(s.series[0].expense).toBe(10);
    expect(s.series[21].expense).toBe(100);
  });

  it('跨年：超過 31 天改每月（每個結算期一根）', () => {
    const d = makeData(5, [
      ['2025-11-30T12:00:00', 1],     // 區間外
      ['2025-12-01T09:00:00', 10],    // 2025-11 期
      ['2026-01-04T09:00:00', 100],   // 2025-12 期
      ['2026-01-05T09:00:00', 1000],  // 2026-01 期
      ['2026-02-10T09:00:00', 10000], // 2026-02 期（區間最後一天）
      ['2026-02-11T09:00:00', 5],     // 區間外
    ]);
    const scope = { kind: 'custom' as const, from: '2025-12-01', to: '2026-02-10' };
    expect(scopeTotals(d, scope).expense).toBe(11110);
    const s = scopeSeries(d, scope, 31);
    expect(s.by).toBe('period');
    expect(s.keys).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(s.series.map((x) => x.expense)).toEqual([10, 100, 1000, 10000]);
    expect(customDays('2025-12-30', '2026-01-02')).toEqual(['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']);
  });
});
