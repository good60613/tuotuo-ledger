// 提示膠囊（2.3）：浮在畫面上的圓角膠囊，底色是主題色的淺色版（亮色藍、暗色金）。
// 左：分類圖示；中：「已記 醫療 −$450」；右：〔復原〕。底部細線從滿到空＝還剩多久可以復原。
// 彈簧式滑入；TOAST_MS 後淡出往下滑走；手指往下滑也可以滑掉。
// 2.5：記完一筆的提示條右邊改成〔長按刪除〕：按住 HOLD_DELETE_MS 才刪（按鈕上進度條慢慢填滿，中途放手＝取消）；
// 手指按在提示條上時不會自動消失。
import { useEffect, useRef, useState } from 'preact/hooks';
import { dismissToast, hideToast, pauseToast, resumeToast, type Toast } from '../store';
import { Icon } from './Icon';
import { TOAST_MS, TOAST_SWIPE_PX, HOLD_DELETE_MS, GESTURE } from '../config';
import { vibrate } from '../gestures/haptics';

export function ToastHost({ toast, lift }: { toast: Toast | null; lift: boolean }) {
  if (!toast) return null;
  return <ToastView key={toast.id} toast={toast} lift={lift} />;
}

function ToastView({ toast, lift }: { toast: Toast; lift: boolean }) {
  const [dy, setDy] = useState(0);
  const drag = useRef<{ y0: number; id: number; moved: boolean } | null>(null);
  const r = toast.rich;
  const [held, setHeld] = useState(false);

  const down = (e: PointerEvent) => {
    drag.current = { y0: e.clientY, id: e.pointerId, moved: false };
    pauseToast(toast.id);
    setHeld(true);
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const delta = e.clientY - d.y0;
    if (!d.moved && Math.abs(delta) > 6) {
      d.moved = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    if (d.moved) setDy(Math.max(0, delta));
  };
  const up = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setHeld(false);
    resumeToast(toast.id);
    if (!d || d.id !== e.pointerId) return;
    if (d.moved && e.clientY - d.y0 >= TOAST_SWIPE_PX) dismissToast(toast.id);
    setDy(0);
  };

  return (
    <div
      class={`toast-capsule${lift ? ' lift' : ''}${toast.leaving ? ' leaving' : ''}${dy > 0 ? ' dragging' : ''}${held ? ' held' : ''}`}
      role="status"
      style={dy > 0 ? { transform: `translateY(${dy}px)`, opacity: Math.max(0.3, 1 - dy / 120) } : undefined}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      {r && (
        <span class="toast-icon" style={r.bg ? { background: r.bg, color: r.fg } : undefined}>
          <Icon name={r.icon} size={18} />
        </span>
      )}
      <span class="toast-text">
        {r ? (
          <>
            {r.verb} <span class="toast-title">{r.title}</span> <span class={`toast-amt ${r.cls}`}>{r.amt}</span>
          </>
        ) : (
          toast.text
        )}
      </span>
      {toast.undo && (
        <button
          class="toast-undo"
          disabled={toast.leaving}
          onClick={() => {
            const u = toast.undo;
            hideToast();
            u?.();
          }}
        >
          復原
        </button>
      )}
      {toast.hold && <HoldButton run={toast.hold} disabled={!!toast.leaving} />}
      {(toast.undo || toast.hold) && <span class="toast-timer" style={{ animationDuration: `${TOAST_MS}ms` }} />}
    </div>
  );
}


/** 〔長按刪除〕：按住 HOLD_DELETE_MS 才執行；按鈕底色從左往右填滿；中途放手、手指滑開都取消 */
function HoldButton({ run, disabled }: { run: () => void; disabled: boolean }) {
  // 按住期間 holding＝true：進度條用 CSS 動畫填滿 HOLD_DELETE_MS；真正執行靠計時器（不靠畫面更新，較穩）
  const [holding, setHolding] = useState(false);
  const st = useRef<{ timer: ReturnType<typeof setTimeout>; x0: number; y0: number; id: number } | null>(null);
  const stop = () => {
    if (st.current) clearTimeout(st.current.timer);
    st.current = null;
    setHolding(false);
  };
  useEffect(() => stop, []);
  const down = (e: PointerEvent) => {
    if (disabled || st.current) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const timer = setTimeout(() => {
      st.current = null;
      vibrate(GESTURE.liftVibrateMs);
      hideToast();
      run();
    }, HOLD_DELETE_MS);
    st.current = { timer, x0: e.clientX, y0: e.clientY, id: e.pointerId };
    setHolding(true);
  };
  const move = (e: PointerEvent) => {
    const s = st.current;
    if (s && s.id === e.pointerId && Math.hypot(e.clientX - s.x0, e.clientY - s.y0) > GESTURE.moveTolerancePx * 2) stop();
  };
  return (
    <button
      class={`toast-hold${holding ? ' holding' : ''}`}
      disabled={disabled}
      style={{ '--hold-ms': `${HOLD_DELETE_MS}ms` } as Record<string, string>}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span class="toast-hold-fill" />
      <span class="toast-hold-label">長按刪除</span>
    </button>
  );
}