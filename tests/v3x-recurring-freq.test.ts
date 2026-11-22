// 3.x 定期扣款：每週／每年、本月合計、取消資訊（PK 2026-11-22 定案）。
// 2026-11-22 是星期日 → 11/4、11/11、11/18、11/25、12/2 都是星期三。
import { describe, expect, it } from 'vitest';
import { allBalances, dayKey, recurringReserved, recurringPeriodTotal } from '../src/data/calc';
import { addRecurring, updateRecurring, removeRecurring, postDueRecurring, normalizeRecurring, laterNext, scheduleLabel, RecurringError } from '../src/data/recurring';
import { emptyData } from '../src/data/seed';
import { exportJson, parseBackup } from '../src/data/backup';
import type { AppData, Recurring } from '../src/data/types';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0);

/** 結算日 5 號；現金 10,000 */
function base(): AppData {
  const d = emptyData();
  d.settings.settleDay = 5;
  d.accounts = [{ id: 'cash', name: '現金', kind: 'bank', initialBalance: 10000, order: 0 }];
  return d;
}
const common = { categoryId: 'c-e1', accountId: 'cash' };
const WEEKLY = { ...common, name: '健身房', amount: 100, freq: 'week' as const, weekday: 3, day: 1 };
const YEARLY = { ...common, name: '網域', amount: 1490, freq: 'year' as const, monthOfYear: 3, day: 15 };
const MONTHLY = { ...common, name: 'HBO', amount: 390, day: 7 };
const autoTx = (d: AppData) => d.transactions.filter((t) => t.recurringId);

describe('每週', () => {
  it('這期還沒扣的每一次都預留；到了星期三自動記、預留跟著解除', () => {
    let d = addRecurring(base(), WEEKLY, at(2026, 11, 5)).data;
    expect(d.recurring[0].nextMonth).toBe('2026-11-11');
    // 11/5～12/4 這期有 11/11、11/18、11/25、12/2 四次
    expect(recurringReserved(d, at(2026, 11, 5))).toBe(400);
    const r = postDueRecurring(d, at(2026, 11, 19));
    expect(r.posted.map((t) => dayKey(t.occurredAt))).toEqual(['2026-11-11', '2026-11-18']);
    d = r.data;
    expect(allBalances(d).get('cash')).toBe(9800);
    expect(recurringReserved(d, at(2026, 11, 19))).toBe(200);
    expect(d.recurring[0].nextMonth).toBe('2026-11-25');
    // 同一天再跑：不重複
    expect(postDueRecurring(d, at(2026, 11, 19)).posted).toHaveLength(0);
  });

  it('新增當天剛好是那個星期幾＝這次要扣，隔天記、時間是扣款日 23:59', () => {
    const d = addRecurring(base(), WEEKLY, at(2026, 11, 18)).data;
    expect(d.recurring[0].nextMonth).toBe('2026-11-18');
    expect(postDueRecurring(d, at(2026, 11, 18)).posted).toHaveLength(0);
    const p = postDueRecurring(d, at(2026, 11, 19)).posted;
    expect(p).toHaveLength(1);
    const t = new Date(p[0].occurredAt);
    expect([dayKey(t), t.getHours(), t.getMinutes()]).toEqual(['2026-11-18', 23, 59]);
  });

  it('沒選星期幾不能存', () => {
    expect(() => addRecurring(base(), { ...WEEKLY, weekday: undefined }, at(2026, 11, 5))).toThrow(RecurringError);
  });
});

describe('每年', () => {
  it('扣款日落在哪一期，那一期一開始整筆預留；其他期不影響', () => {
    let d = addRecurring(base(), YEARLY, at(2026, 11, 22)).data;
    expect(d.recurring[0].nextMonth).toBe('2027');
    expect(recurringReserved(d, at(2026, 11, 22))).toBe(0);
    expect(recurringReserved(d, at(2027, 3, 4))).toBe(0); // 2/5～3/4 這期
    expect(recurringReserved(d, at(2027, 3, 5))).toBe(1490); // 3/5～4/4 這期
    expect(postDueRecurring(d, at(2027, 3, 15)).posted).toHaveLength(0);
    const r = postDueRecurring(d, at(2027, 3, 16));
    expect(r.posted).toHaveLength(1);
    expect(dayKey(r.posted[0].occurredAt)).toBe('2027-03-15');
    d = r.data;
    expect(d.recurring[0].nextMonth).toBe('2028');
    expect(recurringReserved(d, at(2027, 3, 16))).toBe(0);
  });

  it('2/29：平年在 2/28 扣，閏年在 2/29 扣', () => {
    let d = addRecurring(base(), { ...YEARLY, monthOfYear: 2, day: 29 }, at(2027, 1, 10)).data;
    let r = postDueRecurring(d, at(2027, 3, 1));
    expect(dayKey(r.posted[0].occurredAt)).toBe('2027-02-28');
    r = postDueRecurring(r.data, at(2028, 3, 1));
    expect(dayKey(r.posted[0].occurredAt)).toBe('2028-02-29');
  });

  it('不存在的日期不能存（4/31）', () => {
    expect(() => addRecurring(base(), { ...YEARLY, monthOfYear: 4, day: 31 }, at(2026, 11, 5))).toThrow(RecurringError);
  });
});

describe('本月合計（只算這一期）', () => {
  it('已經記的照實際金額＋這期還沒扣的；別期的每年扣款不算', () => {
    let d = base();
    d = addRecurring(d, MONTHLY, at(2026, 11, 5)).data; // 11/7
    d = addRecurring(d, WEEKLY, at(2026, 11, 5)).data; // 4 次
    d = addRecurring(d, YEARLY, at(2026, 11, 5)).data; // 明年 3 月，不算
    expect(recurringPeriodTotal(d, at(2026, 11, 5))).toBe(390 + 400);
    d = postDueRecurring(d, at(2026, 11, 12)).data; // 11/7、11/11 已記
    expect(recurringPeriodTotal(d, at(2026, 11, 12))).toBe(390 + 400);
    // 下一期（12/5～1/4）：每月一次、每週 12/9、12/16、12/23、12/30 四次
    expect(recurringPeriodTotal(d, at(2026, 12, 5))).toBe(390 + 400);
  });
});

describe('修改、刪除', () => {
  it('每月扣過了再改成每週：已付的那段不重複扣，從原本下一次扣款日起算', () => {
    let d = addRecurring(base(), MONTHLY, at(2026, 11, 5)).data;
    d = postDueRecurring(d, at(2026, 11, 8)).data; // 11/7 已扣（11/8 記），下次 12/7
    const id = d.recurring[0].id;
    d = updateRecurring(d, id, { ...MONTHLY, freq: 'week', weekday: 3 }, at(2026, 11, 10));
    expect(d.recurring[0].nextMonth).toBe('2026-12-09');
    expect(d.recurring[0].day).toBe(1);
    expect(postDueRecurring(d, at(2026, 11, 30)).posted).toHaveLength(0);
  });

  it('還沒扣過就改週期：從今天起第一次', () => {
    let d = addRecurring(base(), MONTHLY, at(2026, 11, 8)).data; // 下次 12/7
    const id = d.recurring[0].id;
    d = updateRecurring(d, id, { ...MONTHLY, freq: 'week', weekday: 3 }, at(2026, 11, 8));
    expect(d.recurring[0].nextMonth).toBe('2026-11-11');
  });

  it('刪除：已經自動記的支出保留，帳戶餘額不變', () => {
    let d = addRecurring(base(), WEEKLY, at(2026, 11, 5)).data;
    d = postDueRecurring(d, at(2026, 11, 12)).data;
    d = removeRecurring(d, d.recurring[0].id);
    expect(autoTx(d)).toHaveLength(1);
    expect(allBalances(d).get('cash')).toBe(9900);
    expect(recurringReserved(d, at(2026, 11, 12))).toBe(0);
  });
});

describe('取消資訊、備份', () => {
  it('取消方式和備註存起來、備份帶得走；空白備註不存', () => {
    let d = addRecurring(base(), { ...WEEKLY, cancelVia: 'web', cancelNote: '  https://example.com/cancel  ' }, at(2026, 11, 5)).data;
    d = addRecurring(d, { ...MONTHLY, cancelNote: '   ' }, at(2026, 11, 5)).data;
    expect(d.recurring[0].cancelVia).toBe('web');
    expect(d.recurring[0].cancelNote).toBe('https://example.com/cancel');
    expect('cancelNote' in d.recurring[1]).toBe(false);
    const back = parseBackup(exportJson(d));
    expect(back.recurring).toEqual(d.recurring);
  });

  it('整理舊資料：沒有週期的保持原樣；壞掉的週期、星期、取消方式修正', () => {
    const now = at(2026, 11, 22);
    const old = { id: 'a', name: 'HBO', amount: 390, day: 7, categoryId: 'c', accountId: 'cash', order: 0, nextMonth: '2026-12', createdAt: 'x' };
    const bad = { ...old, id: 'b', freq: 'week', weekday: 3, nextMonth: '2026-11-24', cancelVia: 'fax' };
    const weird = { ...old, id: 'c', freq: 'daily' };
    const out = normalizeRecurring({ recurring: [old, bad, weird] }, now).recurring;
    expect(out[0]).toEqual(old);
    expect(out[1].nextMonth).toBe('2026-11-25'); // 11/24 不是星期三 → 從今天起第一個星期三
    expect(out[1].cancelVia).toBeUndefined();
    expect(out[2].freq).toBe('month');
  });

  it('匯入舊備份：週期不同時比扣款日，不會讓已扣過的再扣', () => {
    const cur = { id: 'a', name: 'x', amount: 1, freq: 'week', weekday: 3, day: 1, categoryId: 'c', accountId: 'cash', order: 0, nextMonth: '2026-12-09', createdAt: 'x' } as Recurring;
    const inc = { ...cur, freq: undefined, weekday: undefined, day: 7, nextMonth: '2026-11' } as Recurring;
    expect(laterNext(inc, cur).nextMonth).toBe('2027-01');
  });

  it('清單文字', () => {
    expect(scheduleLabel({ freq: 'week', weekday: 3, day: 1 })).toBe('每週三');
    expect(scheduleLabel({ day: 12 })).toBe('每月 12 號');
    expect(scheduleLabel({ freq: 'year', monthOfYear: 3, day: 15 })).toBe('每年 3/15');
  });
});
