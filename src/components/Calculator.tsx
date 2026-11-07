import type { CalcKey } from '../calcExpr';

interface Props {
  onKey: (k: CalcKey) => void;
  onOk: () => void;
  /** 算式裡有運算子時，OK 先變成「＝」 */
  okLabel: string;
  okDisabled: boolean;
}

const ROWS: CalcKey[][] = [
  ['7', '8', '9', '÷'],
  ['4', '5', '6', '×'],
  ['1', '2', '3', '−'],
  ['00', '0', '.', '+'],
];

export function Calculator({ onKey, onOk, okLabel, okDisabled }: Props) {
  return (
    <div class="calc" data-no-swipe>
      {ROWS.flat().map((k) => (
        <button key={k} class={`calc-key${'÷×−+'.includes(k) ? ' op' : ''}`} onClick={() => onKey(k)}>
          {k}
        </button>
      ))}
      <button class="calc-key fn" onClick={() => onKey('AC')}>AC</button>
      <button class="calc-key fn" onClick={() => onKey('⌫')} aria-label="退格">⌫</button>
      <button class="calc-key ok" disabled={okDisabled} onClick={onOk}>{okLabel}</button>
    </div>
  );
}
