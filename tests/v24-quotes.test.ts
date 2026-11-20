// 2.4 段C：拖拖小語的挑選規則
import { describe, expect, it } from 'vitest';
import { pickQuote, situations, streakDays, QUOTES } from '../src/quotes';
import { addTransaction } from '../src/data/ops';
import { emptyData } from '../src/data/seed';
import type { AppData } from '../src/data/types';

function base(): AppData {
  const d = emptyData();
  d.accounts = [{ id: 'A', name: '現金', kind: 'bank', initialBalance: 10000, order: 0 }];
  return d;
}
const at = (y: number, m: number, day: number, h = 12) => new Date(y, m, day, h, 0);

describe('拖拖小語', () => {
  it('連續記帳天數：今天還沒記就從昨天往回數', () => {
    let d = base();
    for (const day of [15, 16, 17]) d = addTransaction(d, { type: 'expense', amount: 10, accountId: 'A', categoryId: 'c-e1', occurredAt: at(2026, 10, day).toISOString() }).data;
    expect(streakDays(d, at(2026, 10, 18))).toBe(3);
    expect(streakDays(d, at(2026, 10, 17))).toBe(3);
    expect(streakDays(d, at(2026, 10, 20))).toBe(0);
  });

  it('帳戶快見底排最前面，換上帳戶名和金額', () => {
    const d = base();
    d.accounts.push({ id: 'B', name: 'LINE Bank', kind: 'bank', initialBalance: 80, order: 1 });
    const h = situations(d, at(2026, 10, 18))[0];
    expect(h.pool).toBe(QUOTES.lowBalance);
    expect(pickQuote(d, at(2026, 10, 18), () => 0)).toBe('LINE Bank 只剩 $80，該補血了');
  });

  it('餘額 0 的帳戶不算快見底', () => {
    const d = base();
    d.accounts.push({ id: 'B', name: '空', kind: 'bank', initialBalance: 0, order: 1 });
    expect(situations(d, at(2026, 10, 18)).some((h) => h.pool === QUOTES.lowBalance)).toBe(false);
  });

  it('30% 出一般句；不會連續兩次同一句', () => {
    const d = base();
    expect(QUOTES.general).toContain(pickQuote(d, at(2026, 10, 18), () => 0.95));
    let prev = '';
    for (let i = 0; i < 50; i++) {
      const q = pickQuote(d, at(2026, 10, 18));
      expect(q).not.toBe(prev);
      prev = q;
    }
  });

  it('月底、晚上沒記帳', () => {
    const d = base();
    expect(situations(d, at(2026, 10, 29)).some((h) => h.pool === QUOTES.monthEnd)).toBe(true);
    expect(situations(d, at(2026, 10, 18, 21)).some((h) => h.pool === QUOTES.remind)).toBe(true);
  });
});
