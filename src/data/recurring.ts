// 定期扣款（2.0 補強批，PK 2026-11-10 定案；3.x 加每週／每年、取消資訊）：固定金額的週期性訂閱（HBO、Spotify）。
// - 結算期一開始：剩餘可用先預留本期所有還沒扣的定期扣款（算法比照預算，見 calc.ts 的 recurringReserved）。
//   每週＝這期還沒扣的每一次都預留；每年＝扣款日落在這期才整筆預留。
// - 扣款日過完、隔天起：自動記一筆一般支出，時間寫扣款日 23:59（3.x PK 定案；帳戶扣款、本月支出都算），預留同時解除。
// - App 沒開：下次打開補記，日期寫原本的扣款日；同一項同一次只記一次（nextMonth 只會往前走，另外再比對已記的紀錄）。
// - 自動記的那筆是普通支出，臨時要換帳戶、改金額就點進那筆自己改。
// - 開關關掉：不自動記帳、不動帳戶、不預留；重新打開時，關閉期間錯過的不補記（最保守）。
// - 當月沒有扣款日那天（例如 31 號遇到 11 月、2/29 遇到平年）：在當月最後一天扣。
// - 新增項目時，這次的扣款日已經過了 → 從下一次開始扣（不回頭補，避免和你手動記過的重複）。
// - 刪除項目：之後不再扣；已經自動記的支出保留，只有這期還沒扣的預留放回剩餘可用。
// 每一次扣款用一個 key 代表（見 calc.ts 的 occDate／occNext）；欄位名 nextMonth、recurringMonth 沿用舊的。
import type { AppData, CancelVia, Recurring, RecurringFreq, Transaction } from './types';
import { dayKey, freqOf, occDate, occDue, occPostTime, occFirstFrom, occKeyValid, occNext, RECURRING_MAX_MONTHS } from './calc';
import { recurringOn } from '../features';

export class RecurringError extends Error {}

const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const FREQS: RecurringFreq[] = ['week', 'month', 'year'];
const CANCEL_VIAS: CancelVia[] = ['store', 'app', 'web', 'other'];
/** 取消備註最多幾個字（防呆，網址一般遠低於此） */
const CANCEL_NOTE_MAX = 500;

/** 從今天起，第一個還沒到（或就是今天）的扣款月份（每月用；範例資料也用） */
export function firstMonthFrom(day: number, now: Date): string {
  return occFirstFrom({ day }, now);
}

export interface RecurringInput {
  name: string;
  amount: number;
  /** 缺值＝每月 */
  freq?: RecurringFreq;
  /** 每週：0＝日…6＝六 */
  weekday?: number;
  /** 每年：1～12 */
  monthOfYear?: number;
  /** 每月／每年：1～31（每週不用） */
  day: number;
  categoryId: string;
  accountId: string;
  cancelVia?: CancelVia;
  cancelNote?: string;
}

const daysInMonth = (m: number) => [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

function check(data: AppData, input: RecurringInput) {
  if (!input.name.trim()) throw new RecurringError('請輸入名稱');
  if (!(input.amount > 0) || !Number.isInteger(input.amount)) throw new RecurringError('金額必須是大於 0 的整數');
  const f = input.freq ?? 'month';
  if (!FREQS.includes(f)) throw new RecurringError('請選扣款週期');
  if (f === 'week') {
    if (!Number.isInteger(input.weekday) || input.weekday! < 0 || input.weekday! > 6) throw new RecurringError('請選星期幾扣');
  } else if (f === 'year') {
    const m = input.monthOfYear;
    if (!Number.isInteger(m) || m! < 1 || m! > 12) throw new RecurringError('月份要在 1～12 月之間');
    if (!Number.isInteger(input.day) || input.day < 1 || input.day > daysInMonth(m!)) throw new RecurringError(`${m} 月沒有 ${input.day} 號`);
  } else if (!Number.isInteger(input.day) || input.day < 1 || input.day > 31) {
    throw new RecurringError('扣款日要在 1～31 號之間');
  }
  if (input.cancelVia !== undefined && !CANCEL_VIAS.includes(input.cancelVia)) throw new RecurringError('取消方式不對');
  if (!data.accounts.some((a) => a.id === input.accountId)) throw new RecurringError('請選扣款帳戶');
  if (!data.categories.some((c) => c.id === input.categoryId && c.type === 'expense')) throw new RecurringError('請選支出分類');
}

/** 把輸入整理成存檔用的欄位（每週的 day 存 1；用不到的欄位不存） */
function schedFields(input: RecurringInput): Pick<Recurring, 'freq' | 'weekday' | 'monthOfYear' | 'day' | 'cancelVia' | 'cancelNote'> {
  const f = input.freq ?? 'month';
  const note = input.cancelNote?.trim().slice(0, CANCEL_NOTE_MAX);
  return {
    freq: f,
    weekday: f === 'week' ? input.weekday : undefined,
    monthOfYear: f === 'year' ? input.monthOfYear : undefined,
    day: f === 'week' ? 1 : input.day,
    cancelVia: input.cancelVia,
    cancelNote: note || undefined,
  };
}

/** 拿掉值是 undefined 的欄位（備份檔乾淨一點） */
function clean<T extends object>(o: T): T {
  const out = { ...o };
  for (const k of Object.keys(out) as (keyof T)[]) if (out[k] === undefined) delete out[k];
  return out;
}

export function addRecurring(data: AppData, input: RecurringInput, now: Date = new Date(), mkId: () => string = newId): { data: AppData; id: string } {
  check(data, input);
  const id = mkId();
  const order = data.recurring.reduce((m, r) => Math.max(m, r.order), -1) + 1;
  const sched = schedFields(input);
  const item: Recurring = clean({
    id,
    name: input.name.trim(),
    amount: input.amount,
    ...sched,
    categoryId: input.categoryId,
    accountId: input.accountId,
    order,
    nextMonth: occFirstFrom(sched, now),
    createdAt: now.toISOString(),
  });
  return { data: { ...data, recurring: [...data.recurring, item] }, id };
}

const sameSched = (a: Recurring, b: Pick<Recurring, 'freq' | 'weekday' | 'monthOfYear' | 'day'>) => {
  const f = freqOf(a);
  if (f !== freqOf(b)) return false;
  if (f === 'week') return a.weekday === b.weekday;
  if (f === 'year') return a.monthOfYear === b.monthOfYear && a.day === b.day;
  return a.day === b.day;
};

/**
 * 修改項目。只影響之後的扣款，已記的支出不動。改了扣款時間時，下一次從哪裡開始：
 * - 每月→每月、每年→每年（只改日期）：比照原本規則，這個月（這一年）已經扣過就不再扣，新日期已經過了也不回頭補。
 * - 換週期、或每週改星期幾：還沒扣過任何一次＝從今天起第一次；扣過＝從「原本下一次扣款日」起第一次（已付的那一期不重複扣）。
 */
export function updateRecurring(data: AppData, id: string, input: RecurringInput, now: Date = new Date()): AppData {
  const old = data.recurring.find((r) => r.id === id);
  if (!old) throw new RecurringError('找不到這項定期扣款');
  check(data, input);
  const sched = schedFields(input);
  let nextMonth = old.nextMonth;
  if (!sameSched(old, sched)) {
    const f = freqOf(sched);
    if (f === freqOf(old) && f !== 'week') {
      const first = occFirstFrom(sched, now);
      nextMonth = old.nextMonth >= first ? old.nextMonth : first;
    } else {
      const posted = data.transactions.some((t) => t.recurringId === id);
      const oldNext = occDate(old, old.nextMonth);
      nextMonth = occFirstFrom(sched, posted && oldNext > now ? oldNext : now);
    }
  }
  return {
    ...data,
    recurring: data.recurring.map((r) =>
      r.id === id
        ? clean({ ...r, name: input.name.trim(), amount: input.amount, ...sched, categoryId: input.categoryId, accountId: input.accountId, nextMonth })
        : r,
    ),
  };
}

/** 刪除項目：之後不再扣；已經自動記的支出保留（那些錢真的扣過了） */
export function removeRecurring(data: AppData, id: string): AppData {
  return { ...data, recurring: data.recurring.filter((r) => r.id !== id) };
}

/**
 * 開關。重新打開時，每一項的下一次扣款移到「今天起第一個扣款日」：
 * 關閉期間錯過的不補記、不動帳戶（最保守）。
 */
export function setRecurringEnabled(data: AppData, on: boolean, now: Date = new Date()): AppData {
  const wasOn = recurringOn(data.settings);
  const settings = { ...data.settings, recurringEnabled: on };
  if (!on || wasOn) return { ...data, settings };
  const today = dayKey(now);
  return {
    ...data,
    settings,
    recurring: data.recurring.map((r) => (dayKey(occDate(r, r.nextMonth)) >= today ? r : { ...r, nextMonth: occFirstFrom(r, now) })),
  };
}

/** 這項現在能不能自動記（帳戶、分類都還在） */
export function recurringProblem(data: AppData, r: Recurring): string | null {
  if (!data.accounts.some((a) => a.id === r.accountId)) return '扣款帳戶已刪除，請重新選帳戶';
  if (!data.categories.some((c) => c.id === r.categoryId && c.type === 'expense')) return '分類已刪除，請重新選分類';
  return null;
}

/**
 * 自動記帳（App 打開、回到前景時跑）：每一項從 nextMonth 起，扣款日已到的每一次各記一筆支出，
 * 日期＝原本的扣款日。已經記過（同一項同一次）的不會再記。開關關掉＝什麼都不做。
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
    for (let i = 0; i < RECURRING_MAX_MONTHS && occDue(r, m, now); i++, m = occNext(r, m)) {
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
        occurredAt: occPostTime(r, m).toISOString(),
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
 * - 週期不認得＝每月；扣款日、星期、月份超出範圍夾回範圍；nextMonth 格式不對＝從今天起算
 * - 取消方式不認得＝沒填；備註超長截斷
 */
export function normalizeRecurring<T extends { recurring?: unknown }>(data: T, now: Date = new Date()): T & { recurring: Recurring[] } {
  const raw = Array.isArray(data.recurring) ? (data.recurring as Partial<Recurring>[]) : [];
  const out: Recurring[] = [];
  const clamp = (v: unknown, lo: number, hi: number, dflt: number) => Math.min(hi, Math.max(lo, Math.round(typeof v === 'number' && Number.isFinite(v) ? v : dflt)));
  raw.forEach((r, i) => {
    if (!r || typeof r !== 'object') return;
    if (typeof r.id !== 'string' || !r.id) return;
    if (typeof r.name !== 'string' || !r.name.trim()) return;
    if (typeof r.amount !== 'number' || !(r.amount > 0)) return;
    const freq: RecurringFreq = FREQS.includes(r.freq as RecurringFreq) ? (r.freq as RecurringFreq) : 'month';
    const weekday = freq === 'week' ? clamp(r.weekday, 0, 6, 0) : undefined;
    const monthOfYear = freq === 'year' ? clamp(r.monthOfYear, 1, 12, 1) : undefined;
    const day = freq === 'week' ? 1 : clamp(r.day, 1, freq === 'year' ? daysInMonth(monthOfYear!) : 31, 1);
    const sched = { freq, weekday, monthOfYear, day };
    const note = typeof r.cancelNote === 'string' ? r.cancelNote.trim().slice(0, CANCEL_NOTE_MAX) : '';
    out.push(
      clean({
        id: r.id,
        name: r.name,
        amount: Math.round(r.amount),
        // 舊資料沒有週期＝每月，存檔保持原樣（不多寫 freq）
        freq: r.freq === undefined ? undefined : freq,
        weekday,
        monthOfYear,
        day,
        cancelVia: CANCEL_VIAS.includes(r.cancelVia as CancelVia) ? r.cancelVia : undefined,
        cancelNote: note || undefined,
        categoryId: typeof r.categoryId === 'string' ? r.categoryId : '',
        accountId: typeof r.accountId === 'string' ? r.accountId : '',
        order: typeof r.order === 'number' ? r.order : i,
        nextMonth: occKeyValid(sched, r.nextMonth) ? r.nextMonth : occFirstFrom(sched, now),
        createdAt: typeof r.createdAt === 'string' ? r.createdAt : now.toISOString(),
      }),
    );
  });
  return { ...data, recurring: out };
}

/**
 * 匯入備份時：同一項在現在的資料裡已經扣到比較後面 → 用比較後面的，避免舊設定檔讓已扣過的再扣一次。
 * 週期一樣（每週除外）直接比 key；否則比扣款日，從現在資料的下一次扣款日起算第一次。
 */
export function laterNext(incoming: Recurring, current: Recurring): Recurring {
  const f = freqOf(incoming);
  if (f === freqOf(current) && f !== 'week') return current.nextMonth > incoming.nextMonth ? { ...incoming, nextMonth: current.nextMonth } : incoming;
  if (!occKeyValid(current, current.nextMonth) || !occKeyValid(incoming, incoming.nextMonth)) return incoming;
  const cd = occDate(current, current.nextMonth);
  return cd > occDate(incoming, incoming.nextMonth) ? { ...incoming, nextMonth: occFirstFrom(incoming, cd) } : incoming;
}

/** 這一項下一次的扣款日（設定頁顯示「下次 11/7」用） */
export function nextChargeDate(r: Recurring): Date {
  return occDate(r, r.nextMonth);
}

/** 清單上的週期文字：每週三／每月 12 號／每年 3/15 */
export function scheduleLabel(r: Pick<Recurring, 'freq' | 'weekday' | 'monthOfYear' | 'day'>): string {
  const f = freqOf(r);
  if (f === 'week') return `每週${'日一二三四五六'[r.weekday ?? 0]}`;
  if (f === 'year') return `每年 ${r.monthOfYear ?? 1}/${r.day}`;
  return `每月 ${r.day} 號`;
}

export const CANCEL_VIA_LABEL: Record<CancelVia, string> = { store: '應用商城', app: 'App 內', web: '網頁', other: '其他' };
