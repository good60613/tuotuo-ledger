// 拖拖計算機的拆帳規則（2.0 第一批，PK 2026-11-10 定案）。純函式，方便測試。
//
// 使用者在算式的數字上掛標記（我先付、朋友付、預算、報帳），按 OK 時拆成多筆：
// - 掛標記的數字各自成為一筆帶標記的紀錄（同一個標記掛兩個數字＝兩筆，可能是兩個朋友）。
// - 其餘部分成為一筆一般紀錄：
//   · 拖到「＋」連接的數字（含第一個數字）：那個數字是別人那份，一般＝算式結果－那個數字。
//     例：500＋600，600 掛我先付 → 一般 500、我先付 600。
//   · 拖到「－」後面的數字：算式本來就扣掉了，一般＝算式結果。
//     例：1100－600，600 掛我先付 → 一般 500、我先付 600（帳戶共扣 1,100）。
// - 只能掛在以加減連接的單獨數字上；乘除裡的數字不能掛。
// - 一個數字只能掛一個標記，後掛的取代先掛的。
// - 一般部分是 0 → 不產生一般紀錄；是負數 → 不能存。
import { evaluate } from './calcExpr';
import { roundAmount } from './data/calc';
import type { TxInput } from './data/ops';

export type Mark = 'advance' | 'owed' | 'budget' | 'reimb';

export const MARK_LABEL: Record<Mark, string> = {
  advance: '我先付',
  owed: '朋友付',
  budget: '預算',
  reimb: '報帳',
};

export interface Term {
  /** 第幾個數字（從 0 起） */
  index: number;
  /** 原文，例如 "600" */
  text: string;
  value: number;
  /** 前面的運算子；第一個數字視為 '+' */
  op: '+' | '−' | '×' | '÷';
  /** 是否在乘除裡（前或後接 × ÷），這種數字不能掛標記 */
  inProduct: boolean;
  /** 在算式字串裡的位置 [start, end) */
  start: number;
  end: number;
}

/** 把算式拆成一個個數字（末尾還沒打完的運算子、小數點忽略） */
export function parseTerms(expr: string): Term[] {
  const out: Term[] = [];
  const re = /[\d.]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr))) {
    const prev = m.index > 0 ? expr[m.index - 1] : '+';
    const next = expr[m.index + m[0].length];
    const text = m[0].replace(/\.$/, '');
    out.push({
      index: out.length,
      text,
      value: parseFloat(text) || 0,
      op: (['+', '−', '×', '÷'].includes(prev) ? prev : '+') as Term['op'],
      inProduct: prev === '×' || prev === '÷' || next === '×' || next === '÷',
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return out;
}

/** 這個數字能不能掛標記 */
export function canMark(t: Term | undefined): boolean {
  return !!t && !t.inProduct;
}

export type Marks = Record<number, Mark>;

/**
 * 算式改了之後，標記還留不留：同一個位置的數字原文、前面的運算子都沒變才保留，
 * 被改掉、刪掉、變成乘除裡的數字就拿掉。
 */
export function reconcileMarks(oldExpr: string, newExpr: string, marks: Marks): Marks {
  if (Object.keys(marks).length === 0) return marks;
  const a = parseTerms(oldExpr), b = parseTerms(newExpr);
  const out: Marks = {};
  let changed = false;
  for (const [k, v] of Object.entries(marks)) {
    const i = Number(k);
    const x = a[i], y = b[i];
    if (x && y && x.text === y.text && x.op === y.op && canMark(y)) out[i] = v;
    else changed = true;
  }
  return changed ? out : marks;
}

export interface SplitPart {
  term: number;
  mark: Mark;
  amount: number;
}

export type SplitPlan =
  | { ok: true; general: number; parts: SplitPart[] }
  | { ok: false; error: string };

/** 依標記算出要拆成哪幾筆 */
export function splitPlan(expr: string, marks: Marks): SplitPlan {
  const result = evaluate(expr);
  if (result === null) return { ok: false, error: '無法計算（不能除以 0）' };
  const terms = parseTerms(expr);
  const parts: SplitPart[] = [];
  let plus = 0;
  for (const t of terms) {
    const mark = marks[t.index];
    if (!mark) continue;
    if (!canMark(t)) return { ok: false, error: '乘除裡的數字不能掛標記' };
    const amount = roundAmount(t.value);
    if (amount <= 0) return { ok: false, error: `${MARK_LABEL[mark]}的金額要大於 0` };
    parts.push({ term: t.index, mark, amount });
    if (t.op === '+') plus += t.value;
  }
  const general = roundAmount(result - plus);
  if (general < 0) return { ok: false, error: '一般支出變成負數，請檢查算式' };
  if (general === 0 && parts.length === 0) return { ok: false, error: '金額必須大於 0' };
  return { ok: true, general, parts };
}

export interface SplitBase {
  /** 'expense' 或 'income'（收入沒有標記，只會有一般那筆） */
  type: 'expense' | 'income';
  /** 一般那筆與我先付、預算、報帳用的帳戶；全部都是朋友付時可以是 null */
  accountId: string | null;
  categoryId: string;
  note: string;
  occurredAt: string;
  expr: string;
  splitId: string;
}

/** 拆帳結果轉成要新增的紀錄（分類、備註、日期、帳戶相同）；帳戶不夠時丟錯字串 */
export function splitInputs(plan: Extract<SplitPlan, { ok: true }>, b: SplitBase): TxInput[] {
  const withOp = /[+−×÷]/.test(b.expr);
  const common = {
    categoryId: b.categoryId,
    note: b.note,
    occurredAt: b.occurredAt,
    calcExpr: withOp ? b.expr : undefined,
    splitId: plan.parts.length > 0 && (plan.general > 0 || plan.parts.length > 1) ? b.splitId : undefined,
  };
  const needAcc = () => {
    if (!b.accountId) throw new Error('請選帳戶');
    return b.accountId;
  };
  const out: TxInput[] = [];
  if (plan.general > 0) out.push({ ...common, type: b.type, amount: plan.general, accountId: needAcc() });
  for (const p of plan.parts) {
    const tagged = { ...common, amount: p.amount, calcTerm: withOp ? p.term : undefined };
    if (p.mark === 'owed') out.push({ ...tagged, type: 'owed', accountId: '' });
    else
      out.push({
        ...tagged,
        type: 'expense',
        accountId: needAcc(),
        budget: p.mark === 'budget' || undefined,
        reimbursable: p.mark === 'advance' || p.mark === 'reimb' || undefined,
        reimburseKind: p.mark === 'advance' ? 'advance' : undefined,
      });
  }
  return out;
}

/** OK 前的小字預覽：「會拆成：吃飯 500＋我先付 600」。沒有標記時回傳 null */
export function previewText(plan: SplitPlan, generalLabel: string, money: (n: number) => string): string | null {
  if (!plan.ok || plan.parts.length === 0) return null;
  if (plan.general === 0 && plan.parts.length === 1) return `整筆記成：${MARK_LABEL[plan.parts[0].mark]} ${money(plan.parts[0].amount)}`;
  const items: string[] = [];
  if (plan.general > 0) items.push(`${generalLabel} ${money(plan.general)}`);
  for (const p of plan.parts) items.push(`${MARK_LABEL[p.mark]} ${money(p.amount)}`);
  return '會拆成：' + items.join('＋');
}
