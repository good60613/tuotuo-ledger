// 2.0 補強批第三段：定期扣款。工單驗證 1～4，加上邊界情況。
import { describe, expect, it } from 'vitest';
import { allBalances, spendableTotal, totals, dayKey, periodKey, chargeDate, recurringReserved } from '../src/data/calc';
import { addRecurring, updateRecurring, removeRecurring, postDueRecurring, setRecurringEnabled, RecurringError } from '../src/data/recurring';
import { removeAccount, updateTransaction } from '../src/data/ops';
import { emptyData, sampleData } from '../src/data/seed';
import { exportJson, parseBackup, readBackup, applySettingsImport } from '../src/data/backup';
import { migrate } from '../src/data/migrate';
import { recurringOn } from '../src/features';
import { DATA_VERSION, type AppData } from '../src/data/types';

/** 2026 年某月某日中午 */
const at = (m: number, d: number) => new Date(2026, m - 1, d, 12, 0);

/** 結算日 5 號；現金 10,000、LINE Pay 1,000 */
function base(): AppData {
  const d = emptyData();
  d.settings.settleDay = 5;
  d.accounts = [
    { id: 'cash', name: '現金', kind: 'bank', initialBalance: 10000, order: 0 },
    { id: 'lp', name: 'LINE Pay', kind: 'ewallet', initialBalance: 1000, order: 0 },
  ];
  return d;
}
const HBO = { name: 'HBO', amount: 390, day: 7, categoryId: 'c-e1', accountId: 'cash' };
const add = (d: AppData, now: Date, input = HBO) => addRecurring(d, input, now);
const autoTx = (d: AppData) => d.transactions.filter((t) => t.recurringId);

describe('定期扣款（工單驗證）', () => {
  it('1. 結算期一開始，剩餘可用預留扣掉本期定期扣款', () => {
    // 11/1 新增（還在 10/5～11/4 這一期；11/7 屬於下一期）→ 還不預留
    const { data: d } = add(base(), at(11, 1));
    expect(spendableTotal(d, at(11, 1))).toBe(10000);
    // 11/5 新的一期開始 → 預留 390
    expect(spendableTotal(d, at(11, 5))).toBe(9610);
    expect(recurringReserved(d, at(11, 5))).toBe(390);
    // 帳戶本身沒動、也還不算支出
    expect(allBalances(d).get('cash')).toBe(10000);
    expect(totals(d, { period: periodKey(at(11, 5), 5) }).expense).toBe(0);
  });

  it('2. 扣款日自動記一筆支出、帳戶扣款、預留解除，沒有重複扣', () => {
    let d = add(base(), at(11, 1)).data;
    // 11/6 還沒到 → 不記
    expect(postDueRecurring(d, at(11, 6)).posted).toHaveLength(0);
    const r = postDueRecurring(d, at(11, 7));
    expect(r.posted).toHaveLength(1);
    d = r.data;
    const t = autoTx(d)[0];
    expect(t.type).toBe('expense');
    expect(t.amount).toBe(390);
    expect(t.note).toBe('HBO');
    expect(dayKey(t.occurredAt)).toBe('2026-11-07');
    expect(allBalances(d).get('cash')).toBe(9610);
    expect(totals(d, { period: periodKey(at(11, 7), 5) }).expense).toBe(390);
    expect(totals(d, { day: '2026-11-07' }).expense).toBe(390);
    // 預留解除：剩餘可用只少一次 390
    expect(recurringReserved(d, at(11, 7))).toBe(0);
    expect(spendableTotal(d, at(11, 7))).toBe(9610);
    // 同一天再跑一次、隔天再跑：不會再記
    expect(postDueRecurring(d, at(11, 7)).posted).toHaveLength(0);
    expect(postDueRecurring(d, at(11, 20)).posted).toHaveLength(0);
    expect(spendableTotal(d, at(11, 20))).toBe(9610);
  });

  it('3. App 一陣子沒開：打開後補記，日期是原扣款日，補記不重複', () => {
    let d = add(base(), at(8, 1)).data; // 8/1 新增，8/7 開始扣
    const r = postDueRecurring(d, at(11, 10)); // 一直到 11/10 才打開
    expect(r.posted.map((t) => dayKey(t.occurredAt))).toEqual(['2026-08-07', '2026-09-07', '2026-10-07', '2026-11-07']);
    d = r.data;
    expect(allBalances(d).get('cash')).toBe(10000 - 390 * 4);
    // 再打開幾次都不會多記
    expect(postDueRecurring(d, at(11, 10)).posted).toHaveLength(0);
    expect(postDueRecurring(d, at(11, 30)).posted).toHaveLength(0);
    expect(postDueRecurring(d, at(12, 7)).posted).toHaveLength(1);
  });

  it('4. 備份匯出再匯入：定期扣款完整還原；舊備份匯入不壞', () => {
    let d = add(base(), at(11, 1)).data;
    d = add(d, at(11, 1), { name: 'Spotify', amount: 149, day: 31, categoryId: 'c-e1', accountId: 'lp' }).data;
    d = postDueRecurring(d, at(11, 7)).data;
    d = { ...d, settings: { ...d.settings, recurringEnabled: false } };
    const back = parseBackup(exportJson(d));
    expect(back.version).toBe(DATA_VERSION);
    expect(back.recurring).toEqual(d.recurring);
    expect(back.settings.recurringEnabled).toBe(false);
    expect(JSON.parse(JSON.stringify(back.transactions))).toEqual(JSON.parse(JSON.stringify(d.transactions)));
    // 只有設定的備份也帶定期扣款
    const s = readBackup(exportJson(d, 'settings'));
    expect(s.data.recurring).toEqual(d.recurring);
    // 舊 v5 備份（沒有 recurring 欄位）：照常匯入、清單是空的、開關開啟、金額不變
    const { recurring: _r, ...v5 } = { ...sampleData(), version: 5 };
    const old = parseBackup(JSON.stringify(v5));
    expect(old.version).toBe(DATA_VERSION);
    expect(old.recurring).toEqual([]);
    expect(recurringOn(old.settings)).toBe(true);
    expect(spendableTotal(old)).toBe(spendableTotal(v5 as unknown as AppData));
    // 更舊的 v4、v1 一樣能升級
    expect(migrate({ ...v5, version: 4 }).recurring).toEqual([]);
  });
});

describe('定期扣款（邊界與保守做法）', () => {
  it('扣款日 31 號、當月沒有 31 號 → 當月最後一天扣（2 月 28 日、11 月 30 日）', () => {
    expect(dayKey(chargeDate(31, '2026-02'))).toBe('2026-02-28');
    expect(dayKey(chargeDate(31, '2026-11'))).toBe('2026-11-30');
    expect(dayKey(chargeDate(31, '2026-12'))).toBe('2026-12-31');
    let d = add(base(), at(11, 1), { ...HBO, day: 31 }).data;
    expect(postDueRecurring(d, at(11, 29)).posted).toHaveLength(0);
    d = postDueRecurring(d, at(11, 30)).data;
    expect(dayKey(autoTx(d)[0].occurredAt)).toBe('2026-11-30');
  });

  it('新增時這個月的扣款日已經過了 → 從下個月開始，不回頭補', () => {
    const d = add(base(), at(11, 10)).data; // 11/7 已過
    expect(d.recurring[0].nextMonth).toBe('2026-12');
    expect(postDueRecurring(d, at(11, 10)).posted).toHaveLength(0);
    // 本期（11/5～12/4）沒有要扣的 → 不預留
    expect(recurringReserved(d, at(11, 10))).toBe(0);
    // 新增當天剛好是扣款日 → 當天就扣
    const d2 = add(base(), at(11, 7)).data;
    expect(postDueRecurring(d2, at(11, 7)).posted).toHaveLength(1);
  });

  it('開關關掉：不自動記、不動帳戶、不預留；重新打開時關閉期間錯過的不補記', () => {
    let d = add(base(), at(11, 1)).data;
    d = setRecurringEnabled(d, false, at(11, 1));
    expect(recurringReserved(d, at(11, 5))).toBe(0);
    expect(postDueRecurring(d, at(12, 20)).posted).toHaveLength(0);
    expect(allBalances(d).get('cash')).toBe(10000);
    // 12/20 再打開：11/7、12/7 都錯過了，不補；下一次是 1/7
    d = setRecurringEnabled(d, true, at(12, 20));
    expect(d.recurring[0].nextMonth).toBe('2027-01');
    expect(postDueRecurring(d, at(12, 20)).posted).toHaveLength(0);
    expect(postDueRecurring(d, at(1, 7 + 365)).posted.length).toBeGreaterThanOrEqual(1);
  });

  it('預設帳戶是小帳戶：自動記在小帳戶、不算主帳支出、不預留剩餘可用', () => {
    let d = add(base(), at(11, 1), { ...HBO, accountId: 'lp' }).data;
    expect(recurringReserved(d, at(11, 5))).toBe(0);
    d = postDueRecurring(d, at(11, 7)).data;
    expect(allBalances(d).get('lp')).toBe(610);
    expect(totals(d, { period: periodKey(at(11, 7), 5) }).expense).toBe(0);
  });

  it('自動記的那筆可以改帳戶；改完不會被重複補記', () => {
    let d = postDueRecurring(add(base(), at(11, 1)).data, at(11, 7)).data;
    const t = autoTx(d)[0];
    d = updateTransaction(d, t.id, { type: 'expense', amount: 390, accountId: 'lp', categoryId: 'c-e1', note: 'HBO', occurredAt: t.occurredAt });
    expect(allBalances(d).get('cash')).toBe(10000);
    expect(allBalances(d).get('lp')).toBe(610);
    expect(autoTx(d)[0].recurringMonth).toBe('2026-11');
    expect(postDueRecurring(d, at(11, 20)).posted).toHaveLength(0);
  });

  it('改扣款日：新的扣款日已經過了 → 這個月不回頭補；刪除項目 → 已記的保留、之後不再扣', () => {
    let d = add(base(), at(11, 1), { ...HBO, day: 15 }).data;
    d = updateRecurring(d, d.recurring[0].id, { ...HBO, day: 3 }, at(11, 10));
    expect(d.recurring[0].nextMonth).toBe('2026-12');
    expect(postDueRecurring(d, at(11, 10)).posted).toHaveLength(0);
    d = postDueRecurring(d, at(12, 3)).data;
    expect(autoTx(d)).toHaveLength(1);
    d = removeRecurring(d, d.recurring[0].id);
    expect(autoTx(d)).toHaveLength(1);
    expect(postDueRecurring(d, at(12, 31)).posted).toHaveLength(0);
  });

  it('只匯入舊的設定檔：已經扣過的月份不會再扣一次', () => {
    const start = add(base(), at(11, 1)).data;
    const oldSettings = readBackup(exportJson(start, 'settings'));
    const cur = postDueRecurring(start, at(11, 7)).data;
    if (oldSettings.type !== 'settings') throw new Error('應該是設定檔');
    const { data: d } = applySettingsImport(cur, oldSettings.data);
    expect(d.recurring[0].nextMonth).toBe('2026-12');
    expect(postDueRecurring(d, at(11, 20)).posted).toHaveLength(0);
  });

  it('帳戶被刪（連紀錄刪）：先不自動記；搬到別的帳戶：扣款帳戶跟著搬', () => {
    const d0 = add(base(), at(11, 1)).data;
    d0.accounts.push({ id: 'post', name: '郵局', kind: 'bank', initialBalance: 0, order: 1 });
    const del = removeAccount(d0, 'cash', { mode: 'deleteRecords' });
    expect(postDueRecurring(del, at(11, 7)).posted).toHaveLength(0);
    expect(del.recurring[0].nextMonth).toBe('2026-11');
    const moved = removeAccount(d0, 'cash', { mode: 'move', targetId: 'post' });
    expect(moved.recurring[0].accountId).toBe('post');
  });

  it('輸入檢查：名稱、金額、日期、帳戶、分類', () => {
    const d = base();
    expect(() => add(d, at(11, 1), { ...HBO, name: ' ' })).toThrow(RecurringError);
    expect(() => add(d, at(11, 1), { ...HBO, amount: 0 })).toThrow(RecurringError);
    expect(() => add(d, at(11, 1), { ...HBO, amount: 1.5 })).toThrow(RecurringError);
    expect(() => add(d, at(11, 1), { ...HBO, day: 32 })).toThrow(RecurringError);
    expect(() => add(d, at(11, 1), { ...HBO, accountId: 'x' })).toThrow(RecurringError);
    expect(() => add(d, at(11, 1), { ...HBO, categoryId: 'x' })).toThrow(RecurringError);
  });

  it('改壞的備份：壞項目拿掉、扣款日夾回 1～31、月份格式不對從今天起算', () => {
    const d = { ...base(), recurring: [
      { id: 'a', name: 'ok', amount: 100, day: 40, categoryId: 'c-e1', accountId: 'cash', order: 0, nextMonth: 'xx', createdAt: '' },
      { id: 'b', name: '', amount: 100, day: 1 },
      { id: 'c', name: 'neg', amount: -5, day: 1 },
      null,
    ] };
    const m = migrate(d);
    expect(m.recurring).toHaveLength(1);
    expect(m.recurring[0].day).toBe(31);
    expect(m.recurring[0].nextMonth).toMatch(/^\d{4}-\d{2}$/);
  });
});
