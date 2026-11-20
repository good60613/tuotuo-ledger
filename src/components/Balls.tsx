import { useEffect, useRef } from 'preact/hooks';
import type { AppData, AccountKind } from '../data/types';
import { ballTotal } from '../data/calc';
import { balls } from '../selectors';
import { ACCOUNT_KIND_ICON } from '../icons';
import { Icon } from './Icon';
import { money } from '../format';
import { openSub } from '../actions';
import { attachCardDrag, type DropTarget } from '../gestures/cardDrag';

/** 2.4：首頁的球也能長按拿起，只能放到最近紀錄上（改那筆的帳戶） */
export interface BallDrag {
  onLift: (kind: string) => void;
  onHover: (t: DropTarget | null) => void;
  onDrop: (kind: string, t: DropTarget) => void;
  onEnd: () => void;
}

interface BallInfo {
  kind: AccountKind;
  label: string;
}

/** 五顆小帳戶球。首頁上同時是拖曳目標（data-drop）；給 drag 時也能被拿起 */
export function Balls({ data, droppable, onTap, drag }: { data: AppData; droppable?: boolean; onTap?: (kind: string) => void; drag?: BallDrag }) {
  return (
    <div class="balls">
      {balls(data).map((b) => (
        <Ball key={b.kind} b={b} sum={ballTotal(data, b.kind)} droppable={droppable} onTap={onTap ?? openSub} drag={drag} />
      ))}
    </div>
  );
}

function Ball({ b, sum, droppable, onTap, drag }: { b: BallInfo; sum: number; droppable?: boolean; onTap: (kind: string) => void; drag?: BallDrag }) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ b, onTap, drag });
  latest.current = { b, onTap, drag };
  const draggable = !!drag;

  useEffect(() => {
    if (!draggable) return;
    return attachCardDrag(ref.current!, {
      sourceId: () => `ball:${latest.current.b.kind}`,
      onTap: () => latest.current.onTap(latest.current.b.kind),
      onLift: () => latest.current.drag?.onLift(latest.current.b.kind),
      onHover: (t) => latest.current.drag?.onHover(t),
      onDrop: (t) => latest.current.drag?.onDrop(latest.current.b.kind, t),
      onEnd: () => latest.current.drag?.onEnd(),
      accepts: (t) => t.kind === 'tx',
    });
  }, [draggable]);

  return (
    <div
      ref={ref}
      class="ball"
      data-drop={droppable ? `ball:${b.kind}` : undefined}
      onClick={draggable ? undefined : () => onTap(b.kind)}
    >
      <div class="ball-dot glass"><Icon name={ACCOUNT_KIND_ICON[b.kind]} size={24} /></div>
      <div class="ball-label">{b.label}</div>
      <div class="ball-amt">{money(sum)}</div>
    </div>
  );
}
