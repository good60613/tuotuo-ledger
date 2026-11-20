// 2.4 段B：首頁把帳戶卡拖到紀錄上＝改那筆的帳戶（走 updateTransaction），復原完全還原
import { describe, expect, it } from 'vitest';
import { allBalances, spendableTotal, totals, periodKey, pendingBudgetByAccount } from '../src/data/calc';
import { addTransaction, updateTransaction } from '../src/data/ops';
import { markBudgetPaid } from '../src/data/budget';
import { canReassign, reassignAccount, restoreTxs, shownAccountId } from '../src/data/reassign';
import { exportJson, parseBackup } from '../src/data/backup';
import { emptyData } from '../src/data/seed';
import type { AppData } from '../src/data/types';

const NOW = new Date(2026, 10, 18, 12, 0);
const iso = NOW.toISOString();

function base(): AppData {
  const d = emptyData();
  d.accounts = [
    { id: 'A', name: '現金', kind: 'bank', initialBalance: 10000, order: 0 },
    { id: 'B', name: 'LINE Bank', kind: 'bank', initialBalance: 5000, order: 1 },
    { id: 'E', name: '悠遊卡', kind: 'easycard', initialBalance: 500, order: 2 },
  ];
  return d;
}
const tx = (d: AppData, id: string) => d.transactions.find((t) => t.id === id)!;

describe('拖帳戶改紀錄', () => {
  it('一般支出：舊帳戶加回、新帳戶扣掉；本月、今日、剩餘可用不變；復原回原樣', () => {
    const r = addTransaction(base(), { type: 'expense', amount: 300, accountId: 'A', categoryId: 'c-e1', note: '午餐', occurredAt: iso });
    const before = r.data;
    const x = reassignAccount(before, r.id, 'B')!;
    expect(allBalances(x.data).get('A')).toBe(10000);
    expect(allBalances(x.data).get('B')).toBe(4700);
    expect(spendableTotal(x.data)).toBe(spendableTotal(before));
    const per = periodKey(NOW, before.settings.settleDay);
    expect(totals(x.data, { period: per })).toEqual(totals(before, { period: per }));
    const t2 = tx(x.data, r.id);
    expect([t2.note, t2.categoryId, t2.occurredAt, t2.amount]).toEqual(['午餐', 'c-e1', iso, 300]);
    expect(restoreTxs(x.data, x.olds)).toEqual(before);
  });

  it('同一個帳戶：不做事', () => {
    const r = addTransaction(base(), { type: 'expense', amount: 300, accountId: 'A', categoryId: 'c-e1', occurredAt: iso });
    expect(reassignAccount(r.data, r.id, 'A')).toBeNull();
  });

  it('改到小帳戶（悠遊卡）也可以', () => {
    const r = addTransaction(base(), { type: 'expense', amount: 100, accountId: 'A', categoryId: 'c-e1', occurredAt: iso });
    const x = reassignAccount(r.data, r.id, 'E')!;
    expect(allBalances(x.data).get('E')).toBe(400);
    expect(allBalances(x.data).get('A')).toBe(10000);
  });

  it('保留算式與拆帳群組、定期扣款標記', () => {
    let d = addTransaction(base(), { type: 'expense', amount: 500, accountId: 'A', categoryId: 'c-e1', occurredAt: iso, calcExpr: '1100−600', splitId: 's1' }).data;
    const id = d.transactions[0].id;
    d = { ...d, transactions: d.transactions.map((t) => ({ ...t, recurringId: 'R1', recurringMonth: '2026-11' })) };
    const t2 = tx(reassignAccount(d, id, 'B')!.data, id);
    expect([t2.calcExpr, t2.splitId, t2.recurringId, t2.recurringMonth]).toEqual(['1100−600', 's1', 'R1', '2026-11']);
  });

  it('未報帳的報帳可以改，標記保留；已報帳不行', () => {
    const r = addTransaction(base(), { type: 'expense', amount: 200, accountId: 'A', categoryId: 'c-e1', occurredAt: iso, reimbursable: true });
    const x = reassignAccount(r.data, r.id, 'B')!;
    expect(tx(x.data, r.id).reimbursable).toBe(true);
    expect(tx(x.data, r.id).reimburseStatus).toBe('pending');
    const done = { ...tx(x.data, r.id), reimburseStatus: 'done' as const };
    expect(canReassign(done)).toBe(false);
  });

  it('未付預算：可以改到另一個一般帳戶，「預」金額跟著移；不能改到小帳戶', () => {
    const r = addTransaction(base(), { type: 'expense', amount: 1000, accountId: 'A', categoryId: 'c-e1', occurredAt: iso, budget: true });
    const x = reassignAccount(r.data, r.id, 'B')!;
    expect(pendingBudgetByAccount(x.data).get('B')).toBe(1000);
    expect(pendingBudgetByAccount(x.data).get('A') ?? 0).toBe(0);
    expect(spendableTotal(x.data)).toBe(spendableTotal(r.data));
    expect(() => reassignAccount(r.data, r.id, 'E')).toThrow('預算只能掛在一般帳戶');
  });

  it('已付預算：改的是付款那筆，預算那列帳戶跟著顯示；復原兩列都回去', () => {
    const r = addTransaction(base(), { type: 'expense', amount: 1000, accountId: 'A', categoryId: 'c-e1', occurredAt: iso, budget: true });
    const d = markBudgetPaid(r.data, [{ id: r.id, amount: 1000 }], NOW, () => 'P1');
    const x = reassignAccount(d, r.id, 'B')!;
    expect(allBalances(x.data).get('A')).toBe(10000);
    expect(allBalances(x.data).get('B')).toBe(4000);
    expect(tx(x.data, 'P1').budgetOfId).toBe(r.id);
    expect(shownAccountId(x.data, tx(x.data, r.id))).toBe('B');
    expect(tx(x.data, r.id).accountId).toBe('B');
    expect(restoreTxs(x.data, x.olds)).toEqual(d);
    // 從付款那筆拖也一樣
    const y = reassignAccount(d, 'P1', 'B')!;
    expect(y.data.transactions).toEqual(x.data.transactions);
  });

  it('不能拖的紀錄類型', () => {
    let d = base();
    d = addTransaction(d, { type: 'transfer', amount: 100, accountId: 'A', toAccountId: 'B', occurredAt: iso }).data;
    d = addTransaction(d, { type: 'owed', amount: 100, accountId: '', categoryId: 'c-e1', occurredAt: iso }).data;
    d = addTransaction(d, { type: 'income', amount: 5, accountId: 'E', occurredAt: iso, source: 'saving-interest' }).data;
    for (const t of d.transactions) expect(canReassign(t)).toBe(false);
    expect(canReassign({ ...d.transactions[0], type: 'adjust' })).toBe(false);
    expect(canReassign({ ...d.transactions[0], type: 'reimburse_in' })).toBe(false);
  });

  it('改帳戶後備份匯出再匯入一致', () => {
    const r = addTransaction(base(), { type: 'expense', amount: 300, accountId: 'A', categoryId: 'c-e1', occurredAt: iso });
    const x = reassignAccount(r.data, r.id, 'B')!;
    const back = parseBackup(exportJson(x.data));
    expect(allBalances(back).get('B')).toBe(4700);
    expect(back.transactions).toEqual(x.data.transactions);
  });

  it('跟記帳頁編輯改帳戶結果一樣', () => {
    const r = addTransaction(base(), { type: 'expense', amount: 300, accountId: 'A', categoryId: 'c-e1', note: 'x', occurredAt: iso });
    const viaEdit = updateTransaction(r.data, r.id, { type: 'expense', amount: 300, accountId: 'B', categoryId: 'c-e1', note: 'x', occurredAt: iso, reimbursable: false, budget: false });
    expect(reassignAccount(r.data, r.id, 'B')!.data.transactions).toEqual(viaEdit.transactions);
  });
});
