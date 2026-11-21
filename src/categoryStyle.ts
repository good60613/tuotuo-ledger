// 分類與帳戶的圖示、顏色（第三批第 4 項；2.1 起圖示改為圖示名稱，SVG 在 src/icons.ts）。
import { ACCOUNT_KIND_ICON, CATEGORY_ICON_GROUPS, isIconName } from './icons';
import type { Account } from './data/types';

/** 分類圖示選單：依圖示清單的分組顯示 */
export const ICON_GROUPS = CATEGORY_ICON_GROUPS;

/** 新增分類時預設選的圖示（選單第一個） */
export const DEFAULT_NEW_ICON = ICON_GROUPS[0].icons[0];

/** 舊資料沒有圖示時補上的圖示（問號，明顯看得出「還沒設定」，不會誤會成某個分類） */
export const MISSING_ICON = 'circle-help';

/** 帳戶的圖示：有選就用選的，沒有（或不是圖示名稱）就依種類給預設 */
export function accountIconOf(a: Pick<Account, 'kind' | 'icon'>): string {
  return isIconName(a.icon) ? a.icon : ACCOUNT_KIND_ICON[a.kind];
}

/** 帳戶補上圖示欄位（缺值或不認得＝依種類預設；顯示方式只能是圖示或徽章） */
export function withAccountIcon<T extends Account>(a: T): T {
  const icon = accountIconOf(a);
  const iconStyle = accountIconStyleOf(a);
  return icon === a.icon && iconStyle === a.iconStyle ? a : { ...a, icon, iconStyle };
}

/** 帳戶顯示方式：'icon' 圖示（預設）或 'badge' 縮寫徽章（名稱第一個字） */
export function accountIconStyleOf(a: Pick<Account, 'iconStyle'>): 'icon' | 'badge' {
  return a.iconStyle === 'badge' ? 'badge' : 'icon';
}

/** 顏色標籤：只是視覺標記，不是大類，不影響統計與分類結構 */
export const CATEGORY_COLORS = [
  { key: 'food', label: '飲食' },
  { key: 'shopping', label: '消費' },
  { key: 'fun', label: '娛樂' },
  { key: 'transport', label: '交通' },
  { key: 'living', label: '生活' },
  { key: 'study', label: '學習' },
  { key: 'health', label: '健康' },
  { key: 'digital', label: '數位' },
  { key: 'other', label: '其他' },
] as const;

export type CategoryColorKey = (typeof CATEGORY_COLORS)[number]['key'];

/** 沒有顏色的分類一律當「其他」（灰色） */
export const DEFAULT_COLOR: CategoryColorKey = 'other';

export function isColorKey(v: unknown): v is CategoryColorKey {
  return CATEGORY_COLORS.some((c) => c.key === v);
}

/** 顏色（CSS 變數，實際色碼在 theme.ts，亮暗色各一組；顯示在圖示底色） */
export function colorOf(key: string | undefined): string {
  return `var(--cat-${(CATEGORY_COLORS.find((c) => c.key === key) ?? CATEGORY_COLORS[CATEGORY_COLORS.length - 1]).key})`;
}
