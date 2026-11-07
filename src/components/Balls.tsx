import type { AppData } from '../data/types';
import { allBalances } from '../data/calc';
import { balls, KIND_ICON } from '../selectors';
import { money } from '../format';

/** 五顆小帳戶球。首頁上同時是拖曳目標（data-drop） */
export function Balls({ data, droppable, onTap }: { data: AppData; droppable?: boolean; onTap?: (kind: string) => void }) {
  const bal = allBalances(data);
  return (
    <div class="balls">
      {balls(data).map((b) => {
        const sum = b.accounts.reduce((s, a) => s + (bal.get(a.id) ?? 0), 0);
        return (
          <div
            key={b.kind}
            class="ball"
            data-drop={droppable ? `ball:${b.kind}` : undefined}
            onClick={onTap ? () => onTap(b.kind) : undefined}
          >
            <div class="ball-dot">{KIND_ICON[b.kind]}</div>
            <div class="ball-label">{b.label}</div>
            <div class="ball-amt">{money(sum)}</div>
          </div>
        );
      })}
    </div>
  );
}
