import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';

/**
 * 從底部升起的選單；點背景關閉。
 * 一律畫在 App 最外層（不跟著頁面滑動），避免在換頁容器裡位置跑掉。
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  const host = document.querySelector('.app') ?? document.body;
  return createPortal(
    <div class="sheet-backdrop" data-no-swipe onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-label={title}>
        <div class="sheet-head">
          <span>{title}</span>
          <button class="icon-btn" onClick={onClose} aria-label="關閉">✕</button>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>,
    host,
  );
}
