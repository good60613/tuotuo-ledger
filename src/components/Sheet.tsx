import { Icon } from './Icon';
import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useRef } from 'preact/hooks';
import { useBackLayer } from '../backNav';
import { useGhostOut } from '../motion';

/**
 * 從底部升起的選單；點背景關閉。
 * 一律畫在 App 最外層（不跟著頁面滑動），避免在換頁容器裡位置跑掉。
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  // 按返回鍵先關掉這個選單
  useBackLayer(true, onClose);
  // 關閉（卸載）時做離場殘影：背景淡出、面板下滑
  const ref = useRef<HTMLDivElement>(null);
  useGhostOut(ref, 'sheet');
  const host = document.querySelector('.app') ?? document.body;
  return createPortal(
    <div class="sheet-backdrop" data-no-swipe ref={ref} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-label={title}>
        <div class="sheet-head">
          <span>{title}</span>
          <button class="icon-btn" onClick={onClose} aria-label="關閉"><Icon name="x" /></button>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>,
    host,
  );
}
