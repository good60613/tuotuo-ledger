import type { AppData } from '../data/types';
import { ballTotal } from '../data/calc';
import { balls } from '../selectors';
import { ACCOUNT_KIND_ICON } from '../icons';
import { Icon } from './Icon';
import { money } from '../format';
import { openSub } from '../actions';

/** 五顆小帳戶球。首頁上同時是拖曳目標（data-drop） */
export function Balls({ data, droppable, onTap }: { data: AppData; droppable?: boolean; onTap?: (kind: string) => void }) {
  return (
    <div class="balls">
      {balls(data).map((b) => {
        const sum = ballTotal(data, b.kind);
        return (
          <div
            key={b.kind}
            class="ball"
            data-drop={droppable ? `ball:${b.kind}` : undefined}
            onClick={() => (onTap ? onTap(b.kind) : openSub(b.kind))}
          >
            <div class="ball-dot glass"><Icon name={ACCOUNT_KIND_ICON[b.kind]} size={24} /></div>
            <div class="ball-label">{b.label}</div>
            <div class="ball-amt">{money(sum)}</div>
          </div>
        );
      })}
    </div>
  );
}
