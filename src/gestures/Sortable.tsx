// 長按拖曳換位置（第三批第 5 項：帳戶管理、小帳戶管理、分類管理共用）。
// 判斷方式和儲蓄目標一樣，數值都讀 config.ts 的 GESTURE：
// - 按住未滿 longPressMs 就移動超過 moveTolerancePx＝在捲動，不會拿起。
// - 按住滿 longPressMs 才拿起（震一下），之後移動＝拖曳；放開時換到手指底下那一格。
// - 拖到 data-sort="__trash" 的格子放開＝刪除（交給 onTrash）。
// - 拖曳放開後那一下 click 不算點擊（afterDropCooldownMs）。
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { GESTURE } from '../config';
import { vibrate } from './haptics';

export const TRASH_ID = '__trash';

export interface DragState {
  id: string;
  over: string;
}

export interface ItemBind {
  'data-sort': string;
  onPointerDown: (e: JSX.TargetedPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: JSX.TargetedPointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onClickCapture: (e: JSX.TargetedMouseEvent<HTMLElement>) => void;
  onContextMenu: (e: Event) => void;
}

/** 依拖曳結果算出新順序：拿起的那一格插到放下的那一格的位置 */
export function moveId(ids: string[], from: string, to: string): string[] {
  if (from === to || !ids.includes(from) || !ids.includes(to)) return ids;
  const rest = ids.filter((i) => i !== from);
  const forward = ids.indexOf(to) > ids.indexOf(from);
  rest.splice(rest.indexOf(to) + (forward ? 1 : 0), 0, from);
  return rest;
}

export function Sortable({
  ids, enabled = true, onReorder, onTrash, class: cls, children,
}: {
  ids: string[];
  enabled?: boolean;
  onReorder: (ids: string[]) => void;
  onTrash?: (id: string) => void;
  class?: string;
  children: (bind: (id: string) => ItemBind | Record<string, never>, drag: DragState | null) => ComponentChildren;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ id: string; x: number; y: number; timer?: ReturnType<typeof setTimeout> } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const justDragged = useRef(false);

  // 拖曳中擋住頁面捲動（需要非 passive 的 touchmove）
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const block = (e: TouchEvent) => {
      if (dragRef.current) e.preventDefault();
    };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, []);

  const overId = (x: number, y: number, fallback: string) => {
    const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-sort]') as HTMLElement | null;
    return el && boxRef.current?.contains(el) ? el.dataset.sort ?? fallback : fallback;
  };
  const end = () => {
    const p = press.current;
    const dr = dragRef.current;
    if (p) clearTimeout(p.timer);
    press.current = null;
    if (!dr) return;
    if (dr.over === TRASH_ID) onTrash?.(dr.id);
    else if (dr.over !== dr.id) onReorder(moveId(ids, dr.id, dr.over));
    setDrag(null);
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), GESTURE.afterDropCooldownMs);
  };

  const bind = (id: string): ItemBind | Record<string, never> => {
    if (!enabled) return {};
    return {
      'data-sort': id,
      onPointerDown: (e) => {
        press.current = { id, x: e.clientX, y: e.clientY };
        press.current.timer = setTimeout(() => {
          if (!press.current) return;
          vibrate(GESTURE.liftVibrateMs);
          setDrag({ id, over: id });
        }, GESTURE.longPressMs);
      },
      onPointerMove: (e) => {
        const p = press.current;
        if (!p) return;
        if (!dragRef.current) {
          // 還沒拿起就移動太多＝在捲動，取消
          if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > GESTURE.moveTolerancePx) {
            clearTimeout(p.timer);
            press.current = null;
          }
          return;
        }
        const over = overId(e.clientX, e.clientY, dragRef.current.over);
        if (over !== dragRef.current.over) {
          vibrate(GESTURE.hoverVibrateMs);
          setDrag({ id: dragRef.current.id, over });
        }
      },
      onPointerUp: end,
      onPointerCancel: end,
      onClickCapture: (e) => {
        if (justDragged.current) {
          e.stopPropagation();
          e.preventDefault();
        }
      },
      onContextMenu: (e) => e.preventDefault(),
    };
  };

  return (
    <div ref={boxRef} class={`sortable${drag ? ' dragging' : ''}${cls ? ' ' + cls : ''}`} data-no-swipe>
      {children(bind, drag)}
    </div>
  );
}
