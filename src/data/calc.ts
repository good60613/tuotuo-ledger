// 計算規則。餘額一律從紀錄推算，不另外存「目前餘額」，避免重複扣款或對不上。
//
// 第二批（PK 2026-11-08 定案）：主帳與小帳戶分開。
// - 主帳＝一般帳戶（bank）。「全部帳戶」、剩餘可用、收支統計都只看主帳。
// - 轉入悠遊卡、電子錢包＝主帳支出（儲值即視為花掉）；小帳戶內的消費不算主帳。
// - 轉入投資、儲蓄＝轉帳，不算支出。
// - 調整、市值、配息、費用、利息、損益都不算主帳收支。
// - 本月收支、統計、日曆、曲線依「結算期」計算；當日收支照日曆日。
//
// 第四批（PK 定案）：預算。預算紀錄不扣帳戶、不算當月支出；剩餘可用扣掉「未付」的預算。
// 真的付錢時另外新增一筆一般支出（扣帳戶、算當月支出），預算同時改成已付（見 budget.ts）。
import type { Account, AccountKind, AppData, Transaction } from './types';

/** 算進「剩餘可用金額」的帳戶類型：只有一般帳戶 */
export const SPENDABLE_KINDS: AccountKind[] = ['bank'];

/** 從主帳轉進來算「主帳支出」的小帳戶類型 */
export const TOPUP_KINDS: AccountKind[] = ['easycard', 'ewallet'];

/** 統計分類裡「儲值」的假分類 id（後面接小帳戶類型，例如 '__topup:easycard'） */
export const TOPUP_CAT_PREFIX = '__topup:';

// ---------------- 餘額 ----------------

/** 一筆紀錄對各帳戶餘額的影響 */
function balanceDeltas(t: Transaction): [string | undefined, number][] {
  switch (t.type) {
    case 'income':
      return [[t.accountId, t.amount]];
    case 'expense':
      // 預算只是把錢圈起來，不扣帳戶；真正扣款的是付款時新增的那筆支出
      if (t.budget) return [];
      // 報帳支出也會扣款（先扣款，之後報帳入帳再加回）
      return [[t.accountId, -t.amount]];
    case 'transfer':
      return [[t.accountId, -t.amount], [t.toAccountId, t.amount]];
    case 'reimburse_in':
      return [[t.toAccountId, t.amount]];
    case 'adjust':
      return [[t.accountId, t.adjustDir === 'down' ? -t.amount : t.amount]];
    case 'owed_repay':
      // 還朋友錢：從選的帳戶扣款（任何帳戶都可以）
      return [[t.accountId, -t.amount]];
    // 'owed'（朋友付）不動任何帳戶
    default:
      // valuation 不動餘額
      return [];
  }
}

export function balanceOf(accountId: string, accounts: Account[], txs: Transaction[]): number {
  const acc = accounts.find((a) => a.id === accountId);
  let b = acc ? acc.initialBalance : 0;
  for (const t of txs) for (const [id, v] of balanceDeltas(t)) if (id === accountId) b += v;
  return b;
}

/**
 * 每個帳戶的「帳上餘額」。投資標的的帳上餘額只是買賣金額的淨額，
 * 要看現值請用 holdingStats / ballTotal。
 */
export function allBalances(data: Pick<AppData, 'accounts' | 'transactions'>): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of data.accounts) m.set(a.id, a.initialBalance);
  for (const t of data.transactions)
    for (const [id, v] of balanceDeltas(t)) if (id && m.has(id)) m.set(id, (m.get(id) ?? 0) + v);
  return m;
}

/** 是否為「未付」的預算 */
export function isPendingBudget(t: Transaction): boolean {
  return t.type === 'expense' && !!t.budget && t.budgetStatus !== 'paid';
}

/** 各帳戶未付預算合計（帳戶卡片的「預算 1,000」） */
export function pendingBudgetByAccount(data: Pick<AppData, 'transactions'>): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of data.transactions) if (isPendingBudget(t)) m.set(t.accountId, (m.get(t.accountId) ?? 0) + t.amount);
  return m;
}

/** 一般帳戶上未付預算合計（首頁「已圈預算」） */
export function pendingBudgetTotal(data: Pick<AppData, 'accounts' | 'transactions'>): number {
  const kindOf = kindLookup(data.accounts);
  return data.transactions
    .filter((t) => isPendingBudget(t) && SPENDABLE_KINDS.includes(kindOf(t.accountId) as AccountKind))
    .reduce((s, t) => s + t.amount, 0);
}

/** 是否為「還沒還」的朋友付 */
export function isPendingOwed(t: Transaction): boolean {
  return t.type === 'owed' && t.owedStatus !== 'paid';
}

/** 未還朋友錢合計（首頁剩餘可用旁的「朋友付 600」） */
export function pendingOwedTotal(data: Pick<AppData, 'transactions'>): number {
  return data.transactions.filter(isPendingOwed).reduce((s, t) => s + t.amount, 0);
}

/** 一般帳戶餘額合計（帳戶加總） */
export function bankTotal(data: Pick<AppData, 'accounts' | 'transactions'>): number {
  const bal = allBalances(data);
  return data.accounts
    .filter((a) => SPENDABLE_KINDS.includes(a.kind))
    .reduce((s, a) => s + (bal.get(a.id) ?? 0), 0);
}

/**
 * 剩餘可用＝一般帳戶加總－未付預算－未還朋友錢（2.0）－本期還沒扣的定期扣款（補強批）。
 * 我先付、報帳還沒收回的錢不先加回，等真的入帳才算（保守）。
 */
export function spendableTotal(data: SpendableData, now: Date = new Date()): number {
  return bankTotal(data) - pendingBudgetTotal(data) - pendingOwedTotal(data) - recurringReserved(data, now);
}

type SpendableData = Pick<AppData, 'accounts' | 'transactions'> & Partial<Pick<AppData, 'recurring' | 'settings'>>;

// ---------------- 定期扣款（補強批） ----------------

/** 定期扣款在某個月份（'YYYY-MM'）的扣款日（當地 0 點）。當月沒有那天＝當月最後一天 */
export function chargeDate(day: number, month: string): Date {
  const [y, mo] = month.split('-').map(Number);
  return new Date(y, mo - 1, Math.min(Math.max(1, day), daysIn(y, mo - 1)));
}

/** 這個月份的扣款日是否已經到了（以日期比，不看幾點） */
export function chargeDue(day: number, month: string, now: Date): boolean {
  return dayKey(chargeDate(day, month)) <= dayKey(now);
}

/** 防呆：一次最多往後看幾個月（資料亂掉時不會跑不完） */
export const RECURRING_MAX_MONTHS = 240;

/**
 * 剩餘可用要預留的定期扣款（比照預算）：
 * 扣款日落在「目前這一期」、而且還沒自動記帳的，金額先扣掉；到扣款日記成支出時同時解除，不會重複扣。
 * 只算預設帳戶是一般帳戶的項目（小帳戶付的不影響剩餘可用）。開關關掉＝不預留。
 */
export function recurringReserved(data: SpendableData, now: Date = new Date()): number {
  const list = data.recurring;
  if (!list?.length || !data.settings || data.settings.recurringEnabled === false) return 0;
  const { start, end } = periodRange(periodKey(now, data.settings.settleDay), data.settings.settleDay);
  const kindOf = kindLookup(data.accounts);
  const posted = new Set(data.transactions.filter((t) => t.recurringId).map((t) => `${t.recurringId}@${t.recurringMonth}`));
  let sum = 0;
  for (const r of list) {
    if (kindOf(r.accountId) !== 'bank') continue;
    let m = r.nextMonth;
    for (let i = 0; i < RECURRING_MAX_MONTHS; i++, m = shiftPeriod(m, 1)) {
      const c = chargeDate(r.day, m);
      if (c >= end) break;
      if (c >= start && !posted.has(`${r.id}@${m}`)) sum += r.amount;
    }
  }
  return sum;
}

// ---------------- 投資 ----------------

export interface HoldingStats {
  /** 本金（買進成本；賣出時依平均成本扣除） */
  principal: number;
  /** 現值 */
  value: number;
  /** 損益＝現值－本金 */
  profit: number;
}

const byTime = (a: Transaction, b: Transaction) =>
  a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : a.createdAt < b.createdAt ? -1 : 1;

/**
 * 投資標的的本金、現值、損益。依時間順序走過和這個標的有關的紀錄：
 * - 買進（轉入標的）：本金、現值都加上買進金額。
 * - 賣出（轉出標的）：依「賣出金額 ÷ 賣出前現值」的比例扣本金（平均成本），現值減去賣出金額。
 * - 更新市值：現值改成輸入的金額。
 * 初始餘額視為一開始的本金與現值。
 */
export function holdingStats(holding: Account, txs: Transaction[]): HoldingStats {
  let principal = holding.initialBalance;
  let value = holding.initialBalance;
  const list = txs
    .filter((t) => t.accountId === holding.id || t.toAccountId === holding.id)
    .sort(byTime);
  for (const t of list) {
    if (t.type === 'valuation' && t.accountId === holding.id) value = t.amount;
    else if (t.type === 'transfer' && t.toAccountId === holding.id) {
      principal += t.amount;
      value += t.amount;
    } else if (t.type === 'transfer' && t.accountId === holding.id) {
      const ratio = value > 0 ? Math.min(1, t.amount / value) : 1;
      principal -= principal * ratio;
      value = Math.max(0, value - t.amount);
    }
  }
  principal = Math.round(principal);
  value = Math.round(value);
  return { principal, value, profit: value - principal };
}

export interface InvestSummary {
  /** 待投入的錢 */
  cash: number;
  /** 各標的本金合計 */
  principal: number;
  /** 各標的現值合計 */
  holdingsValue: number;
  /** 投資總額＝待投入＋各標的現值 */
  total: number;
  /** 損益合計 */
  profit: number;
}

export function investSummary(data: Pick<AppData, 'accounts' | 'transactions'>): InvestSummary {
  const bal = allBalances(data);
  const inv = data.accounts.filter((a) => a.kind === 'invest');
  let cash = 0, principal = 0, holdingsValue = 0;
  for (const a of inv) {
    if (a.subtype === 'holding') {
      const h = holdingStats(a, data.transactions);
      principal += h.principal;
      holdingsValue += h.value;
    } else cash += bal.get(a.id) ?? 0;
  }
  return { cash, principal, holdingsValue, total: cash + holdingsValue, profit: holdingsValue - principal };
}

/** 首頁小帳戶球顯示的金額：投資顯示現值（含損益），其他顯示餘額合計 */
export function ballTotal(data: Pick<AppData, 'accounts' | 'transactions'>, kind: AccountKind): number {
  if (kind === 'invest') return investSummary(data).total;
  const bal = allBalances(data);
  return data.accounts.filter((a) => a.kind === kind).reduce((s, a) => s + (bal.get(a.id) ?? 0), 0);
}

// ---------------- 主帳收支 ----------------

export type KindOf = (accountId: string | undefined) => AccountKind | undefined;

export function kindLookup(accounts: Account[]): KindOf {
  const m = new Map(accounts.map((a) => [a.id, a.kind]));
  return (id) => (id ? m.get(id) : undefined);
}

export interface StatEffect {
  type: 'income' | 'expense';
  amount: number;
  /** 算在哪個一般帳戶 */
  accountId: string;
  /** 分類；儲值用 TOPUP_CAT_PREFIX + 小帳戶類型 */
  categoryId: string;
}

/**
 * 一筆紀錄在主帳收支裡算什麼。null＝不算。
 * - 一般帳戶的收入、支出（報帳支出、預算除外；預算付款時新增的那筆一般支出照算）。
 * - 一般帳戶轉入悠遊卡、電子錢包＝支出（儲值）。
 * - 其他一律不算：轉帳、報帳入帳、調整、市值、小帳戶內的收支（含配息、費用、利息）。
 */
export function statEffect(t: Transaction, kindOf: KindOf): StatEffect | null {
  // 朋友付（補強批 PK 定案）：記帳那天不算支出（只扣剩餘可用）
  if (t.type === 'owed') return null;
  // 還朋友錢：還錢那天才算支出，算在付款的一般帳戶。用小帳戶還＝小帳戶內的消費，不算主帳
  // （儲值時已經算過），所以不會重複算。舊資料不用轉換：數字一律從紀錄現算。
  if (t.type === 'owed_repay')
    return kindOf(t.accountId) === 'bank'
      ? { type: 'expense', amount: t.amount, accountId: t.accountId, categoryId: t.categoryId ?? '' }
      : null;
  const k = kindOf(t.accountId);
  if (k !== 'bank') return null;
  if (t.type === 'income') return { type: 'income', amount: t.amount, accountId: t.accountId, categoryId: t.categoryId ?? '' };
  if (t.type === 'expense')
    return t.reimbursable || t.budget ? null : { type: 'expense', amount: t.amount, accountId: t.accountId, categoryId: t.categoryId ?? '' };
  if (t.type === 'transfer') {
    const to = kindOf(t.toAccountId);
    if (to && TOPUP_KINDS.includes(to))
      return { type: 'expense', amount: t.amount, accountId: t.accountId, categoryId: TOPUP_CAT_PREFIX + to };
  }
  return null;
}

/** 這筆紀錄是否出現在主帳（明細「全部帳戶」）：有碰到任何一般帳戶 */
export function inMainLedger(t: Transaction, kindOf: KindOf): boolean {
  if (t.type === 'owed') return true;
  return kindOf(t.accountId) === 'bank' || kindOf(t.toAccountId) === 'bank';
}

// ---- 日期工具（一律用手機本地時間） ----
const pad = (n: number) => String(n).padStart(2, '0');
const toDate = (d: Date | string) => (typeof d === 'string' ? new Date(d) : d);
export function dayKey(d: Date | string): string {
  const x = toDate(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}
export function monthKey(d: Date | string): string {
  const x = toDate(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`;
}

// ---- 結算期 ----
// 結算期以「開始日的月份」命名：結算日 5 號，「2026-10」＝10/5～11/4。
// 該月沒有結算日那天（例如 31 號遇到 2 月）時，用該月最後一天開始。

const daysIn = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();
const startDayOf = (y: number, m0: number, settleDay: number) => Math.min(Math.max(1, settleDay), daysIn(y, m0));

/** 某個時間點屬於哪一期（'YYYY-MM'） */
export function periodKey(d: Date | string, settleDay: number): string {
  const x = toDate(d);
  let y = x.getFullYear(), m0 = x.getMonth();
  if (x.getDate() < startDayOf(y, m0, settleDay)) {
    m0 -= 1;
    if (m0 < 0) { m0 = 11; y -= 1; }
  }
  return `${y}-${pad(m0 + 1)}`;
}

/** 某一期的起訖：start 含、end 不含（＝下一期開始） */
export function periodRange(key: string, settleDay: number): { start: Date; end: Date } {
  const [y, mo] = key.split('-').map(Number);
  const m0 = mo - 1;
  const start = new Date(y, m0, startDayOf(y, m0, settleDay));
  const ny = m0 === 11 ? y + 1 : y, nm0 = (m0 + 1) % 12;
  const end = new Date(ny, nm0, startDayOf(ny, nm0, settleDay));
  return { start, end };
}

/** 某一期的每一天（dayKey 陣列），日曆、曲線用 */
export function periodDays(key: string, settleDay: number): string[] {
  const { start, end } = periodRange(key, settleDay);
  const out: string[] = [];
  for (let d = new Date(start); d < end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) out.push(dayKey(d));
  return out;
}

/** 前後移動幾期 */
export function shiftPeriod(key: string, delta: number): string {
  const [y, mo] = key.split('-').map(Number);
  const t = y * 12 + (mo - 1) + delta;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

export function inPeriod(t: Transaction, key: string, settleDay: number): boolean {
  return periodKey(t.occurredAt, settleDay) === key;
}

export interface Totals {
  income: number;
  expense: number;
}

/** 主帳收支加總。period＝結算期、day＝單日；accountId 給了就只算該一般帳戶 */
export function totals(
  data: Pick<AppData, 'accounts' | 'transactions' | 'settings'>,
  opt: { period?: string; day?: string; accountId?: string | null },
): Totals {
  const kindOf = kindLookup(data.accounts);
  const sd = data.settings.settleDay;
  const r = { income: 0, expense: 0 };
  for (const t of data.transactions) {
    const e = statEffect(t, kindOf);
    if (!e) continue;
    if (opt.accountId && e.accountId !== opt.accountId) continue;
    if (opt.period && !inPeriod(t, opt.period, sd)) continue;
    if (opt.day && dayKey(t.occurredAt) !== opt.day) continue;
    r[e.type] += e.amount;
  }
  return r;
}

export interface CategorySum {
  categoryId: string;
  amount: number;
  ratio: number;
}

export function categoryBreakdown(
  data: Pick<AppData, 'accounts' | 'transactions' | 'settings'>,
  type: 'expense' | 'income',
  period: string,
  accountId: string | null,
): CategorySum[] {
  const kindOf = kindLookup(data.accounts);
  const sd = data.settings.settleDay;
  const m = new Map<string, number>();
  let total = 0;
  for (const t of data.transactions) {
    const e = statEffect(t, kindOf);
    if (!e || e.type !== type) continue;
    if (accountId && e.accountId !== accountId) continue;
    if (!inPeriod(t, period, sd)) continue;
    m.set(e.categoryId, (m.get(e.categoryId) ?? 0) + e.amount);
    total += e.amount;
  }
  return [...m.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount, ratio: total ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

/** 某一期每日主帳收支，順序與 periodDays 相同 */
export function dailySeries(
  data: Pick<AppData, 'accounts' | 'transactions' | 'settings'>,
  period: string,
  accountId: string | null,
): Totals[] {
  const kindOf = kindLookup(data.accounts);
  const days = periodDays(period, data.settings.settleDay);
  const idx = new Map(days.map((k, i) => [k, i]));
  const arr: Totals[] = days.map(() => ({ income: 0, expense: 0 }));
  for (const t of data.transactions) {
    const e = statEffect(t, kindOf);
    if (!e) continue;
    if (accountId && e.accountId !== accountId) continue;
    const i = idx.get(dayKey(t.occurredAt));
    if (i === undefined) continue;
    arr[i][e.type] += e.amount;
  }
  return arr;
}

/** 紀錄是否和某帳戶有關（明細篩選用） */
export function touchesAccount(t: Transaction, accountId: string): boolean {
  return t.accountId === accountId || t.toAccountId === accountId;
}

/** 計算機結果存檔前四捨五入到整數元 */
export function roundAmount(v: number): number {
  return Math.round(v);
}
