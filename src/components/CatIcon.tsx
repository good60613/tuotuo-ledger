// 分類圖示：底色＝分類的顏色標籤（淡色），只是視覺標記。
import { colorOf } from '../categoryStyle';

export function catBg(color: string | undefined): string {
  return `color-mix(in srgb, ${colorOf(color)} 25%, transparent)`; // 變淡色底
}

export function CatIcon({ icon, color, class: cls = 'cat-icon' }: { icon: string; color?: string; class?: string }) {
  return <span class={cls} style={{ background: catBg(color) }}>{icon}</span>;
}
