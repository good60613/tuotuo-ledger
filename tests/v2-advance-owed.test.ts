// 2.0 第一批：我先付、朋友付的錢怎麼算、資料 v5、舊備份匯入。
import { describe, expect, it } from 'vitest';
import { allBalances, bankTotal, spendableTotal, totals, pendingOwedTotal, categoryBreakdown, periodKey, dayKey, inMainLedger, kindLookup } from '../src/data/calc';
import { addTransaction, deleteTransaction, updateTransaction, markReimbursed, revertBatch, removeAccount, OpError } from '../src/data/ops';
import { markBudgetPaid } from '../src/data/budget';
import { markOwedPaid, revertOwedPaid, normalizeOwed, OwedError } from '../src/data/owed';
import { emptyData, sampleData } from '../src/data/seed';
import { exportJson, parseBackup } from '../src/data/backup';
import { migrate } from '../src/data/migrate';
import { advanceOwedOn } from '../src/features';
import { DATA_VERSION, type AppData } from '../src/data/types';

const NOW = new Date(2026, 10, 10, 12, 0);
const AT = NOW.toISOString();
const per = periodKey(NOW, 1);
const today = dayKey(NOW);

/** 帳戶加總 14,004（一般帳戶 A 10,004＋B 4,000），另有電子錢包 W 500 */
function base(): AppData {
  const d = emptyData();
  d.accounts = [
    { id: 'A', name: '現金', kind: 'bank', initialBalance: 10004, order: 0 },
    { id: 'B', name: '郵局', kind: 'bank', initialBalance: 4000, order: 1 },
    { id: 'W', name: 'LINE Pay', kind: 'ewallet', initialBalance: 500, order: 0 },
  ];
  return d;
}
const tx = (d: AppData, id: string) => d.transactions.find((t) => t.id === id)!;
const owed = (d: AppData, amount = 600) =>
  addTransaction(d, { type: 'owed', amount, accountId: '', categoryId: 'c-e1', note: '吃飯', occurredAt: AT });
const advance = (d: AppData, amount = 600, accountId = 'A') =>
  addTransaction(d, { type: 'expense', amount, accountId, categoryId: 'c-e1', note: '吃飯', occurredAt: AT, reimbursable: true, reimburseKind: 'advance' });
const expenseOf = (d: AppData) => totals(d, { period: per }).expense;
const todayExp = (d: AppData) => totals(d, { day: today }).expense;

describe('工單驗算用例', () => {
  it('14,004、預算 1,000 → 13,004；朋友付 600 → 12,404；從現金還 600 → 帳戶 13,404、剩餘可用仍 12,404', () => {
    let d = base();
    d = addTransaction(d, { type: 'expense', amount: 1000, accountId: 'A', categoryId: 'c-e1', occurredAt: AT, budget: true }).data;
    expect(bankTotal(d)).toBe(14004);
    expect(spendableTotal(d)).toBe(13004);
    const o = owed(d);
    d = o.data;
    expect(spendableTotal(d)).toBe(12404);
    expect(bankTotal(d)).toBe(14004);
    d = markOwedPaid(d, [o.id], 'A', NOW);
    expect(bankTotal(d)).toBe(13404);
    expect(spendableTotal(d)).toBe(12404);
  });
});

describe('朋友付', () => {
  it('記帳當下（補強批）：帳戶都不動、本月／今日／分類支出都不算、剩餘可用減少', () => {
    const before = base();
    const { data: d, id } = owed(before);
    expect(allBalances(d)).toEqual(allBalances(before));
    expect(expenseOf(d)).toBe(0);
    expect(todayExp(d)).toBe(0);
    expect(categoryBreakdown(d, 'expense', per, null)).toEqual([]);
    expect(pendingOwedTotal(d)).toBe(600);
    expect(tx(d, id).accountId).toBe('');
    expect(tx(d, id).owedStatus).toBe('pending');
    expect(inMainLedger(tx(d, id), kindLookup(d.accounts))).toBe(true);
    // 指定單一帳戶的統計不含朋友付（朋友付沒有帳戶）
    expect(totals(d, { period: per, accountId: 'A' }).expense).toBe(0);
    // 不會改到「上次使用的帳戶」
    expect(d.settings.lastUsedAccountId).toBe(before.settings.lastUsedAccountId);
  });

  it('還錢（補強批）：用一般帳戶還＝這時才算支出、算在付款帳戶與原分類、剩餘可用不變、原紀錄已還', () => {
    const o = owed(base());
    const d = markOwedPaid(o.data, [o.id], 'B', NOW);
    expect(expenseOf(d)).toBe(600);
    expect(todayExp(d)).toBe(600);
    expect(totals(d, { period: per, accountId: 'B' }).expense).toBe(600);
    expect(categoryBreakdown(d, 'expense', per, null)).toEqual([{ categoryId: 'c-e1', amount: 600, ratio: 1 }]);
    expect(allBalances(d).get('B')).toBe(3400);
    expect(tx(d, o.id).owedStatus).toBe('paid');
    expect(pendingOwedTotal(d)).toBe(0);
  });

  it('從電子錢包還（PK 定案）：一般帳戶不動、剩餘可用加回 600、錢包少 600', () => {
    const o = owed(base());
    const s0 = spendableTotal(o.data);
    const d = markOwedPaid(o.data, [o.id], 'W', NOW);
    expect(allBalances(d).get('W')).toBe(-100);
    expect(bankTotal(d)).toBe(14004);
    expect(spendableTotal(d)).toBe(s0 + 600);
  });

  it('退回未還：還款那筆消失、錢加回、回到未還；不能重複還', () => {
    const o = owed(base());
    let d = markOwedPaid(o.data, [o.id], 'A', NOW);
    expect(() => markOwedPaid(d, [o.id], 'A', NOW)).toThrow(OwedError);
    d = revertOwedPaid(d, o.id);
    expect(d.transactions.some((t) => t.type === 'owed_repay')).toBe(false);
    expect(allBalances(d).get('A')).toBe(10004);
    expect(tx(d, o.id).owedStatus).toBe('pending');
    expect(spendableTotal(d)).toBe(14004 - 600);
  });

  it('已還不能改金額、不能刪；還款那筆不能直接刪；可改備註', () => {
    const o = owed(base());
    const d = markOwedPaid(o.data, [o.id], 'A', NOW);
    const input = { type: 'owed' as const, amount: 600, accountId: '', categoryId: 'c-e1', note: '和小明吃飯', occurredAt: AT };
    expect(tx(updateTransaction(d, o.id, input), o.id).note).toBe('和小明吃飯');
    expect(() => updateTransaction(d, o.id, { ...input, amount: 700 })).toThrow(OpError);
    expect(() => deleteTransaction(d, o.id)).toThrow(OpError);
    const r = d.transactions.find((t) => t.type === 'owed_repay')!;
    expect(() => deleteTransaction(d, r.id)).toThrow(OpError);
  });

  it('未還的朋友付改成一般支出：改成扣帳戶', () => {
    const o = owed(base());
    const d = updateTransaction(o.data, o.id, { type: 'expense', amount: 600, accountId: 'A', categoryId: 'c-e1', occurredAt: AT });
    expect(tx(d, o.id).type).toBe('expense');
    expect(tx(d, o.id).owedStatus).toBeUndefined();
    expect(allBalances(d).get('A')).toBe(9404);
    expect(pendingOwedTotal(d)).toBe(0);
  });

  it('刪掉付款帳戶（連紀錄一起刪）：朋友付回到未還，剩餘可用照扣', () => {
    const o = owed(base());
    let d = markOwedPaid(o.data, [o.id], 'B', NOW);
    d = removeAccount(d, 'B', { mode: 'deleteRecords' });
    expect(tx(d, o.id).owedStatus).toBe('pending');
    expect(spendableTotal(d)).toBe(10004 - 600);
  });

  it('朋友付不能同時是預算', () => {
    expect(() => addTransaction(base(), { type: 'owed', amount: 1, accountId: '', categoryId: 'c-e1', occurredAt: AT, budget: true })).toThrow(OpError);
  });
});

describe('我先付（比照報帳）', () => {
  it('記帳當下：帳戶扣款、剩餘可用減少、不算支出', () => {
    const { data: d, id } = advance(base());
    expect(allBalances(d).get('A')).toBe(9404);
    expect(spendableTotal(d)).toBe(13404);
    expect(expenseOf(d)).toBe(0);
    expect(categoryBreakdown(d, 'expense', per, null)).toEqual([]);
    expect(tx(d, id).reimburseStatus).toBe('pending');
    expect(tx(d, id).reimburseKind).toBe('advance');
  });

  it('收回到一般帳戶：錢加回、不算收入、原紀錄已收；可退回', () => {
    const a = advance(base());
    let d = markReimbursed(a.data, [a.id], 'B', NOW, 'b1');
    expect(allBalances(d).get('B')).toBe(4600);
    expect(spendableTotal(d)).toBe(14004);
    expect(totals(d, { period: per }).income).toBe(0);
    expect(tx(d, a.id).reimburseStatus).toBe('done');
    const inTx = d.transactions.find((t) => t.type === 'reimburse_in')!;
    expect(inTx.reimburseKind).toBe('advance');
    expect(inTx.note).toContain('我先付');
    d = revertBatch(d, 'b1');
    expect(spendableTotal(d)).toBe(13404);
    expect(tx(d, a.id).reimburseStatus).toBe('pending');
  });

  it('收回到 LINE Pay（小帳戶）：剩餘可用不加回、錢包多 600', () => {
    const a = advance(base());
    const d = markReimbursed(a.data, [a.id], 'W', NOW);
    expect(allBalances(d).get('W')).toBe(1100);
    expect(spendableTotal(d)).toBe(13404);
  });

  it('我先付和報帳不能同一批結案', () => {
    let d = advance(base()).data;
    d = addTransaction(d, { type: 'expense', amount: 100, accountId: 'A', categoryId: 'c-e1', occurredAt: AT, reimbursable: true }).data;
    const ids = d.transactions.map((t) => t.id);
    expect(() => markReimbursed(d, ids, 'A', NOW)).toThrow(OpError);
  });

  it('已收回的我先付不能改成報帳', () => {
    const a = advance(base());
    const d = markReimbursed(a.data, [a.id], 'A', NOW);
    expect(() =>
      updateTransaction(d, a.id, { type: 'expense', amount: 600, accountId: 'A', categoryId: 'c-e1', occurredAt: AT, reimbursable: true }),
    ).toThrow(OpError);
  });
});

describe('資料 v5 與舊備份', () => {
  it('v5 匯出再匯入：我先付、朋友付、還款、算式欄位全保留，金額不變', () => {
    let d = base();
    const o = owed(d);
    d = markOwedPaid(o.data, [o.id], 'A', NOW);
    d = owed(d, 300).data;
    const a = advance(d, 200);
    d = markReimbursed(a.data, [a.id], 'W', NOW);
    d = addTransaction(d, { type: 'expense', amount: 500, accountId: 'A', categoryId: 'c-e1', occurredAt: AT, calcExpr: '1100−600', splitId: 's1' }).data;
    d = addTransaction(d, { type: 'expense', amount: 1000, accountId: 'A', categoryId: 'c-e1', occurredAt: AT, budget: true }).data;
    const back = parseBackup(exportJson(d));
    expect(back.version).toBe(DATA_VERSION);
    expect(spendableTotal(back)).toBe(spendableTotal(d));
    expect(allBalances(back)).toEqual(allBalances(d));
    expect(JSON.parse(JSON.stringify(back.transactions))).toEqual(JSON.parse(JSON.stringify(d.transactions)));
  });

  it('舊 v4 備份照常匯入：沒有我先付朋友付、金額不變、外觀亮色、開關開啟', () => {
    const v4 = { ...sampleData(), version: 4 };
    const before = spendableTotal(v4 as unknown as AppData);
    const d = parseBackup(JSON.stringify(v4));
    expect(d.version).toBe(5);
    expect(spendableTotal(d)).toBe(before);
    expect(d.transactions.every((t) => !t.reimburseKind && t.type !== 'owed')).toBe(true);
    expect(d.settings.theme ?? 'light').toBe('light');
    expect(advanceOwedOn(d.settings)).toBe(true);
  });

  it('改壞的備份：已還但還款不見 → 回未還；孤兒還款 → 刪掉；朋友付帶帳戶 → 清掉', () => {
    const o = owed(base());
    const d = markOwedPaid(o.data, [o.id], 'A', NOW);
    const repay = d.transactions.find((t) => t.type === 'owed_repay')!;
    const broken1 = { ...d, transactions: d.transactions.filter((t) => t.id !== repay.id) };
    expect(tx(normalizeOwed(broken1), o.id).owedStatus).toBe('pending');
    const broken2 = { ...d, transactions: d.transactions.filter((t) => t.id !== o.id) };
    expect(normalizeOwed(broken2).transactions.some((t) => t.type === 'owed_repay')).toBe(false);
    const broken3 = migrate({ ...d, transactions: d.transactions.map((t) => (t.id === o.id ? { ...t, accountId: 'A' } : t)) });
    expect(tx(broken3, o.id).accountId).toBe('');
    expect(allBalances(broken3)).toEqual(allBalances(d));
  });

  it('亂填的我先付標記會被拿掉', () => {
    const d = base();
    d.transactions = [{ id: 'x', type: 'expense', amount: 1, accountId: 'A', categoryId: 'c-e1', note: '', occurredAt: AT, reimbursable: false, reimburseKind: 'advance', createdAt: AT }];
    expect(migrate(d).transactions[0].reimburseKind).toBeUndefined();
  });
});

describe('開關與共存', () => {
  it('缺值＝開；false＝關', () => {
    expect(advanceOwedOn({})).toBe(true);
    expect(advanceOwedOn({ advanceOwedEnabled: false })).toBe(false);
  });

  it('預算付款＋朋友付同時存在', () => {
    const b = addTransaction(base(), { type: 'expense', amount: 1000, accountId: 'A', categoryId: 'c-e1', occurredAt: AT, budget: true });
    let d = markBudgetPaid(b.data, [{ id: b.id, amount: 1000 }], NOW);
    d = owed(d).data;
    expect(spendableTotal(d)).toBe(14004 - 1000 - 600);
    // 朋友付還沒還，不算支出（補強批）
    expect(expenseOf(d)).toBe(1000);
  });
});
