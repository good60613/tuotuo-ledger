import type { CalcKey } from '../calcExpr';
import { CALC } from '../config';
import { Icon } from './Icon';
import { UI_ICONS } from '../icons';

interface Props {
  onKey: (k: CalcKey) => void;
  onOk: () => void;
  /** 算式裡有運算子時，OK 先變成「＝」 */
  okLabel: string;
  okDisabled: boolean;
}

// 五欄：左三欄數字、第四欄運算（÷ × + −）、第五欄 AC／退格／OK（OK 佔兩格高）
const KEYS: CalcKey[] = ['7', '8', '9', '÷', 'AC', '4', '5', '6', '×', '⌫', '1', '2', '3', '+'];
const LAST_ROW: CalcKey[] = ['00', '0', '.', '−'];

export function Calculator({ onKey, onOk, okLabel, okDisabled }: Props) {
  return (
    <div
      class="calc"
      data-no-swipe
      style={{ '--calc-row': `${CALC.rowHeightPx}px`, '--calc-row-short': `${CALC.shortRowHeightPx}px`, '--calc-gap': `${CALC.gapPx}px` }}
    >
      {KEYS.map((k) => (
        <button
          key={k}
          class={`calc-key${'÷×−+'.includes(k) ? ' op' : k === 'AC' || k === '⌫' ? ' fn' : ''}`}
          onClick={() => onKey(k)}
          aria-label={k === '⌫' ? '退格' : undefined}
        >
          {k === '⌫' ? <Icon name={UI_ICONS['退格']} size={22} /> : k}
        </button>
      ))}
      <button class="calc-key ok" disabled={okDisabled} onClick={onOk}>{okLabel}</button>
      {LAST_ROW.map((k) => (
        <button key={k} class={`calc-key${'÷×−+'.includes(k) ? ' op' : ''}`} onClick={() => onKey(k)}>
          {k}
        </button>
      ))}
    </div>
  );
}
