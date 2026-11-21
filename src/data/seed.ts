// 範例資料：一打開就能試。設定裡可以清空。
import type { Account, AppData, Category, NoteTag, Transaction } from './types';
import { DATA_VERSION } from './types';
import { SETTLE, SAMPLE } from '../config';
import { firstMonthFrom } from './recurring';
import { withAccountIcon, type CategoryColorKey } from '../categoryStyle';

export function emptyData(): AppData {
  return {
    version: DATA_VERSION,
    accounts: [],
    transactions: [],
    categories: defaultCategories(),
    noteTags: defaultTags(),
    recurring: [],
    settings: {
      defaultReimburseAccountId: null,
      lastUsedAccountId: null,
      settleDay: SETTLE.defaultDay,
      autoSortCategories: false,
    },
  };
}

/**
 * 清空後保留的最小結構：五顆球各一個帳戶（讓首頁的球有東西可拖）、預設分類與標籤。
 */
export function blankData(): AppData {
  const d = emptyData();
  d.accounts = smallAccounts(0);
  return d;
}

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

function defaultCategories(): Category[] {
  const ex: [string, string, CategoryColorKey][] = [
    ['早餐', 'croissant', 'food'], ['午餐', 'utensils', 'food'], ['晚餐', 'soup', 'food'], ['飲料', 'cup-soda', 'food'],
    ['交通', 'bus', 'transport'], ['日用品', 'spray-can', 'living'], ['購物', 'shopping-bag', 'shopping'], ['娛樂', 'gamepad-2', 'fun'],
    ['醫療', 'pill', 'health'], ['居家', 'house', 'living'], ['通訊', 'smartphone', 'digital'], ['其他', 'package', 'other'],
  ];
  const inc: [string, string, CategoryColorKey][] = [
    ['薪水', 'banknote-arrow-up', 'other'], ['獎金', 'gift', 'other'], ['投資收益', 'trending-up', 'other'], ['兼職', 'handshake', 'other'], ['其他', 'package', 'other'],
  ];
  return [
    ...ex.map(([name, icon, color], i) => ({ id: `c-e${i}`, type: 'expense' as const, name, icon, color, order: i })),
    ...inc.map(([name, icon, color], i) => ({ id: `c-i${i}`, type: 'income' as const, name, icon, color, order: i })),
  ];
}

function defaultTags(): NoteTag[] {
  return ['麥噹噹', '711', '全家', '星巴克', '便當'].map((text, i) => ({ id: `n${i}`, text, order: i, pinned: false }));
}

/**
 * 範例資料（3.0 重做，新手教學用）：一般帳戶三張、數字整齊。
 * 剩餘可用固定是 $30,000：一般帳戶合計 33,750 －預算 3,000 －定期扣款 390 －朋友先付 360。
 * 定期扣款訂在結算日前一天（4 號），不管哪天安裝都落在這一期；扣款日當天自動記帳時，預留改成真的支出，剩餘可用一樣不變。
 */
export function sampleData(now: Date = new Date()): AppData {
  const d = emptyData();
  d.accounts = [
    { id: 'a-salary', name: '薪轉帳戶', kind: 'bank', initialBalance: 30000, order: 0 },
    { id: 'a-post', name: '郵局', kind: 'bank', initialBalance: 6000, order: 1 },
    { id: 'a-cash', name: '現金', kind: 'bank', initialBalance: 3190, order: 2 },
    ...smallAccounts(1),
  ].map((a) => withAccountIcon(a as Account));
  d.settings.settleDay = SAMPLE.settleDay;
  d.settings.defaultReimburseAccountId = 'a-salary';
  d.settings.dailyAvg = true;
  d.settings.sample = true;

  // 時間都往前推：今天的用「幾小時前」，之前的用「幾天前幾點」，不會出現未來的紀錄
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();
  const daysAgo = (n: number, h: number, min = 0) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - n, h, min).toISOString();
  let n = 0;
  const tx = (p: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'accountId' | 'occurredAt'>): Transaction => ({
    id: `s${n++}`,
    note: '',
    reimbursable: false,
    createdAt: p.occurredAt,
    ...p,
  });

  d.transactions = [
    tx({ type: 'transfer', amount: 5000, accountId: 'a-salary', toAccountId: 'a-saving', note: '存起來', occurredAt: daysAgo(3, 9) }),
    tx({ type: 'transfer', amount: 10000, accountId: 'a-invest', toAccountId: 'a-0050', note: '', source: 'invest-buy', occurredAt: daysAgo(3, 10) }),
    tx({ type: 'income', amount: 1500, accountId: 'a-post', categoryId: 'c-i3', note: '家教', occurredAt: daysAgo(2, 17) }),
    tx({ type: 'transfer', amount: 500, accountId: 'a-salary', toAccountId: 'a-easy', note: '悠遊卡儲值', occurredAt: daysAgo(2, 18) }),
    tx({ type: 'expense', amount: 1000, accountId: 'a-salary', categoryId: 'c-e6', note: '', occurredAt: daysAgo(2, 20) }),
    tx({ type: 'expense', amount: 120, accountId: 'a-linepay', categoryId: 'c-e1', note: '便當', occurredAt: daysAgo(1, 12, 10) }),
    tx({
      type: 'expense', amount: 320, accountId: 'a-cash', categoryId: 'c-e4', note: '計程車', occurredAt: daysAgo(1, 22),
      reimbursable: true, reimburseStatus: 'pending',
    }),
    // 朋友先幫我付：不動帳戶，剩餘可用先扣
    tx({ type: 'owed', amount: 360, accountId: '', categoryId: 'c-e7', note: '電影票（小美先付）', owedStatus: 'pending', occurredAt: daysAgo(1, 20) }),
    // 預算：不扣帳戶，剩餘可用先扣
    tx({ type: 'expense', amount: 3000, accountId: 'a-salary', categoryId: 'c-e2', note: '週末聚餐', budget: true, budgetStatus: 'pending', occurredAt: daysAgo(0, 0, 5) }),
    tx({ type: 'expense', amount: 65, accountId: 'a-cash', categoryId: 'c-e0', note: '麥噹噹', occurredAt: hoursAgo(3) }),
    tx({ type: 'expense', amount: 55, accountId: 'a-cash', categoryId: 'c-e3', note: '711', occurredAt: hoursAgo(1) }),
    tx({ type: 'valuation', amount: 41000, accountId: 'a-0050', note: '', occurredAt: hoursAgo(0.5) }),
  ];
  d.recurring = [
    {
      id: 'r-sample', name: '影音訂閱', amount: 390, day: SAMPLE.recurringDay, categoryId: 'c-e7', accountId: 'a-salary',
      order: 0, nextMonth: firstMonthFrom(SAMPLE.recurringDay, now), createdAt: now.toISOString(),
    },
  ];
  return d;
}
