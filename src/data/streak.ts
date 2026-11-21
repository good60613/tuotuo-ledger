// 3.1 連續記帳打卡：哪幾天有記帳、連續幾天。
// 「有記帳」＝那天（照紀錄日期 occurredAt）有任何一筆紀錄；定期扣款自動記的不算（不是自己記的）。
// 連續天數：今天有記 → 算到今天；今天還沒記 → 先算到昨天（不會一早打開就變 0），昨天也沒記才歸 0。
import type { AppData } from './types';
import { dayKey } from './calc';

/** 有記帳的日子（'YYYY-MM-DD'） */
export function loggedDays(d: AppData): Set<string> {
  const set = new Set<string>();
  for (const t of d.transactions) {
    if (t.recurringId) continue;
    set.add(dayKey(t.occurredAt));
  }
  return set;
}

export interface Streak {
  /** 連續天數 */
  days: number;
  /** 今天記了沒 */
  today: boolean;
}

export function currentStreak(days: Set<string>, now = new Date()): Streak {
  const today = days.has(dayKey(now));
  const cur = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!today) cur.setDate(cur.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(cur))) {
    n++;
    cur.setDate(cur.getDate() - 1);
  }
  return { days: n, today };
}

/** 打卡區的圖（3.1 新六張）：跟著連續天數換 */
export type StreakCoin = 'bill' | 'eat' | 'transit' | 'piggy' | 'shop' | 'rich';

/** 打卡區的一句話（硬幣自稱「我」、≤12 字）＋配圖 */
export function streakCheer(s: Streak): { text: string; coin: StreakCoin } {
  if (s.days === 0) return { text: '今天記一筆吧！', coin: 'bill' };
  if (!s.today) return { text: '今天還沒記喔！', coin: 'bill' };
  if (s.days >= 30) return { text: '你是記帳達人！', coin: 'rich' };
  if (s.days >= 14) return { text: '超棒的！', coin: 'shop' };
  if (s.days >= 7) return { text: '一整週了，讚讚！', coin: 'piggy' };
  if (s.days >= 3) return { text: '讚讚！繼續保持', coin: 'transit' };
  return { text: '加油！', coin: 'eat' };
}
