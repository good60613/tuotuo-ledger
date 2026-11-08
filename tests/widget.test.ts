import { beforeEach, describe, expect, it } from 'vitest';
import { widgetSnapshot } from '../src/widget';
import { sampleData } from '../src/data/seed';
import { dayKey, periodKey, periodRange, spendableTotal, totals } from '../src/data/calc';
import { code39Widths } from '../src/data/carrier';
import { money } from '../src/format';
import { CARRIER } from '../src/config';
import { getState, setState, HOME_PAGE, PAGES } from '../src/store';
import { goHomeFromWidget, pushBackLayer, _resetBackLayers } from '../src/backNav';

describe('小工具的數字', () => {
  it('和首頁同一套算法（剩餘可用、今日支出、本期支出）', () => {
    const d = sampleData();
    const now = new Date();
    const s = widgetSnapshot(d, now);
    expect(s.left).toBe(money(spendableTotal(d)));
    expect(s.todayExpense).toBe(money(totals(d, { day: dayKey(now) }).expense));
    expect(s.monthExpense).toBe(money(totals(d, { period: periodKey(now, d.settings.settleDay) }).expense));
  });

  it('記下日期與本期結束日（給小工具判斷過期）', () => {
    const d = sampleData();
    d.settings.settleDay = 5;
    const now = new Date(2026, 10, 9, 10, 0); // 11/9
    const s = widgetSnapshot(d, now);
    expect(s.day).toBe('2026-11-09');
    expect(s.periodEnd).toBe(dayKey(periodRange(periodKey(now, 5), 5).end));
    expect(s.periodEnd).toBe('2026-12-05');
  });

  it('載具：沒設定或格式錯就沒有條碼；有設定就帶同一份條紋', () => {
    const d = sampleData();
    delete d.settings.carrierCode;
    expect(widgetSnapshot(d).bars).toEqual([]);
    d.settings.carrierCode = '/ABC1234';
    const s = widgetSnapshot(d);
    expect(s.carrier).toBe('/ABC1234');
    expect(s.bars).toEqual(code39Widths('/ABC1234', CARRIER.wideRatio));
    d.settings.carrierCode = '/BAD';
    expect(widgetSnapshot(d).bars).toEqual([]);
  });
});

describe('點小工具回首頁（記帳頁保留）', () => {
  const noWait = () => Promise.resolve();
  beforeEach(() => {
    _resetBackLayers();
    setState({ dialog: null, overlays: [], page: HOME_PAGE });
  });

  it('沒開東西：從明細回首頁', async () => {
    setState({ page: PAGES.indexOf('明細') });
    await goHomeFromWidget(noWait);
    expect(getState().page).toBe(HOME_PAGE);
  });

  it('記帳頁開著：保留記帳頁，關掉上面的選單，底下切回首頁', async () => {
    setState({
      page: PAGES.indexOf('明細'),
      overlays: [{ kind: 'sub', ball: 'saving' }, { kind: 'entry', mode: 'expense', accountId: null }],
    });
    let sheetClosed = false;
    pushBackLayer(() => (sheetClosed = true));
    await goHomeFromWidget(noWait);
    expect(sheetClosed).toBe(true);
    expect(getState().overlays.map((o) => o.kind)).toEqual(['sub', 'entry']);
    expect(getState().page).toBe(HOME_PAGE);
  });

  it('只有子畫面：關掉並回首頁', async () => {
    setState({ page: PAGES.indexOf('明細'), overlays: [{ kind: 'sub', ball: 'easycard' }] });
    await goHomeFromWidget(noWait);
    expect(getState().overlays.length).toBe(0);
    expect(getState().page).toBe(HOME_PAGE);
  });
});
