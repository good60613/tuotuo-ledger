// 3.0 從其他軟體匯入：匯入前檢查、日期統一、摘要、範本
import { describe, it, expect } from 'vitest';
import { sampleData } from '../src/data/seed';
import { legacySampleData } from './fixtures/legacySample';
import { exportJson, parseBackup } from '../src/data/backup';
import { checkImport, normalizeImport, importSummary, templateData, formatDoc } from '../src/data/aiImport';
import { allBalances } from '../src/data/calc';
import type { AppData } from '../src/data/types';

const roundTrip = (d: AppData) => parseBackup(exportJson(d, 'full'));

describe('自己匯出的備份一定通過檢查、匯入後完全不變', () => {
  for (const [name, d] of [['3.0 範例', sampleData()], ['2.x 範例', legacySampleData()]] as const) {
    it(name, () => {
      const back = roundTrip(d);
      expect(checkImport(back)).toEqual([]);
      expect(normalizeImport(back)).toEqual(back);
    });
  }
});

describe('AI 做錯的地方會被抓出來，訊息可以貼回給 AI', () => {
  const base = () => roundTrip(templateData(sampleData()));
  const tx = (p: object) => ({ id: 'x1', type: 'expense', amount: 120, accountId: 'a-salary', categoryId: 'c-e1', note: '午餐', occurredAt: '2026-03-04T04:00:00.000Z', createdAt: '2026-03-04T04:00:00.000Z', reimbursable: false, ...p });

  it('帳戶不存在', () => {
    const d = base();
    d.transactions = [tx({ accountId: 'a-9' })] as AppData['transactions'];
    expect(checkImport(d)).toEqual(['第 1 筆紀錄（2026-03-04 午餐 $120）：帳戶「a-9」不存在']);
  });
  it('分類不存在、支出用了收入分類、type 不對、金額不對、日期不對、id 重複', () => {
    const d = base();
    d.transactions = [
      tx({ id: 'a', categoryId: 'c-x' }),
      tx({ id: 'b', categoryId: 'c-i0' }),
      tx({ id: 'c', type: 'spend' }),
      tx({ id: 'd', amount: -5 }),
      tx({ id: 'e', occurredAt: '昨天' }),
      tx({ id: 'e' }),
      tx({ id: 'f', type: 'transfer', categoryId: undefined, toAccountId: 'nope' }),
    ] as AppData['transactions'];
    const errs = checkImport(d).join('\n');
    expect(errs).toContain('分類「c-x」不存在');
    expect(errs).toContain('支出用了收入分類');
    expect(errs).toContain('type「spend」不對');
    expect(errs).toContain('amount 要是正整數');
    expect(errs).toContain('不是正確的日期時間');
    expect(errs).toContain('id「e」跟別筆重複');
    expect(errs).toContain('轉入帳戶（toAccountId）「nope」不存在');
  });
  it('帳戶種類不對、id 重複', () => {
    const d = base();
    d.accounts = [...d.accounts, { ...d.accounts[0], kind: 'credit' as never }];
    const errs = checkImport(d).join('\n');
    expect(errs).toContain('跟別的帳戶重複');
    expect(errs).toContain('kind「credit」不對');
  });
});

describe('日期統一、摘要', () => {
  it('台灣時間寫法統一成 App 的格式；餘額照 initialBalance＋紀錄算', () => {
    const d = roundTrip(templateData(sampleData()));
    d.accounts = d.accounts.map((a) => (a.id === 'a-salary' ? { ...a, initialBalance: 1000 } : a));
    d.transactions = [
      { id: 'x', type: 'income', amount: 500.4, accountId: 'a-salary', categoryId: 'c-i0', note: '', occurredAt: '2026-11-20T12:10:00+08:00', createdAt: '', reimbursable: false },
    ] as AppData['transactions'];
    const n = normalizeImport(d);
    expect(n.transactions[0].occurredAt).toBe('2026-11-20T04:10:00.000Z');
    expect(n.transactions[0].createdAt).toBe('2026-11-20T04:10:00.000Z');
    expect(n.transactions[0].amount).toBe(500);
    expect(allBalances(n).get('a-salary')).toBe(1500);
    expect(importSummary(n)).toContain('紀錄 1 筆（2026/11/20～2026/11/20）');
    expect(importSummary(n)).toContain('・薪轉帳戶　$1,500');
  });
  it('範本：沒有紀錄、沒有範例標記；格式說明的範例本身通過檢查', () => {
    const t = templateData(sampleData());
    expect(t.transactions).toEqual([]);
    expect(t.settings.sample).toBeUndefined();
    const doc = formatDoc();
    const examples = [...doc.matchAll(/^\{ "id": "t-\d".*\}$/gm)].map((m) => JSON.parse(m[0]));
    expect(examples).toHaveLength(3);
    const d = roundTrip(t);
    d.accounts = [...d.accounts, { id: 'a-1', name: '銀行', kind: 'bank', initialBalance: 0, order: 9 }, { id: 'a-2', name: '現金2', kind: 'bank', initialBalance: 0, order: 10 }];
    d.categories = d.categories.map((c) => c);
    d.transactions = examples;
    expect(checkImport(d)).toEqual([]);
  });
});
