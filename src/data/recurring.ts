// 定期扣款（2.0 補強批，PK 2026-11-10 定案）：固定金額的每月訂閱（HBO、Spotify）。
// - 結算期一開始：剩餘可用先預留本期所有還沒扣的定期扣款（算法比照預算，見 calc.ts 的 recurringReserved）。
// - 到扣款日：自動記一筆一般支出（帳戶扣款、本月與今日支出都算），預留同時解除。
// - App 沒開：下次打開補記，日期寫原本的扣款日；同一項同一月只記一次（nextMonth 只會往前走，另外再比對已記的紀錄）。
// - 自動記的那筆是普通支出，臨時要換帳戶、改金額就點進那筆自己改。
// - 開關關掉：不自動記帳、不動帳戶、不預留；重新打開時，關閉期間錯過的月份不補記（最保守）。
// - 當月沒有扣款日那天（例如 31 號遇到 11 月）：在當月最後一天扣。
// - 新增項目時，這個月的扣款日已經過了 → 從下個月開始扣（不回頭補，避免和你手動記過的重複）。
import type { AppData, Recurring, Transaction } from './types';
import { chargeDate, chargeDue, dayKey, monthKey, shiftPeriod, RECURRING_MAX_MONTHS } from './calc';
import { recurringOn } from '../features';

export class RecurringError extends Error {}

const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 從今天起，第一個還沒到（或就是今天）的扣款月份 */
export function firstMonthFrom(day: number, now: Date): string {
  const m = monthKey(now);
  return dayKey(chargeDate(day, m)) >= dayKey(now) ? m : shiftPeriod(m, 1);
}

/** 兩個月份取比較晚的 */
const laterMonth = (a: string, b: string) => (a >= b ? a : b);

export interface RecurringInput {
  name: string;
  amount: number;
  day: number;
  categoryId: string;
  accountId: string;
}

function check(data: AppData, input: RecurringInput) {
  if (!input.name.trim()) throw new RecurringError('請輸入名稱');
  if (!(input.amount > 0) || !Number.isInteger(input.amount)) throw new RecurringError('金額必須是大於 0 的整數');
  if (!Number.isInteger(input.day) || input.day < 1 || input.day > 31) throw new RecurringError('扣款日要在 1～31 號之間');
  if (!data.accounts.some((a) => a.id === input.accountId)) throw new RecurringError('請選扣款帳戶');
  if (!data.categories.some((c) => c.id === input.categoryId && c.type === 'expense')) throw new RecurringError('請選支出分類');
}

export function addRecurring(data: AppData, input: RecurringInput, now: Date = new Date(), mkId: () => string = newId): { data: AppData; id: string } {
  check(data, input);
  const id = mkId();
  const order = data.recurring.reduce((m, r) => Math.max(m, r.order), -1) + 1;
  const item: Recurring = {
    id,
    name: input.name.trim(),
    amount: input.amount,
    day: input.day,
    categoryId: input.categoryId,
    accountId: input.accountId,
    order,
    nextMonth: firstMonthFrom(input.day, now),
    createdAt: now.toISOString(),
  };
  return { data: { ...data, recurring: [...data.recurring, item] }, id };
}

/**
 * 修改項目。只影響之後的扣款，已記的支出不動。
 * 改了扣款日、使新的扣款日已經過了：這個月不回頭補（避免改設定就突然多一筆過去日期的支出）。
 */
export function updateRecurring(data: AppData, id: string, input: RecurringInput, now: Date = new Date()): AppData {
  const old = data.recurring.find((r) => r.id === id);
  if (!old) throw new RecurringError('找不到這項定期扣款');
  check(data, input);
  const nextMonth = input.day === old.day ? old.nextMonth : laterMonth(old.nextMonth, firstMonthFrom(input.day, now));
  return {
    ...data,
    recurring: data.recurring.map((r) =>
      r.id === id ? { ...r, name: input.name.trim(), amount: input.amount, day: input.day, categoryId: input.categoryId, accountId: input.accountId, nextMonth } : r,
    ),
  };
}

/** 刪除項目：之後不再扣；已經自動記的支出保留（那些錢真的扣過了） */
export function removeRecurring(data: AppData, id: string): AppData {
  return { ...data, recurring: data.recurring.filter((r) => r.id !== id) };
}

/**
 * 開關。重新打開時，每一項的下一次扣款移到「今天起第一個扣款日」：
 * 關閉期間錯過的月份不補記、不動帳戶（最保守）。
 */
export function setRecurringEnabled(data: AppData, on: boolean, now: Date = new Date()): AppData {
  const wasOn = recurringOn(data.settings);
  const settings = { ...data.settings, recurringEnabled: on };
  if (!on || wasOn) return { ...data, settings };
  return {
    ...data,
    settings,
    recurring: data.recurring.map((r) => {
      const nextMonth = laterMonth(r.nextMonth, firstMonthFrom(r.day, now));
      return nextMonth === r.nextMonth ? r : { ...r, nextMonth };
    }),
  };
}

/** 這項現在能不能自動記（帳戶、分類都還在） */
export function recurringProblem(data: AppData, r: Recurring): string | null {
  if (!data.accounts.some((a) => a.id === r.accountId)) return '扣款帳戶已刪除，請重新選帳戶';
  if (!data.categories.some((c) => c.id === r.categoryId && c.type === 'expense')) return '分類已刪除，請重新選分類';
  return null;
}

/**
 * 自動記帳（App 打開、回到前景時跑）：每一項從 nextMonth 起，扣款日已到的月份各記一筆支出，
 * 日期＝原本的扣款日。已經記過（同一項同一月）的不會再記。開關關掉＝什麼都不做。
 * 帳戶或分類被刪掉的項目先跳過（不往前推），改好之後下次打開再補。
 */
export function postDueRecurring(data: AppData, now: Date = new Date(), mkId: () => string = newId): { data: AppData; posted: Transaction[] } {
  if (!recurringOn(data.settings) || data.recurring.length === 0) return { data, posted: [] };
  const done = new Set(data.transactions.filter((t) => t.recurringId).map((t) => `${t.recurringId}@${t.recurringMonth}`));
  const nowIso = now.toISOString();
  const posted: Transaction[] = [];
  let changed = false;
  const recurring = data.recurring.map((r) => {
    if (recurringProblem(data, r)) return r;
    let m = r.nextMonth;
    for (let i = 0; i < RECURRING_MAX_MONTHS && chargeDue(r.day, m, now); i++, m = shiftPeriod(m, 1)) {
      const key = `${r.id}@${m}`;
      if (done.has(key)) continue;
      done.add(key);
      posted.push({
        id: mkId(),
        type: 'expense',
        amount: r.amount,
        accountId: r.accountId,
        categoryId: r.categoryId,
        note: r.name,
        occurredAt: chargeDate(r.day, m).toISOString(),
        reimbursable: false,
        recurringId: r.id,
        recurringMonth: m,
        createdAt: nowIso,
      });
    }
    if (m === r.nextMonth) return r;
    changed = true;
    return { ...r, nextMonth: m };
  });
  if (!changed) return { data, posted };
  return { data: { ...data, recurring, transactions: [...data.transactions, ...posted] }, posted };
}

/**
 * 匯入備份、升級資料時修正定期扣款清單：
 * - 缺清單＝空的；壞掉的項目（缺名稱、金額不對）拿掉
 * - 扣款日超出 1～31 夾回範圍；nextMonth 格式不對＝從今天起算
 */
export function normalizeRecurring<T extends { recurring?: unknown }>(data: T, now: Date = new Date()): T & { recurring: Recurring[] } {
  const raw = Array.isArray(data.recurring) ? (data.recurring as Partial<Recurring>[]) : [];
  const out: Recurring[] = [];
  raw.forEach((r, i) => {
    if (!r || typeof r !== 'object') return;
    if (typeof r.id !== 'string' || !r.id) return;
    if (typeof r.name !== 'string' || !r.name.trim()) return;
    if (typeof r.amount !== 'number' || !(r.amount > 0)) return;
    const day = Math.min(31, Math.max(1, Math.round(typeof r.day === 'number' ? r.day : 1)));
    out.push({
      id: r.id,
      name: r.name,
      amount: Math.round(r.amount),
      day,
      categoryId: typeof r.categoryId === 'string' ? r.categoryId : '',
      accountId: typeof r.accountId === 'string' ? r.accountId : '',
      order: typeof r.order === 'number' ? r.order : i,
      nextMonth: typeof r.nextMonth === 'string' && MONTH_RE.test(r.nextMonth) ? r.nextMonth : firstMonthFrom(day, now),
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : now.toISOString(),
    });
  });
  return { ...data, recurring: out };
}

/** 本期每一項的扣款日（設定頁顯示「下次 11/7」用） */
export function nextChargeDate(r: Recurring): Date {
  return chargeDate(r.day, r.nextMonth);
}
