// 左右滑換頁。只處理「明顯是水平」的滑動；上下捲動交給瀏覽器。
// 卡片被拿起時（getDragging() 為 true）完全不動作。
import { PAGER } from '../config';
import { blockClicks } from './guard';

export interface PagerOptions {
  getPage: () => number;
  pageCount: number;
  setPage: (p: number) => void;
  getDragging: () => boolean;
  /** 手指拖動時的位移（px），null＝回到定位 */
  onOffset: (dx: number | null) => void;
}

export function attachPager(el: HTMLElement, opt: PagerOptions): () => void {
  let id = -1;
  let x0 = 0, y0 = 0;
  let mode: 'none' | 'undecided' | 'horizontal' | 'vertical' = 'none';
  let lastX = 0, lastT = 0, vx = 0;

  const end = () => {
    id = -1;
    mode = 'none';
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onAbort);
  };

  function onDown(e: PointerEvent) {
    if (!e.isPrimary || id !== -1) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-no-swipe]')) return;
    id = e.pointerId;
    x0 = lastX = e.clientX;
    y0 = e.clientY;
    lastT = performance.now();
    vx = 0;
    mode = 'undecided';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onAbort);
  }

  function edgeResist(dx: number) {
    const p = opt.getPage();
    if ((p === 0 && dx > 0) || (p === opt.pageCount - 1 && dx < 0)) return dx * 0.3;
    return dx;
  }

  function onMove(e: PointerEvent) {
    if (e.pointerId !== id) return;
    if (opt.getDragging()) {
      // 卡片已拿起 → 換頁完全停用
      opt.onOffset(null);
      end();
      return;
    }
    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    if (mode === 'undecided') {
      if (Math.hypot(dx, dy) < PAGER.lockDistancePx) return;
      mode = Math.abs(dx) > Math.abs(dy) * PAGER.horizontalBias ? 'horizontal' : 'vertical';
      if (mode === 'vertical') {
        end();
        return;
      }
      x0 = e.clientX; // 從鎖定方向的這一點開始算，避免畫面跳一下
    }
    if (mode === 'horizontal') {
      const now = performance.now();
      const dt = now - lastT;
      if (dt > 0) vx = 0.8 * ((e.clientX - lastX) / dt) + 0.2 * vx;
      lastX = e.clientX;
      lastT = now;
      opt.onOffset(edgeResist(e.clientX - x0));
    }
  }

  function onUp(e: PointerEvent) {
    if (e.pointerId !== id) return;
    if (mode === 'horizontal') {
      const dx = e.clientX - x0;
      const w = el.clientWidth || 1;
      const p = opt.getPage();
      let next = p;
      if (dx < -w * PAGER.switchRatio || vx < -PAGER.flickVelocity) next = p + 1;
      else if (dx > w * PAGER.switchRatio || vx > PAGER.flickVelocity) next = p - 1;
      next = Math.max(0, Math.min(opt.pageCount - 1, next));
      opt.onOffset(null);
      if (next !== p) opt.setPage(next);
      // 滑動結束時手指下方的按鈕不能被當成點擊
      blockClicks(150);
    }
    end();
  }

  function onAbort() {
    opt.onOffset(null);
    end();
  }

  el.addEventListener('pointerdown', onDown);
  return () => {
    el.removeEventListener('pointerdown', onDown);
    end();
  };
}
