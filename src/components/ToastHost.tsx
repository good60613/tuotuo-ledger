// 提示膠囊（2.3）：浮在畫面上的圓角膠囊，底色是主題色的淺色版（亮色藍、暗色金）。
// 左：分類圖示；中：「已記 醫療 −$450」；右：〔復原〕。底部細線從滿到空＝還剩多久可以復原。
// 彈簧式滑入；TOAST_MS 後淡出往下滑走；手指往下滑也可以滑掉。
import { useRef, useState } from 'preact/hooks';
import { dismissToast, hideToast, type Toast } from '../store';
import { Icon } from './Icon';
import { TOAST_MS, TOAST_SWIPE_PX } from '../config';

export function ToastHost({ toast, lift }: { toast: Toast | null; lift: boolean }) {
  if (!toast) return null;
  return <ToastView key={toast.id} toast={toast} lift={lift} />;
}

function ToastView({ toast, lift }: { toast: Toast; lift: boolean }) {
  const [dy, setDy] = useState(0);
  const drag = useRef<{ y0: number; id: number; moved: boolean } | null>(null);
  const r = toast.rich;

  const down = (e: PointerEvent) => {
    drag.current = { y0: e.clientY, id: e.pointerId, moved: false };
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
    if (!d || d.id !== e.pointerId) return;
    if (d.moved && e.clientY - d.y0 >= TOAST_SWIPE_PX) dismissToast(toast.id);
    setDy(0);
  };

  return (
    <div
      class={`toast-capsule${lift ? ' lift' : ''}${toast.leaving ? ' leaving' : ''}${dy > 0 ? ' dragging' : ''}`}
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
      {toast.undo && <span class="toast-timer" style={{ animationDuration: `${TOAST_MS}ms` }} />}
    </div>
  );
}
