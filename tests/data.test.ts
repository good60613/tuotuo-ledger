import { describe, expect, it } from 'vitest';
import { allBalances, balanceOf, spendableTotal, totals, monthKey, dayKey, categoryBreakdown } from '../src/data/calc';
import {
  addTransaction, deleteTransaction, markReimbursed, revertBatch, removeAccount, removeCategory,
  updateTransaction, defaultReimburseAccount, OpError,
} from '../src/data/ops';
import { emptyData, sampleData } from '../src/data/seed';
import { exportJson, parseBackup } from '../src/data/backup';
import type { AppData } from '../src/data/types';

const NOW = new Date(2026, 10, 7, 12, 0); // 2026-11-07 中午
const iso = (d: number, h = 10) => new Date(2026, 10, d, h).toISOString();

function base(): AppData {
  const d = emptyData();
  d.accounts = [
    { id: 'A', name: '薪轉', kind: 'bank', initialBalance: 10000, order: 0 },
    { id: 'B', name: '郵局', kind: 'bank', initialBalance: 5000, order: 1 },
    { id: 'E', name: '悠遊卡', kind: 'easycard', initialBalance: 100, order: 0 },
    { id: 'W', name: 'LINE Pay', kind: 'ewallet', initialBalance: 200, order: 1 },
    { id: 'I', name: '投資', kind: 'invest', initialBalance: 50000, order: 2 },
    { id: 'S', name: '儲蓄', kind: 'saving', initialBalance: 80000, order: 3 },
    { id: 'O', name: '其他', kind: 'other', initialBalance: 50, order: 4 },
  ];
  return d;
}
const bal = (d: AppData, id: string) => balanceOf(id, d.accounts, d.transactions);
const month = monthKey(NOW);
const today = dayKey(NOW);

describe('餘額與金額區', () => {
  it('剩餘可用＝一般帳戶＋悠遊卡＋電子錢包＋其他，不含儲蓄與投資', () => {
    expect(spendableTotal(base())).toBe(10000 + 5000 + 100 + 200 + 50);
  });

  it('記一筆支出：帳戶餘額、剩餘可用、當月與當日支出都更新', () => {
    let d = base();
    d = addTransaction(d, { type: 'expense', amount: 120, accountId: 'A', categoryId: 'c-e1', occurredAt: NOW.toISOString() }).data;
    expect(bal(d, 'A')).toBe(9880);
    expect(spendableTotal(d)).toBe(15350 - 120);
    expect(totals(d.transactions, { month }).expense).toBe(120);
    expect(totals(d.transactions, { day: today }).expense).toBe(120);
  });

  it('轉帳：來源減、目的增，不算收支；轉到儲蓄會讓剩餘可用變少', () => {
    let d = base();
    d = addTransaction(d, { type: 'transfer', amount: 1000, accountId: 'A', toAccountId: 'S', occurredAt: NOW.toISOString() }).data;
    expect(bal(d, 'A')).toBe(9000);
    expect(bal(d, 'S')).toBe(81000);
    expect(totals(d.transactions, { month })).toEqual({ income: 0, expense: 0 });
    expect(spendableTotal(d)).toBe(15350 - 1000);
  });

  it('轉帳到悠遊卡（儲值）：剩餘可用不變', () => {
    let d = base();
    d = addTransaction(d, { type: 'transfer', amount: 500, accountId: 'A', toAccountId: 'E', occurredAt: NOW.toISOString() }).data;
    expect(bal(d, 'E')).toBe(600);
    expect(spendableTotal(d)).toBe(15350);
  });

  it('allBalances 與 balanceOf 結果一致', () => {
    const d = sampleData(NOW);
    const m = allBalances(d);
    for (const a of d.accounts) expect(m.get(a.id)).toBe(bal(d, a.id));
  });
});

describe('輸入檢查', () => {
  it('金額 0、沒分類、轉帳來源目的相同都會擋下', () => {
    const d = base();
    expect(() => addTransaction(d, { type: 'expense', amount: 0, accountId: 'A', categoryId: 'x', occurredAt: iso(1) })).toThrow(OpError);
    expect(() => addTransaction(d, { type: 'expense', amount: 10, accountId: 'A', occurredAt: iso(1) })).toThrow(OpError);
    expect(() => addTransaction(d, { type: 'transfer', amount: 10, accountId: 'A', toAccountId: 'A', occurredAt: iso(1) })).toThrow(OpError);
  });
});

describe('報帳流程（PK 確認過的邏輯）', () => {
  it('完整流程：記報帳支出 → 已報帳 → 退回 → 再報帳，餘額始終正確、不重複扣款、不計入當月收支', () => {
    let d = base();
    // 1. 記一筆報帳支出 860，從郵局扣
    const r = addTransaction(d, {
      type: 'expense', amount: 860, accountId: 'B', categoryId: 'c-e2', occurredAt: iso(4, 19), reimbursable: true,
    });
    d = r.data;
    const t = d.transactions.find((x) => x.id === r.id)!;
    expect(t.reimburseStatus).toBe('pending');
    expect(bal(d, 'B')).toBe(5000 - 860); // 扣款
    expect(spendableTotal(d)).toBe(15350 - 860); // 總剩餘跟著減少
    expect(totals(d.transactions, { month })).toEqual({ income: 0, expense: 0 }); // 不計入當月支出

    // 2. 按已報帳，錢退回薪轉帳戶，按下當天新增一筆報帳入帳
    d = markReimbursed(d, [r.id], 'A', NOW, 'batch1');
    const inTx = d.transactions.find((x) => x.type === 'reimburse_in')!;
    expect(inTx.amount).toBe(860);
    expect(dayKey(inTx.occurredAt)).toBe(today);
    expect(bal(d, 'A')).toBe(10000 + 860);
    expect(bal(d, 'B')).toBe(5000 - 860); // 原扣款不變，不會重複扣
    expect(spendableTotal(d)).toBe(15350); // 錢回來了
    expect(totals(d.transactions, { month })).toEqual({ income: 0, expense: 0 }); // 入帳也不計入當月收入
    expect(d.transactions.filter((x) => x.type === 'expense').length).toBe(1); // 沒有多出支出

    // 3. 退回待報帳：入帳的錢從薪轉扣回
    d = revertBatch(d, 'batch1');
    expect(d.transactions.some((x) => x.type === 'reimburse_in')).toBe(false);
    expect(d.transactions[0].reimburseStatus).toBe('pending');
    expect(bal(d, 'A')).toBe(10000);
    expect(bal(d, 'B')).toBe(5000 - 860);

    // 4. 再報帳一次，結果與第一次相同（不會累積）
    d = markReimbursed(d, [r.id], 'A', NOW, 'batch2');
    expect(bal(d, 'A')).toBe(10860);
    expect(d.transactions.filter((x) => x.type === 'reimburse_in').length).toBe(1);
  });

  it('多選報帳：合計入帳，整批退回', () => {
    let d = base();
    const a = addTransaction(d, { type: 'expense', amount: 100, accountId: 'B', categoryId: 'c', occurredAt: iso(1), reimbursable: true });
    d = a.data;
    const b = addTransaction(d, { type: 'expense', amount: 250, accountId: 'A', categoryId: 'c', occurredAt: iso(2), reimbursable: true });
    d = b.data;
    d = markReimbursed(d, [a.id, b.id], 'B', NOW, 'bb');
    expect(d.transactions.find((x) => x.type === 'reimburse_in')!.amount).toBe(350);
    expect(bal(d, 'B')).toBe(5000 - 100 + 350);
    d = revertBatch(d, 'bb');
    expect(d.transactions.filter((x) => x.reimburseStatus === 'pending').length).toBe(2);
    expect(bal(d, 'B')).toBe(4900);
    expect(bal(d, 'A')).toBe(9750);
  });

  it('不能重複報帳同一筆', () => {
    let d = base();
    const a = addTransaction(d, { type: 'expense', amount: 100, accountId: 'B', categoryId: 'c', occurredAt: iso(1), reimbursable: true });
    d = markReimbursed(a.data, [a.id], 'A', NOW);
    expect(() => markReimbursed(d, [a.id], 'A', NOW)).toThrow(OpError);
  });

  it('預設退回帳戶：有設定用設定，沒設定用第一筆的扣款帳戶', () => {
    let d = base();
    const a = addTransaction(d, { type: 'expense', amount: 100, accountId: 'B', categoryId: 'c', occurredAt: iso(1), reimbursable: true });
    d = a.data;
    expect(defaultReimburseAccount(d, [a.id])).toBe('B');
    d = { ...d, settings: { ...d.settings, defaultReimburseAccountId: 'A' } };
    expect(defaultReimburseAccount(d, [a.id])).toBe('A');
  });

  it('已報帳的紀錄不能改金額或刪除（要先退回）', () => {
    let d = base();
    const a = addTransaction(d, { type: 'expense', amount: 100, accountId: 'B', categoryId: 'c', occurredAt: iso(1), reimbursable: true });
    d = markReimbursed(a.data, [a.id], 'A', NOW);
    expect(() => deleteTransaction(d, a.id)).toThrow(OpError);
    expect(() =>
      updateTransaction(d, a.id, { type: 'expense', amount: 200, accountId: 'B', categoryId: 'c', occurredAt: iso(1), reimbursable: true }),
    ).toThrow(OpError);
    // 改備註可以
    const d2 = updateTransaction(d, a.id, { type: 'expense', amount: 100, accountId: 'B', categoryId: 'c', note: '改', occurredAt: iso(1), reimbursable: true });
    expect(d2.transactions.find((x) => x.id === a.id)!.note).toBe('改');
  });

  it('報帳支出不出現在統計分類中', () => {
    let d = base();
    d = addTransaction(d, { type: 'expense', amount: 100, accountId: 'B', categoryId: 'c1', occurredAt: NOW.toISOString(), reimbursable: true }).data;
    d = addTransaction(d, { type: 'expense', amount: 40, accountId: 'B', categoryId: 'c2', occurredAt: NOW.toISOString() }).data;
    const br = categoryBreakdown(d.transactions, 'expense', month, null);
    expect(br.map((x) => x.categoryId)).toEqual(['c2']);
  });
});

describe('刪除帳戶與分類', () => {
  it('紀錄移到另一個帳戶：總額不變', () => {
    let d = base();
    d = addTransaction(d, { type: 'expense', amount: 300, accountId: 'B', categoryId: 'c', occurredAt: iso(1) }).data;
    d = addTransaction(d, { type: 'transfer', amount: 100, accountId: 'A', toAccountId: 'B', occurredAt: iso(1) }).data;
    const before = spendableTotal(d);
    d = removeAccount(d, 'B', { mode: 'move', targetId: 'A' });
    expect(d.accounts.some((a) => a.id === 'B')).toBe(false);
    expect(spendableTotal(d)).toBe(before);
    expect(d.transactions.some((t) => t.type === 'transfer')).toBe(false); // A→A 的轉帳被移除
  });

  it('連同紀錄刪除時，報帳入帳被刪則剩下的回到待報帳', () => {
    let d = base();
    const a = addTransaction(d, { type: 'expense', amount: 100, accountId: 'B', categoryId: 'c', occurredAt: iso(1), reimbursable: true });
    d = markReimbursed(a.data, [a.id], 'A', NOW, 'x');
    d = removeAccount(d, 'A', { mode: 'deleteRecords' });
    expect(d.transactions.find((t) => t.id === a.id)!.reimburseStatus).toBe('pending');
    expect(bal(d, 'B')).toBe(4900);
  });

  it('分類搬移', () => {
    let d = base();
    d = addTransaction(d, { type: 'expense', amount: 10, accountId: 'A', categoryId: 'c-e0', occurredAt: iso(1) }).data;
    d = removeCategory(d, 'c-e0', { mode: 'move', targetId: 'c-e1' });
    expect(d.transactions[0].categoryId).toBe('c-e1');
  });
});

describe('備份', () => {
  it('匯出再匯入可完整還原', () => {
    const d = sampleData(NOW);
    expect(parseBackup(exportJson(d))).toEqual(d);
  });
  it('亂七八糟的檔案會被拒絕', () => {
    expect(() => parseBackup('{"a":1}')).toThrow();
    expect(() => parseBackup('not json')).toThrow();
  });
});
