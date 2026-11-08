// 第三批第 2 項：編輯帳戶改「目前金額」，差額自動產生校正（調整）紀錄
import { describe, expect, it } from 'vitest';
import { allBalances, spendableTotal, totals } from '../src/data/calc';
import { editAccount, OpError } from '../src/data/ops';
import { exportJson, parseBackup } from '../src/data/backup';
import { emptyData } from '../src/data/seed';
import type { AppData } from '../src/data/types';

const NOW = new Date(2026, 10, 8, 12, 0);

function base(): AppData {
  const d = emptyData();
  d.accounts = [
    { id: 'A', name: '薪轉', kind: 'bank', initialBalance: 10000, order: 0 },
    { id: 'E', name: '悠遊卡', kind: 'easycard', initialBalance: 100, order: 0 },
    { id: 'W', name: 'LINE Pay', kind: 'ewallet', initialBalance: 200, order: 0 },
    { id: 'S', name: '旅行', kind: 'saving', initialBalance: 0, target: 30000, order: 0 },
    { id: 'H', name: '0050', kind: 'invest', subtype: 'holding', initialBalance: 5000, order: 1 },
  ];
  d.transactions = [
    { id: 't1', type: 'expense', amount: 300, accountId: 'A', categoryId: 'c-e0', note: '', occurredAt: new Date(2026, 10, 2).toISOString(), reimbursable: false, createdAt: '2026-11-02T00:00:00Z' },
  ];
  return d;
}
const acc = (d: AppData, id: string) => d.accounts.find((a) => a.id === id)!;

describe('編輯帳戶：目前金額', () => {
  it('目前金額＝初始餘額＋紀錄推算', () => {
    expect(allBalances(base()).get('A')).toBe(9700);
  });

  it('改大：產生一筆向上的調整，差額＝新值－舊值；初始餘額不動', () => {
    const d = editAccount(base(), { ...acc(base(), 'A'), name: '薪轉2' }, 12000, NOW, 'adj');
    const t = d.transactions.find((x) => x.id === 'adj')!;
    expect(t).toMatchObject({ type: 'adjust', amount: 2300, adjustDir: 'up', accountId: 'A' });
    expect(allBalances(d).get('A')).toBe(12000);
    expect(acc(d, 'A').initialBalance).toBe(10000);
    expect(acc(d, 'A').name).toBe('薪轉2');
  });

  it('改小：產生一筆向下的調整', () => {
    const d = editAccount(base(), acc(base(), 'A'), 9000, NOW, 'adj');
    expect(d.transactions.find((x) => x.id === 'adj')).toMatchObject({ amount: 700, adjustDir: 'down' });
    expect(allBalances(d).get('A')).toBe(9000);
  });

  it('沒改金額：不產生紀錄（只改名稱也一樣）', () => {
    const d = editAccount(base(), { ...acc(base(), 'A'), name: '改名' }, 9700, NOW);
    expect(d.transactions.length).toBe(1);
    expect(acc(d, 'A').name).toBe('改名');
  });

  it('就算畫面傳來的帳戶帶著別的初始餘額，也不會被改', () => {
    const d = editAccount(base(), { ...acc(base(), 'A'), initialBalance: 99999 }, 9700, NOW);
    expect(acc(d, 'A').initialBalance).toBe(10000);
  });

  it('小數四捨五入到整數元', () => {
    const d = editAccount(base(), acc(base(), 'E'), 150.6, NOW, 'adj');
    expect(allBalances(d).get('E')).toBe(151);
    expect(d.transactions.find((x) => x.id === 'adj')?.amount).toBe(51);
  });

  it('悠遊卡、電子錢包、儲蓄都適用；儲蓄目標可同時改', () => {
    let d = editAccount(base(), acc(base(), 'W'), 50, NOW, 'w');
    d = editAccount(d, { ...acc(d, 'S'), target: 40000 }, 1000, NOW, 's');
    expect(allBalances(d).get('W')).toBe(50);
    expect(allBalances(d).get('S')).toBe(1000);
    expect(acc(d, 'S').target).toBe(40000);
  });

  it('投資標的不能用目前金額改（要用更新市值）；只改名稱可以', () => {
    expect(() => editAccount(base(), acc(base(), 'H'), 6000, NOW)).toThrow(OpError);
    const d = editAccount(base(), { ...acc(base(), 'H'), name: '元大50' }, null, NOW);
    expect(acc(d, 'H').name).toBe('元大50');
    expect(d.transactions.length).toBe(1);
  });

  it('校正不計入當月收支（月、日都一樣）', () => {
    const before = totals(base(), { period: '2026-11' });
    const d = editAccount(editAccount(base(), acc(base(), 'A'), 20000, NOW, 'a1'), acc(base(), 'E'), 0, NOW, 'a2');
    expect(totals(d, { period: '2026-11' })).toEqual(before);
    expect(totals(d, { day: '2026-11-08' })).toEqual({ income: 0, expense: 0 });
  });

  it('剩餘可用只算一般帳戶：校正小帳戶不影響，校正一般帳戶才影響', () => {
    const d0 = base();
    expect(spendableTotal(d0)).toBe(9700);
    const d1 = editAccount(d0, acc(d0, 'E'), 5000, NOW);
    expect(spendableTotal(d1)).toBe(9700);
    const d2 = editAccount(d1, acc(d1, 'A'), 8000, NOW);
    expect(spendableTotal(d2)).toBe(8000);
  });

  it('匯出再匯入後，餘額不變', () => {
    const d = editAccount(base(), acc(base(), 'A'), 12345, NOW, 'adj');
    const back = parseBackup(exportJson(d));
    expect([...allBalances(back)]).toEqual([...allBalances(d)]);
  });
});
