// 2.4 拖拖小語：首頁最近紀錄最底下那一句（情境由上往下＝優先順序）。
// PK 要增刪句子只改這個檔的 QUOTES；挑選規則在下面 pickQuote（數值在 config.ts 的 QUOTE）。
// 句子裡可以用 {帳戶} {金額} {天數}，會換成實際數字。
//
// 「今日支出超過預算」「今日支出達預算 80%」這兩組這版先不做：
// App 的預算是一筆一筆圈的「預先支出」，沒有每日或每月的額度可以比。
import type { AppData } from './data/types';
import { allBalances, totals, periodKey, dayKey } from './data/calc';
import { QUOTE } from './config';
import { money } from './format';

// 2.5 改寫：口吻是 logo 那枚被捏的哭哭硬幣（「我」＝硬幣）；每句 12 字以內（不含帳戶名、金額），小語列放得下不被切。
export const QUOTES = {
  lowBalance: ['{帳戶} 只剩 {金額}，好餓…', '{帳戶} 快見底了，嗚嗚', '{帳戶} 需要補血！'],
  remind: ['今天還沒記帳喔～', '睡前拖一下就好', '今天的錢去哪了呢？'],
  overspend: ['這個月花太多了，好痛', '別再捏我了啦…', '花的比賺的多耶…'],
  payday: ['有錢進來了！先存一點？', '發薪啦～我在轉圈圈', '先存起來，別急著花我'],
  streak: ['連續記帳 {天數} 天！', '第 {天數} 天了，好棒', '{天數} 天都沒忘記我'],
  zeroSpend: ['今天零支出，好乖！', '今天沒被捏，開心～', '錢包今天好安靜'],
  monthEnd: ['月底了，再撐一下下', '月底了，捏緊我一點', '最後幾天，一起撐住'],
  monthStart: ['新的月份，重新出發！', '新月份，錢包回血囉'],
  positive: ['這個月還是正的，穩！', '我有長胖一點點了'],
  morning: ['早安！今天也拖一下', '早安，我醒來了'],
  lunch: ['午餐吃什麼？記一下', '午餐記了嗎？'],
  lateNight: ['這麼晚了，快去睡', '我也想睡了…'],
  monday: ['週一了，一起加油', '週一，荷包重新出發'],
  friday: ['週末前，手別太滑', '週五了，先別衝動'],
  weekend: ['週末愉快，記得記帳', '出去玩也要記得我'],
  general: [
    '每一筆都算數',
    '小錢也是錢喔',
    '有記就是贏！',
    '拖一下就記好了',
    '今天也辛苦了',
    '慢慢來，比較快',
    '拖拖在這裡陪你',
    '輕一點，別捏我',
    '知道錢去哪就好',
    '記帳的人最可愛',
    '我會乖乖待著',
    '花錢前想想我',
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

  // 晚上還沒記任何一筆
  const hasToday = data.transactions.some((x) => dayKey(x.occurredAt) === today);
  if (now.getHours() >= QUOTE.remindHour && !hasToday) hits.push({ pool: QUOTES.remind });

  // 本月花的比賺的多
  if (m.expense > m.income) hits.push({ pool: QUOTES.overspend });

  // 今天或昨天有一筆大收入
  if (data.transactions.some((x) => x.type === 'income' && x.amount >= QUOTE.bigIncome && [today, yest].includes(dayKey(x.occurredAt))))
    hits.push({ pool: QUOTES.payday });

  // 連續記帳
  const s = streakDays(data, now);
  if (s >= QUOTE.streakMin) hits.push({ pool: QUOTES.streak, vars: { 天數: s } });

  // 今天零支出
  if (t.expense === 0) hits.push({ pool: QUOTES.zeroSpend });

  // 月底、月初（月曆的月份）
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (now.getDate() > lastDay - QUOTE.monthEndDays) hits.push({ pool: QUOTES.monthEnd });
  if (now.getDate() <= QUOTE.monthStartDays) hits.push({ pool: QUOTES.monthStart });

  // 本月收入比支出多
  if (m.income > m.expense) hits.push({ pool: QUOTES.positive });

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
/** 挑一句：有情境時 situationalChance 出情境句（最優先那種 topChance，其餘平均分），其他出一般句；不跟上一次同一句 */
export function pickQuote(data: AppData, now = new Date(), rand = Math.random): string {
  const hits = situations(data, now);
  let hit: Hit = { pool: QUOTES.general };
  if (hits.length && rand() < QUOTE.situationalChance) {
    const r = rand();
    hit = hits.length === 1 || r < QUOTE.topChance ? hits[0] : hits[1 + Math.floor(((r - QUOTE.topChance) / (1 - QUOTE.topChance)) * (hits.length - 1))] ?? hits[0];
  }
  const all = hit.pool.map((s) => fill(s, hit.vars));
  // 情境只有一句、上次剛好出過：改出一般句，避免連續兩次同一句
  const left = all.filter((s) => s !== last);
  const pool = left.length ? left : QUOTES.general.filter((s) => s !== last);
  const q = pool[Math.floor(rand() * pool.length)] ?? QUOTES.general[0];
  last = q;
  return q;
}
