import { beforeEach, describe, expect, it } from 'vitest';
import { widgetSnapshot, barSnapshot } from '../src/widget';
import { sampleData } from '../src/data/seed';
import { dayKey, periodKey, periodRange, spendableTotal, totals } from '../src/data/calc';
import { code39Widths } from '../src/data/carrier';
import { money } from '../src/format';
import { CARRIER } from '../src/config';
import { getState, setState, HOME_PAGE, PAGES } from '../src/store';
import { exportJson, readBackup } from '../src/data/backup';
import { notifBarOn, notifHideLockOn } from '../src/features';
import { addTransaction } from '../src/data/ops';
import { goHomeFromWidget, navFromNative, pushBackLayer, _resetBackLayers } from '../src/backNav';

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

describe('2.3 點小工具開新增記帳', () => {
  const noWait = () => Promise.resolve();
  beforeEach(() => {
    _resetBackLayers();
    setState({ dialog: null, overlays: [], page: HOME_PAGE, ready: true, blocked: null });
  });

  it('沒開東西：開支出分頁的記帳畫面', async () => {
    setState({ page: PAGES.indexOf('明細') });
    await navFromNative('entry', noWait);
    const top = getState().overlays[getState().overlays.length - 1];
    expect(top.kind).toBe('entry');
    expect((top as { mode: string }).mode).toBe('expense');
  });

  it('記帳頁已經開著：保留，不再多開一個', async () => {
    setState({ overlays: [{ kind: 'entry', mode: 'income', accountId: null }] });
    await navFromNative('entry', noWait);
    expect(getState().overlays.length).toBe(1);
    expect((getState().overlays[0] as { mode: string }).mode).toBe('income');
  });

  it('資料在保護狀態（讀不到）時不開', async () => {
    setState({ blocked: { reason: 'read', message: 'x' } as never });
    await navFromNative('entry', noWait);
    expect(getState().overlays.length).toBe(0);
  });
});

describe('2.3 通知欄按鈕：待辦、明細、搜尋', () => {
  const noWait = () => Promise.resolve();
  beforeEach(() => {
    _resetBackLayers();
    setState({ dialog: null, overlays: [], page: HOME_PAGE, ready: true, blocked: null, searchRequest: 0 });
  });

  it('待辦：換到待辦頁', async () => {
    await navFromNative('todo', noWait);
    expect(getState().page).toBe(PAGES.indexOf('待辦'));
  });

  it('明細：換到明細頁（不要求打開搜尋）', async () => {
    await navFromNative('detail', noWait);
    expect(getState().page).toBe(PAGES.indexOf('明細'));
    expect(getState().searchRequest).toBe(0);
  });

  it('搜尋：換到明細頁並要求直接打開搜尋，每按一次都會再要求', async () => {
    await navFromNative('search', noWait);
    expect(getState().page).toBe(PAGES.indexOf('明細'));
    expect(getState().searchRequest).toBe(1);
    await navFromNative('search', noWait);
    expect(getState().searchRequest).toBe(2);
  });

  it('疊層畫面開著（例如小帳戶子畫面）：先關掉再換頁', async () => {
    setState({ overlays: [{ kind: 'sub', ball: 'easycard' }] });
    await navFromNative('detail', noWait);
    expect(getState().overlays.length).toBe(0);
    expect(getState().page).toBe(PAGES.indexOf('明細'));
  });
});

describe('2.3 通知欄快捷列的數字', () => {
  it('剩餘可用、今日支出跟小工具同一套；今日收入照今日支出的邏輯算收入', () => {
    const d = sampleData();
    const now = new Date();
    const b = barSnapshot(d, now);
    const w = widgetSnapshot(d, now);
    expect(b.left).toBe(w.left);
    expect(b.leftNeg).toBe(w.leftNeg);
    expect(b.todayExpense).toBe(w.todayExpense);
    expect(b.todayIncome).toBe(money(totals(d, { day: dayKey(now) }).income));
    expect(b.day).toBe(dayKey(now));
    expect(b.zero).toBe(money(0));
  });

  it('預設：快捷列關、鎖定畫面隱藏金額；舊備份沒有這兩個設定也一樣', () => {
    const d = sampleData();
    const { notifBar: _a, notifHideOnLock: _b, ...old } = d.settings;
    const b = barSnapshot({ ...d, settings: old });
    expect(b.enabled).toBe(false);
    expect(b.hideOnLock).toBe(true);
  });

  it('設定打開／關掉隱藏：跟著進快照，也跟著進完整備份與只匯出設定', () => {
    const d = sampleData();
    d.settings = { ...d.settings, notifBar: true, notifHideOnLock: false };
    const b = barSnapshot(d);
    expect(b.enabled).toBe(true);
    expect(b.hideOnLock).toBe(false);
    for (const type of ['full', 'settings'] as const) {
      const s = readBackup(exportJson(d, type)).data.settings;
      expect(notifBarOn(s)).toBe(true);
      expect(notifHideLockOn(s)).toBe(false);
    }
  });

  it('今日收入：只算今天、只算主帳的收入（和今日支出同樣的規則）', () => {
    const d = sampleData();
    const now = new Date(2026, 10, 9, 15, 0);
    const bank = d.accounts.find((a) => a.kind === 'bank')!;
    const cat = d.categories.find((c) => c.type === 'income')!;
    const r = addTransaction(d, { type: 'income', amount: 777, accountId: bank.id, categoryId: cat.id, occurredAt: now.toISOString() });
    expect(barSnapshot(r.data, now).todayIncome).toBe(money(totals(r.data, { day: '2026-11-09' }).income));
    // 隔天：昨天的收入不算今天
    const tomorrow = new Date(2026, 10, 10, 9, 0);
    expect(barSnapshot(r.data, tomorrow).todayIncome).toBe(money(0));
  });
});
