// 3.0 範例資料：剩餘可用固定 $30,000（任何一天安裝都一樣）、清空範例保留外觀設定
import { describe, it, expect } from 'vitest';
import { sampleData, blankData } from '../src/data/seed';
import { spendableTotal } from '../src/data/calc';
import { postDueRecurring } from '../src/data/recurring';
import { clearSample, clearRecords } from '../src/data/reset';

describe('範例資料', () => {
  it('一年中每一天安裝，剩餘可用都是 30,000（含定期扣款當天自動記帳後）', () => {
    for (let i = 0; i < 366; i++) {
      const now = new Date(2026, 0, 1 + i, 13, 0);
      const d = postDueRecurring(sampleData(now), now).data;
      expect(spendableTotal(d, now), now.toDateString()).toBe(30000);
    }
  });
  it('深夜 0:30 安裝也沒有未來的紀錄', () => {
    const now = new Date(2026, 10, 21, 0, 30);
    const d = sampleData(now);
    expect(d.transactions.every((t) => t.occurredAt <= now.toISOString())).toBe(true);
  });
  it('標記為範例、平均／日打開', () => {
    const s = sampleData().settings;
    expect(s.sample).toBe(true);
    expect(s.dailyAvg).toBe(true);
    expect(s.settleDay).toBe(5);
  });
});

describe('清空範例', () => {
  it('帳戶紀錄回到全新，外觀與字體保留，範例標記消失', () => {
    const d = sampleData();
    d.settings.theme = 'dark';
    d.settings.appFont = 'huninn';
    const out = clearSample(d, blankData());
    expect(out.transactions).toHaveLength(0);
    expect(out.recurring).toHaveLength(0);
    expect(out.accounts.some((a) => a.kind === 'bank')).toBe(false);
    expect(out.settings.theme).toBe('dark');
    expect(out.settings.appFont).toBe('huninn');
    expect(out.settings.sample).toBe(false);
    expect(out.settings.defaultReimburseAccountId).toBeNull();
  });
  it('清空紀錄也拿掉範例標記', () => {
    expect(clearRecords(sampleData()).settings.sample).toBe(false);
  });
});
