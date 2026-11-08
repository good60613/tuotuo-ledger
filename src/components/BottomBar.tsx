// 共用底部操作列（第五批）：貼在頁面最底端、導覽列正上方，不跟著內容捲動。
// 做法：放在各頁自己的捲動區「最後面」，用 position: sticky; bottom: 0 黏住，
// 所以它屬於自己那一頁，換頁時跟著該頁滑走，不會殘留在別頁。
import type { ComponentChildren } from 'preact';

export function BottomBar({ children, class: cls }: { children: ComponentChildren; class?: string }) {
  return <div class={`bottom-bar${cls ? ' ' + cls : ''}`}>{children}</div>;
}
