// 分類的圖示與顏色（第三批第 4 項）。
// 圖示目前暫用 emoji，之後換成開源圖示庫時，只需要改這個檔案。

/** 圖示選單：依小標題分段，四個一排 */
export const ICON_GROUPS: { title: string; icons: string[] }[] = [
  { title: '飲食', icons: ['🍽️', '🍦', '☕', '🍜', '🍞', '🍪', '🍕', '🍔', '🍸', '🧋', '🍱', '🍣', '🍰', '🍺', '🍷', '🥤', '🍎', '🍳', '🥗', '🍙'] },
  { title: '購物', icons: ['🛍️', '🛒', '👕', '👗', '👟', '👜', '💄', '💍', '🎁', '🧴', '🕶️', '⌚', '📦', '🏪'] },
  { title: '娛樂', icons: ['🎮', '🎵', '🎧', '🎬', '🎤', '🎨', '🎹', '📷', '🎟️', '🎲', '🎳', '🎢', '🏖️', '👻', '🎪'] },
  { title: '交通', icons: ['🚕', '🚇', '🚗', '🚌', '🅿️', '✈️', '⛽', '🔌', '🚲', '🛵', '🚄', '🚢', '🚦', '🚀', '🛣️'] },
  { title: '居家生活', icons: ['🏠', '💡', '💧', '🔥', '📞', '🛏️', '🛁', '🧺', '🧹', '🔑', '🗑️', '♻️', '🐾', '🌳', '🌸', '👶', '✂️'] },
  { title: '學習', icons: ['📚', '✏️', '🎓', '📖', '🔬', '🔭', '🖌️', '📝', '🗺️', '🎒'] },
  { title: '健康', icons: ['💊', '🩹', '🏥', '💉', '🦷', '🌡️', '🩺', '🧘', '💆'] },
  { title: '數位', icons: ['📱', '💻', '🖥️', '☁️', '🤖', '📹', '📺', '🎙️', '📧', '🖨️'] },
  { title: '金錢', icons: ['💰', '💵', '💳', '👛', '🏦', '📈', '📊', '🐷', '🧾', '🤝', '💸', '🪙', '💴', '💶', '💷', '🧮', '🏷️'] },
  { title: '運動', icons: ['🏀', '🏐', '🎾', '🏓', '⚽', '⚾', '🏈', '🏆', '🚴', '🏋️', '🏊', '🎯', '🥾'] },
  { title: '其他', icons: ['❤️', '💔', '😊', '💬', '🧭', '⚡', '⭐', '❓'] },
];

/** 新增分類時預設選的圖示（選單第一個） */
export const DEFAULT_NEW_ICON = ICON_GROUPS[0].icons[0];

/** 舊資料沒有圖示時補上的圖示（問號，明顯看得出「還沒設定」，不會誤會成某個分類） */
export const MISSING_ICON = '❓';

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
