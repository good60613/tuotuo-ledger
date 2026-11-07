// 第二批（PK 2026-11-08 定案）的資料層規則
import { describe, expect, it } from 'vitest';
import {
  allBalances, ballTotal, categoryBreakdown, dailySeries, holdingStats, inMainLedger, investSummary,
  kindLookup, periodDays, periodKey, periodRange, shiftPeriod, spendableTotal, totals, dayKey, TOPUP_CAT_PREFIX,
} from '../src/data/calc';
import { addTransaction, ballDropTarget, calibrate, updateMarketValue, OpError } from '../src/data/ops';
import { allNotes, hideNote, pinnedCount, sortedCategories, suggestedNotes, togglePin } from '../src/data/notes';
import { emptyData, sampleData } from '../src/data/seed';
import { migrate } from '../src/data/migrate';
import { exportJson, parseBackup } from '../src/data/backup';
import type { AppData } from '../src/data/types';

const NOW = new Date(2026, 10, 7, 12, 0);
const at = (m0: number, d: number, h = 10) => new Date(2026, m0, d, h).toISOString();

function base(): AppData {
  const d = emptyData();
  d.accounts = [
    { id: 'A', name: '薪轉', kind: 'bank', initialBalance: 10000, order: 0 },
    { id: 'B', name: '郵局', kind: 'bank', initialBalance: 5000, order: 1 },
    { id: 'E', name: '悠遊卡', kind: 'easycard', initialBalance: 100, order: 0 },
    { id: 'W1', name: 'LINE Pay', kind: 'ewallet', initialBalance: 200, order: 0 },
    { id: 'W2', name: '街口', kind: 'ewallet', initialBalance: 0, order: 1 },
    { id: 'IC', name: '待投入', kind: 'invest', subtype: 'cash', initialBalance: 1000, order: 0 },
    { id: 'H', name: '0050', kind: 'invest', subtype: 'holding', initialBalance: 0, order: 1 },
    { id: 'S1', name: '旅行', kind: 'saving', initialBalance: 0, target: 30000, order: 0 },
    { id: 'S2', name: '緊急預備金', kind: 'saving', initialBalance: 50000, target: 100000, order: 1 },
  ];
  return d;
}
const add = (d: AppData, p: Parameters<typeof addTransaction>[1]) => addTransaction(d, p).data;
const exp = (d: AppData, acc: string, amt: number, when: string, cat = 'c-e0', note = '') =>
  add(d, { type: 'expense', amount: amt, accountId: acc, categoryId: cat, note, occurredAt: when });

describe('結算期', () => {
  it('以開始日的月份命名：結算日 5 號，十月＝10/5～11/4', () => {
    expect(periodKey(new Date(2026, 9, 5), 5)).toBe('2026-10');
    expect(periodKey(new Date(2026, 10, 4, 23, 59), 5)).toBe('2026-10');
    expect(periodKey(new Date(2026, 10, 5), 5)).toBe('2026-11');
    expect(periodKey(new Date(2026, 0, 3), 5)).toBe('2025-12');
    const r = periodRange('2026-10', 5);
    expect(dayKey(r.start)).toBe('2026-10-05');
    expect(dayKey(r.end)).toBe('2026-11-05');
    const days = periodDays('2026-10', 5);
    expect(days[0]).toBe('2026-10-05');
    expect(days[days.length - 1]).toBe('2026-11-04');
  });
  it('結算日 1 號＝一般月份；31 號遇到短月份用月底', () => {
    expect(periodDays('2026-02', 1).length).toBe(28);
    expect(dayKey(periodRange('2026-02', 31).start)).toBe('2026-02-28');
    expect(periodKey(new Date(2026, 1, 28), 31)).toBe('2026-02');
    expect(periodKey(new Date(2026, 2, 30), 31)).toBe('2026-02');
  });
  it('前後切換期別跨年', () => {
    expect(shiftPeriod('2026-12', 1)).toBe('2027-01');
    expect(shiftPeriod('2026-01', -1)).toBe('2025-12');
  });
  it('本月收支、分類、每日曲線都照結算期；當日照日曆日', () => {
    let d = base();
    d.settings.settleDay = 5;
    d = exp(d, 'A', 100, at(10, 4)); // 11/4 → 十月期
    d = exp(d, 'A', 200, at(10, 5)); // 11/5 → 十一月期
    expect(totals(d, { period: '2026-10' }).expense).toBe(100);
    expect(totals(d, { period: '2026-11' }).expense).toBe(200);
    expect(totals(d, { day: '2026-11-04' }).expense).toBe(100);
    expect(categoryBreakdown(d, 'expense', '2026-10', null)[0].amount).toBe(100);
    const s = dailySeries(d, '2026-10', null);
    expect(s.length).toBe(31);
    expect(s[s.length - 1].expense).toBe(100); // 最後一天＝11/4
  });
});

describe('主帳與小帳戶分開（C）', () => {
  it('儲值悠遊卡、電子錢包＝主帳支出，分類為儲值；小帳戶內消費不算主帳', () => {
    let d = base();
    d = add(d, { type: 'transfer', amount: 500, accountId: 'A', toAccountId: 'E', occurredAt: at(10, 3) });
    d = add(d, { type: 'transfer', amount: 300, accountId: 'A', toAccountId: 'W1', occurredAt: at(10, 3) });
    d = exp(d, 'E', 40, at(10, 4)); // 搭車
    d = exp(d, 'W1', 120, at(10, 4));
    expect(totals(d, { period: '2026-11' })).toEqual({ income: 0, expense: 800 });
    expect(totals(d, { period: '2026-11', accountId: 'A' }).expense).toBe(800);
    const br = categoryBreakdown(d, 'expense', '2026-11', null);
    expect(br.map((x) => x.categoryId).sort()).toEqual([TOPUP_CAT_PREFIX + 'easycard', TOPUP_CAT_PREFIX + 'ewallet']);
    expect(allBalances(d).get('E')).toBe(100 + 500 - 40);
  });
  it('轉入投資、儲蓄＝轉帳，不算支出；剩餘可用只算一般帳戶', () => {
    let d = base();
    d = add(d, { type: 'transfer', amount: 1000, accountId: 'A', toAccountId: 'IC', occurredAt: at(10, 3) });
    d = add(d, { type: 'transfer', amount: 2000, accountId: 'B', toAccountId: 'S2', occurredAt: at(10, 3) });
    expect(totals(d, { period: '2026-11' })).toEqual({ income: 0, expense: 0 });
    expect(spendableTotal(d)).toBe(15000 - 3000);
  });
  it('「全部帳戶」明細：有碰到一般帳戶的才出現（儲值只記一次，同時在兩邊）', () => {
    let d = base();
    d = add(d, { type: 'transfer', amount: 500, accountId: 'A', toAccountId: 'E', occurredAt: at(10, 3) });
    d = exp(d, 'E', 40, at(10, 4));
    const k = kindLookup(d.accounts);
    expect(d.transactions.filter((t) => inMainLedger(t, k)).length).toBe(1);
    expect(d.transactions.length).toBe(2);
  });
});

describe('校正（調整紀錄）', () => {
  it('產生調整，只影響餘額，不算收支；差額 0 不產生', () => {
    let d = base();
    d = calibrate(d, 'E', 70, NOW);
    expect(allBalances(d).get('E')).toBe(70);
    const t = d.transactions[0];
    expect(t.type).toBe('adjust');
    expect(t.adjustDir).toBe('down');
    expect(t.amount).toBe(30);
    d = calibrate(d, 'W1', 250, NOW);
    expect(allBalances(d).get('W1')).toBe(250);
    expect(calibrate(d, 'W1', 250, NOW)).toBe(d);
    expect(totals(d, { period: '2026-11' })).toEqual({ income: 0, expense: 0 });
    d = calibrate(d, 'A', 9000, NOW); // 一般帳戶校正也不算收支
    expect(totals(d, { period: '2026-11' })).toEqual({ income: 0, expense: 0 });
    expect(spendableTotal(d)).toBe(14000);
  });
  it('投資標的不能用校正', () => {
    expect(() => calibrate(base(), 'H', 100)).toThrow(OpError);
  });
});

describe('投資（D）', () => {
  const hs = (d: AppData) => holdingStats(d.accounts.find((a) => a.id === 'H') as AppData['accounts'][number], d.transactions);
  it('買進、更新市值、部分賣出依平均成本扣本金、配息費用不算主帳', () => {
    let d = base();
    d = add(d, { type: 'transfer', amount: 5000, accountId: 'A', toAccountId: 'IC', occurredAt: at(10, 1) });
    d = add(d, { type: 'transfer', amount: 6000, accountId: 'IC', toAccountId: 'H', source: 'invest-buy', occurredAt: at(10, 2) });
    expect(hs(d)).toEqual({ principal: 6000, value: 6000, profit: 0 });
    d = updateMarketValue(d, 'H', 8000, new Date(2026, 10, 3));
    expect(hs(d)).toEqual({ principal: 6000, value: 8000, profit: 2000 });
    // 賣出一半現值 → 本金扣一半
    d = add(d, { type: 'transfer', amount: 4000, accountId: 'H', toAccountId: 'IC', source: 'invest-sell', occurredAt: at(10, 4) });
    expect(hs(d)).toEqual({ principal: 3000, value: 4000, profit: 1000 });
    d = add(d, { type: 'income', amount: 150, accountId: 'IC', source: 'invest-dividend', occurredAt: at(10, 5) });
    d = add(d, { type: 'expense', amount: 20, accountId: 'IC', source: 'invest-fee', occurredAt: at(10, 5) });
    const s = investSummary(d);
    expect(s.cash).toBe(1000 + 5000 - 6000 + 4000 + 150 - 20);
    expect(s.total).toBe(s.cash + 4000);
    expect(s.profit).toBe(1000);
    expect(ballTotal(d, 'invest')).toBe(s.total); // 首頁投資球顯示現值
    expect(totals(d, { period: '2026-11' })).toEqual({ income: 0, expense: 0 });
  });
  it('全部賣出：本金歸零', () => {
    let d = base();
    d = add(d, { type: 'transfer', amount: 1000, accountId: 'IC', toAccountId: 'H', occurredAt: at(10, 2) });
    d = add(d, { type: 'transfer', amount: 1200, accountId: 'H', toAccountId: 'IC', occurredAt: at(10, 3) });
    expect(hs(d)).toEqual({ principal: 0, value: 0, profit: 0 });
  });
  it('配息、費用不需要分類；一般收支仍然要', () => {
    expect(() => add(base(), { type: 'income', amount: 1, accountId: 'A', occurredAt: at(10, 1) })).toThrow(OpError);
  });
});

describe('儲蓄（E）與拖曳預設目的', () => {
  it('拖到儲蓄球預設最下面（最必要）的目標；投資球進待投入；電子錢包第一個', () => {
    const d = base();
    expect(ballDropTarget(d, 'saving')?.id).toBe('S2');
    expect(ballDropTarget(d, 'invest')?.id).toBe('IC');
    expect(ballDropTarget(d, 'ewallet')?.id).toBe('W1');
  });
  it('利息不算主帳收入；每個目標各自記已存', () => {
    let d = base();
    d = add(d, { type: 'income', amount: 80, accountId: 'S2', source: 'saving-interest', occurredAt: at(10, 3) });
    d = add(d, { type: 'transfer', amount: 1000, accountId: 'A', toAccountId: 'S1', source: 'saving-in', occurredAt: at(10, 3) });
    expect(totals(d, { period: '2026-11' })).toEqual({ income: 0, expense: 0 });
    expect(allBalances(d).get('S1')).toBe(1000);
    expect(allBalances(d).get('S2')).toBe(50080);
  });
});

describe('備註記憶與分類排序（G、H）', () => {
  /** 依序記幾筆，createdAt 依序遞增 */
  function withNotes(list: [string, string][]): AppData {
    let d = base();
    d.noteTags = []; // 不含範例常用標籤
    list.forEach(([note, cat], i) => {
      d = exp(d, 'A', 10, at(10, 1 + i), cat, note);
      d.transactions[d.transactions.length - 1].createdAt = at(10, 1 + i);
    });
    return d;
  }
  it('未選分類：全部最近 5 個不重複；選了分類：該分類最近的', () => {
    const d = withNotes([['a', 'c-e0'], ['b', 'c-e1'], ['c', 'c-e0'], ['a', 'c-e1'], ['d', 'c-e0'], ['e', 'c-e1'], ['f', 'c-e0']]);
    expect(suggestedNotes(d, null)).toEqual(['f', 'e', 'd', 'a', 'c']);
    expect(suggestedNotes(d, 'c-e1')).toEqual(['e', 'a', 'b']);
  });
  it('釘選排最前面、所有分類都看得到；刪除後不出現，再用到才回來', () => {
    let d = withNotes([['早餐店', 'c-e0'], ['便當', 'c-e1']]);
    d = togglePin(d, '早餐店');
    expect(suggestedNotes(d, 'c-e1')).toEqual(['早餐店', '便當']);
    expect(pinnedCount(d)).toBe(1);
    expect(allNotes(d)[0]).toMatchObject({ text: '早餐店', pinned: true });
    d = hideNote(d, '便當', new Date(2026, 10, 3));
    expect(allNotes(d).map((x) => x.text)).toEqual(['早餐店']);
    expect(suggestedNotes(d, null)).toEqual(['早餐店']);
    d = exp(d, 'A', 10, at(10, 4), 'c-e1', '便當');
    d.transactions[d.transactions.length - 1].createdAt = at(10, 4);
    expect(allNotes(d).map((x) => x.text)).toContain('便當');
  });
  it('自動排序關閉時照設定順序；開啟時依最近 90 天使用次數', () => {
    let d = base();
    d = exp(d, 'A', 10, at(10, 1), 'c-e3');
    d = exp(d, 'A', 10, at(10, 2), 'c-e3');
    d = exp(d, 'A', 10, at(10, 2), 'c-e2');
    for (let i = 0; i < 3; i++) d = exp(d, 'A', 10, at(5, 1), 'c-e5'); // 超過 90 天，不算
    expect(sortedCategories(d, 'expense', NOW)[0].id).toBe('c-e0');
    d.settings.autoSortCategories = true;
    expect(sortedCategories(d, 'expense', NOW).slice(0, 3).map((c) => c.id)).toEqual(['c-e3', 'c-e2', 'c-e0']);
  });
});

describe('舊資料升級', () => {
  it('v1 資料：補設定、標籤未釘選、投資帳戶變待投入', () => {
    const v1 = {
      version: 1,
      accounts: [{ id: 'I', name: '投資', kind: 'invest', initialBalance: 500, order: 0 }],
      transactions: [],
      categories: [],
      noteTags: [{ id: 'n0', text: '711', order: 0 }],
      settings: { defaultReimburseAccountId: null, lastUsedAccountId: null },
    };
    const d = migrate(v1);
    expect(d.version).toBe(2);
    expect(d.settings).toMatchObject({ settleDay: 1, autoSortCategories: false });
    expect(d.noteTags[0].pinned).toBe(false);
    expect(d.accounts[0].subtype).toBe('cash');
    expect(parseBackup(JSON.stringify({ data: v1 })).version).toBe(2);
  });
  it('範例資料可匯出再匯入；範例投資有損益', () => {
    const d = sampleData(NOW);
    expect(parseBackup(exportJson(d))).toEqual(d);
    expect(investSummary(d).profit).toBe(42500 - 40000);
  });
});
