// 2.4 拖拖小語：首頁最近紀錄最底下那一句。
// PK 要增刪句子只改這個檔的 QUOTES；挑選規則在下面 pickQuote（數值在 config.ts 的 QUOTE）。
// 句子裡可以用 {帳戶} {金額} {天數}，會換成實際數字。
//
// 「今日支出超過預算」「今日支出達預算 80%」這兩組這版先不做：
// App 的預算是一筆一筆圈的「預先支出」，沒有每日或每月的額度可以比。
import type { AppData } from './data/types';
import { allBalances, totals, periodKey, dayKey } from './data/calc';
import { QUOTE } from './config';
import { money } from './format';

export const QUOTES = {
  lowBalance: ['{帳戶} 只剩 {金額}，該補血了', '{帳戶} 快見底了'],
  payday: ['發薪快樂！先存一點再說', '有錢進帳，先別急著花'],
  monthEnd: ['月底了，撐住', '月底倒數，荷包加油'],
  monthStart: ['新的月份，帳本重新開始', '新月份，新的開始'],
  remind: ['今天的帳記了嗎？拖一下就好', '睡前記一筆，明天不會忘'],
  zeroSpend: ['今天還是零支出，保持住！', '錢包今天很安靜'],
  overspend: ['這個月花得比賺得多，注意一下'],
  positive: ['這個月還是正的，穩！'],
  streak: ['已經連續記帳 {天數} 天了', '連續 {天數} 天，拖拖替你驕傲'],
  morning: ['早安，今天也好好記帳'],
  lunch: ['午餐記了嗎？'],
  lateNight: ['這麼晚還在看帳，早點睡'],
  monday: ['週一了，荷包重新出發'],
  friday: ['週末前，小心手滑'],
  weekend: ['週末快樂，花錢也記得記'],
  general: [
    '每一筆都算數',
    '記帳不是為了省錢，是為了知道錢去哪',
    '拖一下，帳就記好了',
    '小錢也是錢',
    '有記就是贏',
    '今天也辛苦了',
    '慢慢來，比較快',
    '拖拖在這裡陪你',
    '錢不會自己跑掉，是你帶它出門的',
  ],
};

type Vars = { 帳戶?: string; 金額?: number; 天數?: number };
interface Hit {
  pool: string[];
  vars?: Vars;
}

/** 連續記帳天數：從今天（今天還沒記就從昨天）往回數，每天至少一筆 */
export function streakDays(data: AppData, now = new Date()): number {
  const days = new Set(data.transactions.map((t) => dayKey(t.occurredAt)));
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** 目前符合的情境，由上往下優先；回傳每個符合的（第一個最優先） */
export function situations(data: AppData, now = new Date()): Hit[] {
  const hits: Hit[] = [];
  const today = dayKey(now);
  const yest = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const bal = allBalances(data);
  const t = totals(data, { day: today });
  const m = totals(data, { period: periodKey(now, data.settings.settleDay) });

  // 2. 帳戶快見底（投資、儲蓄不算；餘額 0 的不算）
  const low = data.accounts
    .filter((a) => a.kind !== 'invest' && a.kind !== 'saving')
    .map((a) => ({ a, b: bal.get(a.id) ?? 0 }))
    .filter((x) => x.b > 0 && x.b < QUOTE.lowBalance)
    .sort((x, y) => x.b - y.b)[0];
  if (low) hits.push({ pool: QUOTES.lowBalance, vars: { 帳戶: low.a.name, 金額: low.b } });

  // 4. 今天或昨天有一筆大收入
  if (data.transactions.some((x) => x.type === 'income' && x.amount >= QUOTE.bigIncome && [today, yest].includes(dayKey(x.occurredAt))))
    hits.push({ pool: QUOTES.payday });

  // 5、6. 月底、月初（月曆的月份）
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (now.getDate() > lastDay - QUOTE.monthEndDays) hits.push({ pool: QUOTES.monthEnd });
  if (now.getDate() <= QUOTE.monthStartDays) hits.push({ pool: QUOTES.monthStart });

  // 7. 晚上還沒記任何一筆
  const hasToday = data.transactions.some((x) => dayKey(x.occurredAt) === today);
  if (now.getHours() >= QUOTE.remindHour && !hasToday) hits.push({ pool: QUOTES.remind });

  // 8. 今天零支出
  if (t.expense === 0) hits.push({ pool: QUOTES.zeroSpend });

  // 9、10. 本月收支
  if (m.expense > m.income) hits.push({ pool: QUOTES.overspend });
  else if (m.income > m.expense) hits.push({ pool: QUOTES.positive });

  // 11. 連續記帳
  const s = streakDays(data, now);
  if (s >= QUOTE.streakMin) hits.push({ pool: QUOTES.streak, vars: { 天數: s } });

  // 12. 時段、星期（同一級，全部放進同一池）
  const h = now.getHours();
  const wd = now.getDay();
  const p12: string[] = [];
  if (h >= 5 && h < 11) p12.push(...QUOTES.morning);
  if (h >= 11 && h < 14) p12.push(...QUOTES.lunch);
  if (h >= 0 && h < 4) p12.push(...QUOTES.lateNight);
  if (wd === 1) p12.push(...QUOTES.monday);
  if (wd === 5) p12.push(...QUOTES.friday);
  if (wd === 0 || wd === 6) p12.push(...QUOTES.weekend);
  if (p12.length) hits.push({ pool: p12 });
  return hits;
}

function fill(s: string, v?: Vars): string {
  return s
    .replace('{帳戶}', v?.帳戶 ?? '')
    .replace('{金額}', v?.金額 !== undefined ? money(v.金額) : '')
    .replace('{天數}', v?.天數 !== undefined ? String(v.天數) : '');
}

let last = '';
/** 挑一句：有情境約 70% 出最優先情境的句子，其他出一般句；不跟上一次同一句 */
export function pickQuote(data: AppData, now = new Date(), rand = Math.random): string {
  const hits = situations(data, now);
  const hit: Hit = hits.length && rand() < QUOTE.situationalChance ? hits[0] : { pool: QUOTES.general };
  const all = hit.pool.map((s) => fill(s, hit.vars));
  // 情境只有一句、上次剛好出過：改出一般句，避免連續兩次同一句
  const left = all.filter((s) => s !== last);
  const pool = left.length ? left : QUOTES.general.filter((s) => s !== last);
  const q = pool[Math.floor(rand() * pool.length)] ?? QUOTES.general[0];
  last = q;
  return q;
}
