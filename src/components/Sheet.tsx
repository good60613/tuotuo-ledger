import type { ComponentChildren } from 'preact';

/** 從底部升起的選單；點背景關閉 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  return (
    <div class="sheet-backdrop" data-no-swipe onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-label={title}>
        <div class="sheet-head">
          <span>{title}</span>
          <button class="icon-btn" onClick={onClose} aria-label="關閉">✕</button>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}
