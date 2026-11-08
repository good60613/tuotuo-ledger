// 第三批第 7 項：備份檔格式（完整備份／只有設定、新舊檔相容、對不上的紀錄要先選去處）
import { describe, expect, it } from 'vitest';
import { applySettingsImport, checkSettingsImport, exportJson, parseBackup, readBackup, BACKUP_FILE_VERSION } from '../src/data/backup';
import { migrate } from '../src/data/migrate';
import { emptyData, sampleData } from '../src/data/seed';
import { allBalances } from '../src/data/calc';
import { DATA_VERSION, type AppData } from '../src/data/types';
import { DEFAULT_COLOR, MISSING_ICON } from '../src/categoryStyle';

function v2Data(): Record<string, unknown> {
  const d = sampleData(new Date(2026, 10, 7, 12));
  // 模擬第二批的資料：版本 2、分類沒有顏色，其中一個連圖示都沒有
  const cats = d.categories.map(({ color: _c, ...c }) => c) as Record<string, unknown>[];
  cats[0].icon = '';
  return { ...d, version: 2, categories: cats };
}

describe('備份檔格式', () => {
  it('完整備份帶有類型與版本欄位，讀回來完全一樣', () => {
    const d = sampleData();
    const obj = JSON.parse(exportJson(d, 'full'));
    expect(obj.type).toBe('full');
    expect(obj.fileVersion).toBe(BACKUP_FILE_VERSION);
    const r = readBackup(JSON.stringify(obj));
    expect(r.type).toBe('full');
    expect(r.data).toEqual(d);
  });

  it('只匯出設定：沒有紀錄，帳戶初始餘額、順序、分類圖示顏色、標籤、結算日都在', () => {
    const d = sampleData();
    d.settings.settleDay = 25;
    const obj = JSON.parse(exportJson(d, 'settings'));
    expect(obj.type).toBe('settings');
    expect(obj.data.transactions).toBeUndefined();
    const r = readBackup(JSON.stringify(obj));
    expect(r.type).toBe('settings');
    expect(r.data.accounts).toEqual(d.accounts);
    expect(r.data.categories).toEqual(d.categories);
    expect(r.data.noteTags).toEqual(d.noteTags);
    expect(r.data.settings.settleDay).toBe(25);
    expect('transactions' in r.data).toBe(false);
  });

  it('舊版備份檔（第二批，沒有類型欄位、分類沒有顏色）當完整備份匯入，補上預設值', () => {
    const old = JSON.stringify({ app: 'ledger-app', exportedAt: '2026-11-07T00:00:00Z', data: v2Data() });
    const r = readBackup(old);
    expect(r.type).toBe('full');
    expect(r.data.version).toBe(DATA_VERSION);
    expect(r.data.categories.every((c) => c.color === DEFAULT_COLOR)).toBe(true);
    expect(r.data.categories[0].icon).toBe(MISSING_ICON);
    expect(r.data.categories[1].icon).toBe('🍱'); // 有圖示的保留
    const full = parseBackup(old);
    expect(full.transactions.length).toBeGreaterThan(0);
    expect(full.categories).toEqual(r.data.categories);
  });

  it('第一批的備份檔（version 1、沒有外層包裝）也能匯入', () => {
    const v1 = { ...v2Data(), version: 1 } as Record<string, unknown>;
    const settings = { ...(v1.settings as object) } as Record<string, unknown>;
    delete settings.settleDay;
    delete settings.autoSortCategories;
    v1.settings = settings;
    v1.accounts = (v1.accounts as { kind: string }[]).filter((a) => a.kind !== 'invest');
    v1.transactions = (v1.transactions as { accountId: string; toAccountId?: string }[]).filter(
      (t) => !['a-invest', 'a-0050'].includes(t.accountId) && !['a-invest', 'a-0050'].includes(t.toAccountId ?? ''),
    );
    const r = readBackup(JSON.stringify(v1));
    expect(r.type).toBe('full');
    expect(r.data.settings.settleDay).toBe(1);
    expect(r.data.accounts.some((a) => a.kind === 'invest' && a.subtype === 'cash')).toBe(true);
    expect(r.data.categories.every((c) => c.color === DEFAULT_COLOR)).toBe(true);
  });

  it('只有設定的檔案不能當完整備份讀', () => {
    expect(() => parseBackup(exportJson(sampleData(), 'settings'))).toThrow();
  });

  it('不是備份檔、或比 App 新的檔案會擋下', () => {
    expect(() => readBackup('不是 JSON')).toThrow();
    expect(() => readBackup(JSON.stringify({ hello: 1 }))).toThrow();
    const newer = JSON.parse(exportJson(sampleData()));
    newer.fileVersion = BACKUP_FILE_VERSION + 1;
    expect(() => readBackup(JSON.stringify(newer))).toThrow(/較新版本/);
    expect(() => migrate({ ...sampleData(), version: DATA_VERSION + 1 })).toThrow();
  });
});

describe('只匯入設定', () => {
  const setup = () => {
    const cur = sampleData(new Date(2026, 10, 7, 12));
    const inc = readBackup(exportJson(cur, 'settings')).data as Omit<AppData, 'transactions'>;
    return { cur, inc };
  };

  it('帳戶與分類都對得上：只換設定，紀錄一筆都不動', () => {
    const { cur, inc } = setup();
    inc.accounts = inc.accounts.map((a) => (a.id === 'a-cash' ? { ...a, name: '錢包', initialBalance: 5000 } : a));
    inc.settings = { ...inc.settings, settleDay: 10 };
    expect(checkSettingsImport(cur, inc)).toEqual({ missingAccounts: [], missingCategories: [] });
    const { data, removedSelfTransfers } = applySettingsImport(cur, inc);
    expect(data.transactions).toEqual(cur.transactions);
    expect(removedSelfTransfers).toBe(0);
    expect(data.accounts.find((a) => a.id === 'a-cash')?.name).toBe('錢包');
    expect(data.settings.settleDay).toBe(10);
    // 初始餘額改了，目前金額跟著從紀錄重算
    expect(allBalances(data).get('a-cash')).toBe((allBalances(cur).get('a-cash') ?? 0) + 2000);
  });

  it('找不到的帳戶、分類會列出來，同種類的才當去處；沒選去處不能匯入', () => {
    const { cur, inc } = setup();
    inc.accounts = inc.accounts.filter((a) => a.id !== 'a-cash');
    inc.categories = inc.categories.filter((c) => c.id !== 'c-e3');
    const check = checkSettingsImport(cur, inc);
    expect(check.missingAccounts.map((m) => [m.id, m.name, m.count])).toEqual([['a-cash', '現金', 3]]);
    expect(check.missingAccounts[0].candidates.every((a) => a.kind === 'bank')).toBe(true);
    expect(check.missingCategories.map((m) => [m.id, m.name, m.count])).toEqual([['c-e3', '飲料', 2]]);
    expect(check.missingCategories[0].candidates.every((c) => c.type === 'expense')).toBe(true);
    expect(() => applySettingsImport(cur, inc)).toThrow();
    // 檢查本身不改資料
    expect(cur.transactions.filter((t) => t.accountId === 'a-cash').length).toBe(3);
  });

  it('照選的去處搬移：筆數不變、金額總和不變', () => {
    const { cur, inc } = setup();
    inc.accounts = inc.accounts.filter((a) => a.id !== 'a-cash');
    inc.categories = inc.categories.filter((c) => c.id !== 'c-e3');
    const { data, removedSelfTransfers } = applySettingsImport(cur, inc, {
      accounts: { 'a-cash': 'a-post' },
      categories: { 'c-e3': 'c-e0' },
    });
    expect(removedSelfTransfers).toBe(0);
    expect(data.transactions.length).toBe(cur.transactions.length);
    expect(data.transactions.some((t) => t.accountId === 'a-cash' || t.categoryId === 'c-e3')).toBe(false);
    expect(data.transactions.filter((t) => t.categoryId === 'c-e0').length).toBe(3);
    const sum = (d: AppData) => d.transactions.reduce((s, t) => s + t.amount, 0);
    expect(sum(data)).toBe(sum(cur));
  });

  it('不能把一般帳戶的紀錄搬到其他種類的帳戶（例如投資標的）', () => {
    const { cur, inc } = setup();
    inc.accounts = inc.accounts.filter((a) => a.id !== 'a-cash');
    expect(() => applySettingsImport(cur, inc, { accounts: { 'a-cash': 'a-0050' }, categories: {} })).toThrow();
  });

  it('搬完變成自己轉給自己的轉帳會移除並回報筆數；預設報帳帳戶找不到就清掉', () => {
    const { cur, inc } = setup();
    // 薪轉 → 悠遊卡 的轉帳：把悠遊卡搬到…不行（不同種類）。改用一般帳戶互轉：
    cur.transactions.push({
      id: 'x1', type: 'transfer', amount: 100, accountId: 'a-salary', toAccountId: 'a-post', note: '', occurredAt: '2026-11-03T00:00:00Z',
      reimbursable: false, createdAt: '2026-11-03T00:00:00Z',
    });
    inc.accounts = inc.accounts.filter((a) => a.id !== 'a-salary');
    const { data, removedSelfTransfers } = applySettingsImport(cur, inc, {
      accounts: { 'a-salary': 'a-post' },
      categories: {},
    });
    expect(removedSelfTransfers).toBe(1);
    expect(data.transactions.find((t) => t.id === 'x1')).toBeUndefined();
    expect(data.settings.defaultReimburseAccountId).toBeNull();
  });

  it('空帳本匯入設定：直接套用', () => {
    const cur = emptyData();
    const inc = readBackup(exportJson(sampleData(), 'settings')).data as Omit<AppData, 'transactions'>;
    expect(checkSettingsImport(cur, inc).missingAccounts).toEqual([]);
    const { data } = applySettingsImport(cur, inc);
    expect(data.accounts.length).toBe(inc.accounts.length);
    expect(data.transactions).toEqual([]);
  });
});
