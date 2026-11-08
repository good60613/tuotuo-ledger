// 小帳戶子畫面用的「輸入金額」視窗：上方放各畫面自己的欄位，下方是計算機（同記帳頁）。
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { Sheet } from './Sheet';
import { Calculator } from './Calculator';
import { pressKey, evaluate, hasOperator, displayExpr, numberToExpr, type CalcKey } from '../calcExpr';
import { roundAmount } from '../data/calc';
import { showToast } from '../store';
import { money } from '../format';

interface Props {
  title: string;
  children?: ComponentChildren;
  /** 起始金額（例如校正時帶入目前餘額） */
  initial?: number;
  /** 允許金額為 0（校正、更新市值） */
  allowZero?: boolean;
  /** 其他欄位是否填好了 */
  ready?: boolean;
  /** 金額下方的補充說明，例如「差額 +30」 */
  hint?: (amount: number) => string;
  /** 回傳 false 表示不關閉（例如檢查沒過） */
  onSubmit: (amount: number) => boolean | void;
  onClose: () => void;
}

export function AmountForm({ title, children, initial, allowZero, ready = true, hint, onSubmit, onClose }: Props) {
  const [expr, setExpr] = useState(initial !== undefined ? numberToExpr(initial) : '');
  const value = evaluate(expr);
  const amount = value === null ? 0 : roundAmount(value);
  const pending = hasOperator(expr);
  const valid = ready && expr !== '' && value !== null && (allowZero ? amount >= 0 : amount > 0);

  const ok = () => {
    if (pending) {
      const v = evaluate(expr);
      if (v === null) showToast('無法計算（不能除以 0）');
      else setExpr(numberToExpr(v));
      return;
    }
    if (!valid) return;
    if (onSubmit(amount) !== false) onClose();
  };

  return (
    <Sheet title={title} onClose={onClose}>
      {children}
      <div class="amount-line">
        <span class="muted">TWD</span>
        <b>{expr === '' ? '0' : displayExpr(expr)}</b>
      </div>
      {hint && valid && <div class="muted small amount-hint">{hint(amount)}</div>}
      <Calculator
        onKey={(k: CalcKey) => setExpr((e) => pressKey(e, k))}
        onOk={ok}
        okLabel={pending ? '＝' : 'OK'}
        okDisabled={pending ? expr === '' : !valid}
      />
    </Sheet>
  );
}

/** 校正：輸入實際餘額，差額自動產生一筆「調整」紀錄（不算收支） */
export function diffText(diff: number): string {
  if (diff === 0) return '和帳上一致，不會產生調整';
  return `差額 ${diff > 0 ? '+' : '-'}${money(Math.abs(diff))}，會產生一筆「調整」紀錄（不算收支）`;
}
