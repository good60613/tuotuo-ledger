// 圖示元件（2.1）：全 App 的圖示都走這裡。
// name 是圖示名稱（見 src/icons.ts）；舊資料留下、對不到的 emoji 照原樣顯示成文字。
import { ICON_SVG } from '../icons';
import { ICON } from '../config';

export function Icon({ name, size = ICON.size, class: cls }: { name: string; size?: number; class?: string }) {
  const inner = ICON_SVG[name];
  if (inner === undefined) {
    return (
      <span class={`icon-emoji${cls ? ' ' + cls : ''}`} style={{ fontSize: `${Math.round(size * 0.85)}px`, lineHeight: 1 }} aria-hidden="true">
        {name}
      </span>
    );
  }
  return (
    <svg
      class={`icon${cls ? ' ' + cls : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={ICON.stroke}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
