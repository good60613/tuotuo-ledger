// 2.6 首頁「平均／日」：剩餘可用 ÷ 離結算日天數（不含今天，結算日當天算新的一期）
import { describe, it, expect } from 'vitest';
import { daysToSettle, dailyAllowance } from '../src/data/calc';
import { dailyAvgOn } from '../src/features';

const at = (y: number, m: number, d: number, h = 13) => new Date(y, m - 1, d, h, 20);

describe('離結算日天數', () => {
  it('工單例子：11/21、結算日 5 號 → 14 天', () => {
    expect(daysToSettle(at(2026, 11, 21), 5)).toBe(14);
  });
  it('結算日前一天＝1 天；結算日當天是新的一期，算到下個月', () => {
    expect(daysToSettle(at(2026, 12, 4), 5)).toBe(1);
    expect(daysToSettle(at(2026, 12, 5), 5)).toBe(31);
  });
  it('深夜、跨年也對', () => {
    expect(daysToSettle(at(2026, 12, 31, 23), 5)).toBe(5);
    expect(daysToSettle(at(2026, 11, 21, 0), 1)).toBe(10);
  });
  it('結算日 31 號遇到 2 月：用 2 月最後一天', () => {
    expect(daysToSettle(at(2027, 2, 20), 31)).toBe(8);
  });
});

describe('平均／日', () => {
  it('工單例子：$4,957 ÷ 14 ＝ $354', () => {
    expect(dailyAllowance(4957, at(2026, 11, 21), 5)).toBe(354);
  });
  it('負數照樣算', () => {
    expect(dailyAllowance(-1680, at(2026, 11, 21), 5)).toBe(-120);
  });
  it('預設關閉', () => {
    expect(dailyAvgOn({})).toBe(false);
    expect(dailyAvgOn({ dailyAvg: true })).toBe(true);
  });
});
