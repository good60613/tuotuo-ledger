// 2.5 明細頁的紀錄手勢（掛在時間軸外框上，用事件委派）：
//
//   按下 ──┬─ 拿起前手指移動超過 moveTolerancePx ───────────→ 「捲動」：放棄
//          ├─ 在 longPressMs 內放開 ────────────────────────→ 「點一下」（交給列表本身的 click）
//          └─ 按滿 longPressMs（震動、卡片浮起）
//                 ├─ 沒有移動就放開 ───────────────────────→ 進入多選（onPick）
//                 └─ 移動超過 moveTolerancePx
//                       ├─ 這筆不能拖（轉帳、校正…）───────→ 提示並取消
//                       └─ 拖曳：畫面下方出現垃圾桶、列與列之間出現插入線
//                             ├─ 放在垃圾桶上 ─────────────→ onTrash（之後跳確認）
//                             ├─ 放在列與列之間 ───────────→ onDrop（改時間）
//                             └─ 被打斷 ───────────────────→ 取消
//   任何時候：第二根手指、系統取消觸控、切到別的 App → 全部取消。
// 時間與移動門檻沿用 config.ts 的 GESTURE；跟首頁拖帳戶（cardDrag）互不相干（不同頁、不同元素）。
import { GESTURE, TX_DRAG } from '../config';
import { vibrate } from './haptics';
import { blockClicks } from './guard';
import type { DropSlot } from '../data/txMove';

export interface TxDragOptions {
  canDrag: (id: string) => boolean;
  /** 長按後沒有移動就放開 */
  onPick: (id: string) => void;
  /** 長按觸發（開始擋換頁）；onEnd 一定會跟著呼叫 */
  onLift: () => void;
  onEnd: () => void;
  onDrop: (id: string, slot: DropSlot) => void;
  onTrash: (id: string) => void;
  /** 長按後想拖一筆不能拖的紀錄 */
  onCantDrag: (id: string) => void;
}

type Phase = 'idle' | 'pressed' | 'armed' | 'dragging';

export function attachTxDrag(root: HTMLElement, opt: TxDragOptions): () => void {
  let phase: Phase = 'idle';
  let id = '';
  let card: HTMLElement | null = null;
  let pointerId = -1;
  let x0 = 0, y0 = 0, lastX = 0, lastY = 0, grabDx = 0, grabDy = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ghost: HTMLElement | null = null;
  let trash: HTMLElement | null = null;
  let line: HTMLElement | null = null;
  let slot: DropSlot | null = null;
  let overTrash = false;
  let raf = 0;
  let scroller: HTMLElement | null = null;

  const preventScroll = (e: TouchEvent) => {
    if (phase === 'armed' || phase === 'dragging') e.preventDefault();
  };

  const findScroller = (el: HTMLElement | null): HTMLElement | null => {
    for (let n = el; n; n = n.parentElement) {
      const oy = getComputedStyle(n).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
    }
    return null;
  };

  const cleanup = () => {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('pointerdown', onOtherDown, true);
    window.removeEventListener('blur', onCancel);
    document.removeEventListener('visibilitychange', onVis);
    document.removeEventListener('touchmove', preventScroll);
    ghost?.remove();
    trash?.remove();
    line?.remove();
    ghost = trash = line = null;
    card?.classList.remove('tx-armed', 'tx-dragging');
    root.classList.remove('tl-dragging');
    const lifted = phase === 'armed' || phase === 'dragging';
    phase = 'idle';
    card = null;
    slot = null;
    overTrash = false;
    if (lifted) opt.onEnd();
  };

  const arm = () => {
    if (phase !== 'pressed' || !card) return;
    phase = 'armed';
    vibrate(GESTURE.liftVibrateMs);
    card.classList.add('tx-armed');
    document.addEventListener('touchmove', preventScroll, { passive: false });
    opt.onLift();
  };

  const startDrag = () => {
    if (!card) return;
    phase = 'dragging';
    const r = card.getBoundingClientRect();
    grabDx = x0 - r.left;
    grabDy = y0 - r.top;
    ghost = card.cloneNode(true) as HTMLElement;
    ghost.classList.remove('tx-armed');
    ghost.classList.add('drag-ghost', 'tx-ghost');
    Object.assign(ghost.style, {
      position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
      margin: '0', pointerEvents: 'none', zIndex: '1000', transform: `scale(${GESTURE.dragScale})`, opacity: String(GESTURE.dragOpacity),
    });
    document.body.appendChild(ghost);
    card.classList.remove('tx-armed');
    card.classList.add('tx-dragging');
    root.classList.add('tl-dragging');
    trash = document.createElement('div');
    trash.className = 'tx-trash';
    trash.style.setProperty('--trash-size', `${TX_DRAG.trashSizePx}px`);
    trash.style.bottom = `${TX_DRAG.trashBottomPx}px`;
    trash.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg><span>刪除</span>';
    document.body.appendChild(trash);
    line = document.createElement('div');
    line.className = 'tx-insert-line';
    document.body.appendChild(line);
    scroller = findScroller(root);
    const tick = () => {
      if (phase !== 'dragging') return;
      autoScroll();
      update();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };

  const autoScroll = () => {
    if (!scroller || overTrash) return;
    const r = scroller.getBoundingClientRect();
    const top = Math.max(r.top, 0) + TX_DRAG.edgePx;
    const bottom = Math.min(r.bottom, window.innerHeight) - TX_DRAG.bottomInsetPx - TX_DRAG.edgePx;
    if (lastY < top) scroller.scrollTop -= TX_DRAG.scrollSpeedPx;
    else if (lastY > bottom) scroller.scrollTop += TX_DRAG.scrollSpeedPx;
  };

  /** 依手指位置算出放下的位置與插入線 */
  const update = () => {
    if (!ghost || !trash || !line) return;
    ghost.style.left = `${lastX - grabDx}px`;
    ghost.style.top = `${lastY - grabDy + GESTURE.dragOffsetY}px`;
    const tr = trash.getBoundingClientRect();
    const pad = TX_DRAG.trashHitPadPx;
    const nowTrash = lastX >= tr.left - pad && lastX <= tr.right + pad && lastY >= tr.top - pad && lastY <= tr.bottom + pad;
    if (nowTrash !== overTrash) {
      overTrash = nowTrash;
      trash.classList.toggle('hover', overTrash);
      if (overTrash) vibrate(GESTURE.hoverVibrateMs);
    }
    if (overTrash) {
      slot = null;
      line.style.display = 'none';
      return;
    }
    const days = [...root.querySelectorAll<HTMLElement>('.day[data-day]')];
    if (days.length === 0) return;
    // 手指所在的那一天（在兩天之間就取比較近的）
    let dayEl = days[days.length - 1];
    for (const el of days) {
      if (lastY < el.getBoundingClientRect().bottom) {
        dayEl = el;
        break;
      }
    }
    const rows = [...dayEl.querySelectorAll<HTMLElement>('.tl-row[data-id]')].filter((r) => r.dataset.id !== id);
    let above: HTMLElement | null = null;
    let below: HTMLElement | null = null;
    for (const r of rows) {
      const rr = r.getBoundingClientRect();
      if (lastY < rr.top + rr.height / 2) {
        below = r;
        break;
      }
      above = r;
    }
    const next: DropSlot = { day: dayEl.dataset.day!, aboveId: above?.dataset.id ?? null, belowId: below?.dataset.id ?? null };
    if (!slot || slot.day !== next.day || slot.aboveId !== next.aboveId || slot.belowId !== next.belowId) {
      if (slot) vibrate(GESTURE.hoverVibrateMs);
      slot = next;
    }
    const head = dayEl.querySelector<HTMLElement>('.day-head')!.getBoundingClientRect();
    const y = below ? below.getBoundingClientRect().top : above ? above.getBoundingClientRect().bottom : head.bottom;
    const box = dayEl.getBoundingClientRect();
    Object.assign(line.style, { display: 'block', top: `${y - 1}px`, left: `${box.left + TX_DRAG.lineInsetPx}px`, width: `${box.width - TX_DRAG.lineInsetPx}px` });
  };

  function onDown(e: PointerEvent) {
    if (phase !== 'idle' || !e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const c = (e.target as HTMLElement).closest<HTMLElement>('.tx-card[data-tx]');
    if (!c || !root.contains(c)) return;
    card = c;
    id = c.dataset.tx!;
    phase = 'pressed';
    pointerId = e.pointerId;
    x0 = lastX = e.clientX;
    y0 = lastY = e.clientY;
    timer = setTimeout(arm, GESTURE.longPressMs);
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
    const moved = Math.hypot(lastX - x0, lastY - y0) > GESTURE.moveTolerancePx;
    if (phase === 'pressed') {
      if (moved) cleanup(); // 在捲動
    } else if (phase === 'armed') {
      if (!moved) return;
      if (opt.canDrag(id)) startDrag();
      else {
        const x = id;
        blockClicks(GESTURE.afterDropCooldownMs);
        cleanup();
        opt.onCantDrag(x);
      }
    } else if (phase === 'dragging') {
      e.preventDefault();
      update();
    }
  }

  function onUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    const p = phase;
    const x = id;
    const s = slot;
    const t = overTrash;
    if (p === 'armed' || p === 'dragging') blockClicks(GESTURE.afterDropCooldownMs);
    cleanup();
    if (p === 'armed') opt.onPick(x);
    else if (p === 'dragging') {
      if (t) opt.onTrash(x);
      else if (s) opt.onDrop(x, s);
    }
  }

  function onCancel() {
    if (phase === 'armed' || phase === 'dragging') blockClicks(GESTURE.afterDropCooldownMs);
    cleanup();
  }
  function onOtherDown(e: PointerEvent) {
    if (e.pointerId !== pointerId) onCancel();
  }
  function onVis() {
    if (document.hidden) onCancel();
  }

  root.addEventListener('pointerdown', onDown);
  return () => {
    root.removeEventListener('pointerdown', onDown);
    cleanup();
  };
}
