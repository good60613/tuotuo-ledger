// 產生 src/icons.ts：只從 lucide-static 取「圖示清單」用到的圖示，加上自繪圖示。
// 用法：node tools/gen-icons.mjs
// 換圖示庫或增減圖示：改「工單/2.1-圖示清單.json」或下面的 EXTRA，再跑一次。不要手改 src/icons.ts。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const list = JSON.parse(readFileSync(join(root, '工單/2.1-圖示清單.json'), 'utf8'));
const lucideDir = join(root, 'node_modules/lucide-static/icons');

/** 清單以外、介面要用的圖示（箭頭、勾、編輯…），施工時需要再加 */
const EXTRA = [
  'chevron-left', 'chevron-right', 'chevron-down', 'chevron-up', 'check', 'pencil', 'grip-vertical',
  'arrow-left-right', 'rotate-ccw', 'download', 'upload', 'circle-alert', 'info', 'clock', 'repeat',
  'archive', 'shield', 'eye-off', 'search', 'minus', 'arrow-left', 'calendar-clock', 'history',
];

const names = new Set([
  ...Object.values(list.accountTypeDefaults),
  ...list.accountExtraIcons,
  ...Object.values(list.capsuleIcons),
  ...Object.values(list.uiIcons),
  ...list.categoryGroups.flatMap((g) => g.icons.map((i) => i.name)),
  ...EXTRA,
]);

const svg = {};
const missing = [];
for (const n of [...names].sort()) {
  if (list.custom[n]) { svg[n] = list.custom[n]; continue; }
  const f = join(lucideDir, `${n}.svg`);
  if (!existsSync(f)) { missing.push(n); continue; }
  const txt = readFileSync(f, 'utf8');
  const inner = txt.slice(txt.indexOf('>', txt.indexOf('<svg')) + 1, txt.lastIndexOf('</svg>'));
  svg[n] = inner.replace(/\s*\n\s*/g, '').replace(/\s+\/>/g, '/>').trim();
}
if (missing.length) {
  console.error('lucide 找不到這些圖示：', missing.join(', '));
  process.exit(1);
}

const groups = list.categoryGroups.map((g) => ({ title: g.title, icons: g.icons.map((i) => i.name) }));
const kindDefault = {
  bank: list.accountTypeDefaults['銀行/郵局'],
  easycard: list.accountTypeDefaults['悠遊卡'],
  ewallet: list.accountTypeDefaults['電子錢包'],
  invest: list.accountTypeDefaults['投資'],
  saving: list.accountTypeDefaults['儲蓄'],
  other: list.accountTypeDefaults['其他'],
};

const out = `// 圖示（2.1）：由 tools/gen-icons.mjs 自動產生，請不要手改。
// 來源：lucide-static ${list.lucide.version}（ISC 授權，見 LICENSE-lucide.txt）＋自繪 ${Object.keys(list.custom).length} 顆。
// 資料裡只存圖示名稱字串；換圖示庫只要重新產生這個檔。
// 共 ${Object.keys(svg).length} 顆。

/** 圖示名稱 → SVG 內層標記（24 格、線條、不填色） */
export const ICON_SVG: Record<string, string> = ${JSON.stringify(svg, null, 0).replace(/","/g, '",\n  "').replace(/^\{/, '{\n  ').replace(/\}$/, ',\n}')};

/** 分類圖示選單：依分組顯示 */
export const CATEGORY_ICON_GROUPS: { title: string; icons: string[] }[] = ${JSON.stringify(groups)};

/** 帳戶圖示選單 */
export const ACCOUNT_ICONS: string[] = ${JSON.stringify(list.accountExtraIcons)};

/** 帳戶沒選圖示時，依種類給的預設 */
export const ACCOUNT_KIND_ICON = ${JSON.stringify(kindDefault)} as const;

/** 拖拖膠囊的小圖示 */
export const CAPSULE_ICONS = ${JSON.stringify(list.capsuleIcons)} as const;

/** 介面圖示（導航列、關閉、刪除…） */
export const UI_ICONS = ${JSON.stringify(list.uiIcons)} as const;

/** 自繪圖示的中文名稱（選單上可顯示） */
export const ICON_LABELS: Record<string, string> = ${JSON.stringify(Object.fromEntries(list.categoryGroups.flatMap((g) => g.icons.filter((i) => i.label).map((i) => [i.name, i.label]))))};

/** 是不是圖示名稱（不是的話多半是舊資料留下的 emoji） */
export function isIconName(v: unknown): v is string {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ICON_SVG, v);
}
`;
writeFileSync(join(root, 'src/icons.ts'), out);
console.log(`已產生 src/icons.ts，共 ${Object.keys(svg).length} 顆`);
