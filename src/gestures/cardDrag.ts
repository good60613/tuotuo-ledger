// 卡片手勢：點一下／長按拿起／拖曳／放開。
//
// 判斷流程（每一次按下都只會落到一種結果）：
//   按下 ──┬─ 拿起前手指移動超過 moveTolerancePx ───────→ 「滑動」：放棄，交給換頁
//          ├─ 在 longPressMs 內、幾乎沒動就放開 ─────────→ 「點一下」
//          └─ 按滿 longPressMs 且幾乎沒動 ──────────────→ 「拿起」（震動＋浮起）
//                 拿起後 ──┬─ 在放置目標上放開 ───────────→ 執行（開輸入畫面）
//                          └─ 空白處／原卡／被打斷 ────────→ 取消
//   任何時候：第二根手指、系統取消觸控、切到別的 App → 全部取消。
import { GESTURE } from '../config';
import { vibrate } from './haptics';
import { blockClicks, clicksBlocked } from './guard';

export type DropTarget =
  | { kind: 'expense' }
  | { kind: 'income' }
  | { kind: 'account'; id: string }
  | { kind: 'ball'; ballKind: string };

export interface CardDragOptions {
  /** 被拿起的帳戶 id */
  sourceId: () => string;
  onTap: () => void;
  onLift: () => void;
  onHover: (t: DropTarget | null) => void;
  /** 放在有效目標上（已排除「放回原卡」） */
  onDrop: (t: DropTarget) => void;
  /** 取消或結束（不論結果都會呼叫，用來收起放置區） */
  onEnd: () => void;
}

export function parseTarget(el: Element | null): DropTarget | null {
  const host = el?.closest<HTMLElement>('[data-drop]');
  if (!host) return null;
  const v = host.dataset.drop!;
  if (v === 'expense' || v === 'income') return { kind: v };
  if (v.startsWith('account:')) return { kind: 'account', id: v.slice(8) };
  if (v.startsWith('ball:')) return { kind: 'ball', ballKind: v.slice(5) };
  return null;
}

const sameTarget = (a: DropTarget | null, b: DropTarget | null) => JSON.stringify(a) === JSON.stringify(b);

type Phase = 'idle' | 'pressed' | 'lifted';

/** 把手勢掛到卡片元素上；回傳解除函式 */
export function attachCardDrag(el: HTMLElement, opt: CardDragOptions): () => void {
  let phase: Phase = 'idle';
  let pointerId = -1;
  let x0 = 0, y0 = 0, t0 = 0;
  let grabDx = 0, grabDy = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ghost: HTMLElement | null = null;
  let hover: DropTarget | null = null;
  let lastX = 0, lastY = 0;

  const highlight = (t: DropTarget | null) => {
    document.querySelectorAll('.drop-hover').forEach((n) => n.classList.remove('drop-hover'));
    if (!t) return;
    const sel =
      t.kind === 'account' ? `[data-drop="account:${t.id}"]`
      : t.kind === 'ball' ? `[data-drop="ball:${t.ballKind}"]`
      : `[data-drop="${t.kind}"]`;
    document.querySelectorAll(sel).forEach((n) => n.classList.add('drop-hover'));
  };

  const cleanupListeners = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('pointerdown', onOtherDown, true);
    window.removeEventListener('blur', onCancel);
    document.removeEventListener('visibilitychange', onVis);
    document.removeEventListener('touchmove', preventScroll);
  };

  const reset = () => {
    clearTimeout(timer);
    cleanupListeners();
    const wasLifted = phase === 'lifted';
    phase = 'idle';
    pointerId = -1;
    try {
      if (el.hasPointerCapture?.(lastPointer)) el.releasePointerCapture(lastPointer);
    } catch { /* ignore */ }
    if (wasLifted) {
      highlight(null);
      el.classList.remove('is-source');
      document.body.classList.remove('is-dragging');
      opt.onEnd();
    }
  };
  let lastPointer = -1;

  const removeGhost = (animateBack: boolean) => {
    const g = ghost;
    ghost = null;
    if (!g) return;
    if (animateBack) {
      // 彈回原位，讓使用者看得出「取消了」
      const r = el.getBoundingClientRect();
      g.style.transition = 'left .18s ease-out, top .18s ease-out, transform .18s ease-out, opacity .18s';
      g.style.left = `${r.left}px`;
      g.style.top = `${r.top}px`;
      g.style.transform = 'scale(1)';
      g.style.opacity = '0.4';
      setTimeout(() => g.remove(), 190);
    } else g.remove();
  };

  const lift = () => {
    if (phase !== 'pressed') return;
    phase = 'lifted';
    vibrate(GESTURE.liftVibrateMs);
    const r = el.getBoundingClientRect();
    grabDx = x0 - r.left;
    grabDy = y0 - r.top;
    ghost = el.cloneNode(true) as HTMLElement;
    ghost.classList.add('drag-ghost');
    ghost.removeAttribute('data-drop');
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      margin: '0',
      pointerEvents: 'none',
      zIndex: '1000',
      transform: `scale(${GESTURE.liftScale})`,
      transition: 'transform .12s ease-out',
    });
    document.body.appendChild(ghost);
    el.classList.add('is-source');
    document.body.classList.add('is-dragging');
    try { el.setPointerCapture(pointerId); } catch { /* ignore */ }
    document.addEventListener('touchmove', preventScroll, { passive: false });
    opt.onLift();
    moveGhost(lastX, lastY);
  };

  const moveGhost = (x: number, y: number) => {
    if (!ghost) return;
    ghost.style.left = `${x - grabDx}px`;
    ghost.style.top = `${y - grabDy + GESTURE.dragOffsetY}px`;
    const t = parseTarget(document.elementFromPoint(x, y));
    if (!sameTarget(t, hover)) {
      hover = t;
      if (t && !(t.kind === 'account' && t.id === opt.sourceId())) vibrate(GESTURE.hoverVibrateMs);
      highlight(t && !(t.kind === 'account' && t.id === opt.sourceId()) ? t : null);
      opt.onHover(t);
    }
  };

  const preventScroll = (e: TouchEvent) => {
    if (phase === 'lifted') e.preventDefault();
  };

  function onDown(e: PointerEvent) {
    if (phase !== 'idle') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!e.isPrimary) return;
    phase = 'pressed';
    pointerId = lastPointer = e.pointerId;
    x0 = lastX = e.clientX;
    y0 = lastY = e.clientY;
    t0 = performance.now();
    hover = null;
    timer = setTimeout(lift, GESTURE.longPressMs);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('pointerdown', onOtherDown, true);
    window.addEventListener('blur', onCancel);
    document.addEventListener('visibilitychange', onVis);
  }

  function onMove(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    lastX = e.clientX;
    lastY = e.clientY;
    if (phase === 'pressed') {
      if (Math.hypot(e.clientX - x0, e.clientY - y0) > GESTURE.moveTolerancePx) {
        // 手指在動 → 這是滑動，不是點擊也不是長按
        reset();
      }
    } else if (phase === 'lifted') {
      e.preventDefault();
      moveGhost(e.clientX, e.clientY);
    }
  }

  function onUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    if (phase === 'pressed') {
      const dt = performance.now() - t0;
      const moved = Math.hypot(e.clientX - x0, e.clientY - y0);
      reset();
      if (dt < GESTURE.tapMaxMs && moved <= GESTURE.moveTolerancePx && !clicksBlocked()) {
        blockClicks(GESTURE.afterDropCooldownMs);
        opt.onTap();
      }
    } else if (phase === 'lifted') {
      const t = parseTarget(document.elementFromPoint(e.clientX, e.clientY));
      const valid = t && !(t.kind === 'account' && t.id === opt.sourceId());
      blockClicks(GESTURE.afterDropCooldownMs);
      removeGhost(!valid);
      reset();
      if (valid) opt.onDrop(t!);
    }
  }

  function onCancel() {
    if (phase === 'idle') return;
    if (phase === 'lifted') {
      blockClicks(GESTURE.afterDropCooldownMs);
      removeGhost(true);
    }
    reset();
  }

  function onOtherDown(e: PointerEvent) {
    // 第二根手指碰到螢幕 → 取消，避免多指誤判
    if (e.pointerId !== pointerId) onCancel();
  }

  function onVis() {
    if (document.hidden) onCancel();
  }

  el.addEventListener('pointerdown', onDown);
  return () => {
    el.removeEventListener('pointerdown', onDown);
    onCancel();
  };
}
