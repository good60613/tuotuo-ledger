// 分類圖示：底色＝分類的顏色標籤（淡色），只是視覺標記。圖示走 <Icon>（舊 emoji 照原樣顯示）。
import { colorOf } from '../categoryStyle';
import { Icon } from './Icon';

export function catBg(color: string | undefined): string {
  return `color-mix(in srgb, ${colorOf(color)} 25%, transparent)`; // 變淡色底
}

export function CatIcon({ icon, color, class: cls = 'cat-icon', size }: { icon: string; color?: string; class?: string; size?: number }) {
  return (
    <span class={cls} style={{ background: catBg(color), color: colorOf(color) }}>
      <Icon name={icon} size={size} />
    </span>
  );
}
