// 2.x 的舊範例資料：舊測試的數字照它寫（3.0 範例資料重做後搬來這裡當測試固定資料）
import type { Account, AppData, Transaction } from '../../src/data/types';
import { emptyData } from '../../src/data/seed';
import { withAccountIcon } from '../../src/categoryStyle';

function smallAccounts(scale: number): Account[] {
  return [
    { id: 'a-easy', name: '悠遊卡', kind: 'easycard', initialBalance: 350 * scale, order: 0 },
    { id: 'a-linepay', name: 'LINE Pay', kind: 'ewallet', initialBalance: 1200 * scale, order: 1 },
    { id: 'a-jko', name: '街口支付', kind: 'ewallet', initialBalance: 300 * scale, order: 2 },
    { id: 'a-invest', name: '待投入', kind: 'invest', subtype: 'cash', initialBalance: 20000 * scale, order: 0 },
    ...(scale
      ? [{ id: 'a-0050', name: '0050', kind: 'invest' as const, subtype: 'holding', initialBalance: 30000, order: 1 }]
      : []),
    // 儲蓄目標：越下面（order 越大）越必要
    ...(scale
      ? [{ id: 'a-travel', name: '旅行', kind: 'saving' as const, initialBalance: 20000, target: 50000, order: 0 }]
      : []),
    { id: 'a-saving', name: '緊急預備金', kind: 'saving', initialBalance: 100000 * scale, target: 150000, order: 1 },
    { id: 'a-other', name: '其他', kind: 'other', initialBalance: 0, order: 5 },
  ].map((a) => withAccountIcon(a as Account));
}

export function legacySampleData(now: Date = new Date()): AppData {
  const d = emptyData();
  d.accounts = [
    { id: 'a-salary', name: '薪轉帳戶', kind: 'bank', initialBalance: 45000, order: 0 },
    { id: 'a-post', name: '郵局', kind: 'bank', initialBalance: 18000, order: 1 },
    { id: 'a-cathay', name: '國泰', kind: 'bank', initialBalance: 9000, order: 2 },
    { id: 'a-taishin', name: '台新', kind: 'bank', initialBalance: 6000, order: 3 },
    { id: 'a-cash', name: '現金', kind: 'bank', initialBalance: 3000, order: 4 },
    ...smallAccounts(1),
  ].map((a) => withAccountIcon(a as Account));
  d.settings.defaultReimburseAccountId = 'a-salary';

  const y = now.getFullYear();
  const m = now.getMonth();
  const today = now.getDate();
  const at = (day: number, h: number, min = 0) => new Date(y, m, Math.min(day, today), h, min).toISOString();
  let n = 0;
  const tx = (p: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'accountId' | 'occurredAt'>): Transaction => ({
    id: `s${n++}`,
    note: '',
    reimbursable: false,
    createdAt: p.occurredAt,
    ...p,
  });

  d.transactions = [
    tx({ type: 'income', amount: 42000, accountId: 'a-salary', categoryId: 'c-i0', note: '本月薪水', occurredAt: at(1, 9) }),
    tx({ type: 'expense', amount: 65, accountId: 'a-cash', categoryId: 'c-e0', note: '麥噹噹', occurredAt: at(1, 8, 20) }),
    tx({ type: 'expense', amount: 120, accountId: 'a-linepay', categoryId: 'c-e1', note: '便當', occurredAt: at(2, 12, 10) }),
    tx({ type: 'transfer', amount: 500, accountId: 'a-salary', toAccountId: 'a-easy', note: '悠遊卡儲值', occurredAt: at(2, 18) }),
    tx({ type: 'expense', amount: 55, accountId: 'a-cash', categoryId: 'c-e3', note: '711', occurredAt: at(3, 15, 30) }),
    tx({ type: 'expense', amount: 1280, accountId: 'a-cathay', categoryId: 'c-e6', note: '', occurredAt: at(3, 20) }),
    tx({
      type: 'expense', amount: 860, accountId: 'a-post', categoryId: 'c-e2', note: '客戶餐敘', occurredAt: at(4, 19),
      reimbursable: true, reimburseStatus: 'pending',
    }),
    tx({
      type: 'expense', amount: 320, accountId: 'a-cash', categoryId: 'c-e4', note: '計程車', occurredAt: at(today, 10),
      reimbursable: true, reimburseStatus: 'pending',
    }),
    tx({ type: 'expense', amount: 150, accountId: 'a-taishin', categoryId: 'c-e3', note: '星巴克', occurredAt: at(today, 9, 40) }),
    tx({ type: 'income', amount: 1500, accountId: 'a-post', categoryId: 'c-i3', note: '', occurredAt: at(today, 11) }),
    tx({ type: 'transfer', amount: 5000, accountId: 'a-salary', toAccountId: 'a-saving', note: '存起來', occurredAt: at(today, 8) }),
    tx({ type: 'transfer', amount: 10000, accountId: 'a-invest', toAccountId: 'a-0050', note: '', source: 'invest-buy', occurredAt: at(2, 10) }),
    tx({ type: 'valuation', amount: 42500, accountId: 'a-0050', note: '', occurredAt: at(today, 13) }),
  ];
  return d;
}
