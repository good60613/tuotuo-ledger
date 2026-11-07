// 計算機的算式處理（純函式，方便測試）。算式用字串存，例如 "120+35×2"。
export type CalcKey =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | '00' | '.' | '+' | '−' | '×' | '÷' | 'AC' | '⌫';

const OPS = ['+', '−', '×', '÷'];
const MAX_DIGITS = 9;

const lastNumber = (expr: string) => {
  const m = expr.match(/[\d.]*$/);
  return m ? m[0] : '';
};

export function pressKey(expr: string, key: CalcKey): string {
  if (key === 'AC') return '';
  if (key === '⌫') return expr.slice(0, -1);
  if (OPS.includes(key)) {
    if (expr === '') return expr;
    if (OPS.includes(expr.slice(-1))) return expr.slice(0, -1) + key;
    if (expr.endsWith('.')) return expr.slice(0, -1) + key;
    return expr + key;
  }
  const num = lastNumber(expr);
  if (key === '.') {
    if (num.includes('.')) return expr;
    return expr + (num === '' ? '0.' : '.');
  }
  const intPart = num.split('.')[0];
  const decPart = num.includes('.') ? num.split('.')[1] : null;
  if (decPart !== null) {
    // 小數最多兩位
    if (decPart.length + key.length > 2) return expr;
    return expr + key;
  }
  if (intPart.length + key.length > MAX_DIGITS) return expr;
  if (key === '00') {
    if (num === '' || num === '0') return expr === '' || OPS.includes(expr.slice(-1)) ? expr + '0' : expr;
    return expr + '00';
  }
  if (num === '0') return expr.slice(0, -1) + key; // 開頭的 0 換掉
  return expr + key;
}

export function hasOperator(expr: string): boolean {
  // 末尾的運算子也算（例如 "12+"）
  return OPS.some((o) => expr.includes(o));
}

/** 算出結果；算不出來（例如除以 0）回傳 null */
export function evaluate(expr: string): number | null {
  if (expr === '') return 0;
  let e = expr;
  while (e && (OPS.includes(e.slice(-1)) || e.endsWith('.'))) e = e.slice(0, -1);
  if (e === '') return 0;
  const tokens = e.split(/([+−×÷])/).filter((t) => t !== '');
  // 先乘除
  const stack: (number | string)[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '×' || t === '÷') {
      const a = stack.pop() as number;
      const b = parseFloat(tokens[++i]);
      if (t === '÷' && b === 0) return null;
      stack.push(t === '×' ? a * b : a / b);
    } else if (t === '+' || t === '−') stack.push(t);
    else stack.push(parseFloat(t));
  }
  let r = stack[0] as number;
  for (let i = 1; i < stack.length; i += 2) {
    const op = stack[i];
    const v = stack[i + 1] as number;
    r = op === '+' ? r + v : r - v;
  }
  if (!Number.isFinite(r)) return null;
  return Math.round(r * 100) / 100;
}

/** 顯示用：數字加千分位 */
export function displayExpr(expr: string): string {
  if (expr === '') return '0';
  return expr.replace(/\d+(\.\d*)?/g, (m) => {
    const [i, d] = m.split('.');
    const n = Number(i).toLocaleString('en-US');
    return d !== undefined ? `${n}.${d}` : n;
  });
}

export function numberToExpr(n: number): string {
  return n > 0 ? String(n) : '';
}
