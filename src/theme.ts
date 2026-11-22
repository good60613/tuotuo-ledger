// 顏色清單（主題）：全 app 的顏色只存在這個檔案。
// 三份色票：light 亮色（預設，藍綠清爽）、dark 暗色（金色夕陽）、warm 橘黃溫暖（備用，尚無切換介面）。
// applyTheme 會把選到的色票寫成 :root 的 CSS 變數（--bg、--card…），styles.css 與元件只用 var(--名稱)。
import type { ThemeMode, UiStyleId } from './data/types';

export type { ThemeMode };
export type ThemeName = 'light' | 'dark' | 'warm';

/** 顏色清單的名稱（每份色票都必須有全部這些） */
const KEYS = [
  // --- 基本 ---
  'bg', 'card', 'text', 'muted', 'faint', 'line', 'border-strong', 'field',
  'accent', 'on-accent', 'accent-soft', 'accent-fill', 'accent-dim', 'warn',
  // --- 收支／轉帳／報帳／預算 ---
  'expense', 'expense-soft', 'income', 'income-soft',
  'transfer', 'transfer-soft', 'transfer-line', 'transfer-line-soft',
  'reimb', 'reimb-soft', 'budget', 'budget-soft', 'on-color',
  'advance', 'advance-soft', 'owed', 'owed-soft',
  // --- 提示、標籤、按鍵 ---
  'notice-bg', 'notice-text', 'fill-soft', 'overlay-soft',
  'key', 'key-alt', 'key-press',
  // --- 深色浮條（提示條、底部操作列）---
  'inverse', 'on-inverse', 'inverse-accent', 'inverse-line',
  // --- 遮罩與陰影 ---
  'backdrop', 'shadow-xs', 'shadow-sm', 'shadow-md', 'shadow-lg',
  // --- 圖表 ---
  'chart-grid', 'chart-axis', 'chart-track', 'pin',
  'pal-1', 'pal-2', 'pal-3', 'pal-4', 'pal-5', 'pal-6',
  // --- 毛玻璃（2.1）：玻璃底／邊框／陰影／上緣高光、背景光暈兩團、發光色、淡底 ---
  'gbg', 'gbd', 'gsh', 'ghi', 'glow-a', 'glow-b', 'glow', 'chip', 'cap-owed', 'cap-owed-soft',
  // --- 分類顏色標籤（資料裡存的是 key，色碼在這裡）---
  'cat-food', 'cat-shopping', 'cat-fun', 'cat-transport', 'cat-living',
  'cat-study', 'cat-health', 'cat-digital', 'cat-other',
] as const;

export type TokenName = (typeof KEYS)[number];
export type Palette = Record<TokenName, string>;

/** 亮色：白底、天空藍與薄荷綠點綴 */
const light: Palette = {
  'cap-owed': '#B45A12', 'cap-owed-soft': '#f8e6d6',
  gbg: 'rgba(255,255,255,.55)', gbd: 'rgba(255,255,255,.9)', gsh: '0 8px 24px rgba(30,90,110,.14)',
  ghi: 'inset 0 1px 0 rgba(255,255,255,.95)', 'glow-a': '#9ED8F2', 'glow-b': '#A9EBD6',
  glow: 'rgba(15,120,176,.35)', chip: 'rgba(15,120,176,.12)',
  bg: '#f2f9fc', card: '#ffffff', text: '#1c2a33', muted: '#5f737d', faint: '#8a9aa3',
  line: '#d9e8ef', 'border-strong': '#b4c6cf', field: '#ffffff',
  accent: '#1a82bd', 'on-accent': '#ffffff', 'accent-soft': '#e4f3fa', 'accent-fill': '#cdeee3',
  'accent-dim': '#a9cfe4', warn: '#f59e0b',
  expense: '#d64545', 'expense-soft': '#fbe3e3', income: '#14996a', 'income-soft': '#d9f4e8',
  transfer: '#6b5bd6', 'transfer-soft': '#efedfb', 'transfer-line': '#b9b2ec', 'transfer-line-soft': '#cfc9f3',
  reimb: '#d98a00', 'reimb-soft': '#fff4de', budget: '#1a8fd6', 'budget-soft': '#e8f4fc', 'on-color': '#ffffff',
  advance: '#0e9aa7', 'advance-soft': '#dcf4f6', owed: '#c0398a', 'owed-soft': '#fbe4f2',
  'notice-bg': '#fff6e0', 'notice-text': '#8a5a00', 'fill-soft': '#e6eff3', 'overlay-soft': 'rgba(0,0,0,.12)',
  key: '#ffffff', 'key-alt': '#f4f9fb', 'key-press': '#e1edf2',
  inverse: '#23323b', 'on-inverse': '#ffffff', 'inverse-accent': '#ffd36b', 'inverse-line': 'rgba(255,255,255,.4)',
  backdrop: 'rgba(0,0,0,.35)', 'shadow-xs': 'rgba(0,0,0,.08)', 'shadow-sm': 'rgba(0,0,0,.1)',
  'shadow-md': 'rgba(0,0,0,.2)', 'shadow-lg': 'rgba(0,0,0,.25)',
  'chart-grid': '#e8f0f4', 'chart-axis': '#c3d0d7', 'chart-track': '#e4edf1', pin: '#f5a623',
  'pal-1': '#1a82bd', 'pal-2': '#e0663a', 'pal-3': '#14996a', 'pal-4': '#9b59d0', 'pal-5': '#d9a400', 'pal-6': '#8a94a3',
  'cat-food': '#f59e0b', 'cat-shopping': '#ec4899', 'cat-fun': '#8b5cf6', 'cat-transport': '#3b82f6', 'cat-living': '#10b981',
  'cat-study': '#6366f1', 'cat-health': '#ef4444', 'cat-digital': '#06b6d4', 'cat-other': '#9ca3af',
};

/** 暗色：深炭灰底，主色、框線帶柔和金色光 */
const dark: Palette = {
  'cap-owed': '#F0A968', 'cap-owed-soft': '#3a2b1c',
  gbg: 'rgba(255,255,255,.07)', gbd: 'rgba(231,184,102,.38)', gsh: '0 10px 28px rgba(0,0,0,.5)',
  ghi: 'inset 0 1px 0 rgba(255,225,170,.28)', 'glow-a': '#7A4A1E', 'glow-b': '#2B3350',
  glow: 'rgba(231,184,102,.45)', chip: 'rgba(231,184,102,.14)',
  bg: '#16171a', card: '#202125', text: '#efe9da', muted: '#a8a08c', faint: '#857e6d',
  line: '#3b372c', 'border-strong': '#5a5240', field: '#2a2a2e',
  accent: '#e3b95f', 'on-accent': '#1d1a12', 'accent-soft': '#2e2a1e', 'accent-fill': '#3d3520',
  'accent-dim': '#6e5f38', warn: '#f0a93a',
  expense: '#f08080', 'expense-soft': '#3a2326', income: '#5fd1a0', 'income-soft': '#1f3329',
  transfer: '#a99cf0', 'transfer-soft': '#2b2842', 'transfer-line': '#6f66b5', 'transfer-line-soft': '#4d4780',
  reimb: '#f0a93a', 'reimb-soft': '#38301c', budget: '#5ab6ee', 'budget-soft': '#1f2f3b', 'on-color': '#17160f',
  advance: '#4fd1dc', 'advance-soft': '#1b3236', owed: '#f08ac4', 'owed-soft': '#3b2233',
  'notice-bg': '#37301c', 'notice-text': '#f0cf85', 'fill-soft': '#2e2e32', 'overlay-soft': 'rgba(255,255,255,.14)',
  key: '#26272b', 'key-alt': '#2d2e32', 'key-press': '#3a3b40',
  inverse: '#2f2c22', 'on-inverse': '#f6eed7', 'inverse-accent': '#f0c872', 'inverse-line': 'rgba(240,200,114,.5)',
  backdrop: 'rgba(0,0,0,.6)', 'shadow-xs': 'rgba(0,0,0,.4)', 'shadow-sm': 'rgba(0,0,0,.45)',
  'shadow-md': 'rgba(0,0,0,.55)', 'shadow-lg': 'rgba(0,0,0,.65)',
  'chart-grid': '#2c2b26', 'chart-axis': '#524c3c', 'chart-track': '#2f2e2a', pin: '#f5c04a',
  'pal-1': '#e3b95f', 'pal-2': '#f08a62', 'pal-3': '#5fd1a0', 'pal-4': '#b98ae6', 'pal-5': '#5ab6ee', 'pal-6': '#9a9484',
  'cat-food': '#fbb740', 'cat-shopping': '#f472b6', 'cat-fun': '#a78bfa', 'cat-transport': '#60a5fa', 'cat-living': '#34d399',
  'cat-study': '#818cf8', 'cat-health': '#f87171', 'cat-digital': '#22d3ee', 'cat-other': '#b4b0a6',
};

/** 橘黃溫暖風：奶油白底、橘與金黃點綴（備用） */
const warm: Palette = {
  'cap-owed': '#B45A12', 'cap-owed-soft': '#f8e6d6',
  gbg: 'rgba(255,253,248,.6)', gbd: 'rgba(255,255,255,.9)', gsh: '0 8px 24px rgba(120,70,10,.14)',
  ghi: 'inset 0 1px 0 rgba(255,255,255,.95)', 'glow-a': '#FBD9A0', 'glow-b': '#FCE8C8',
  glow: 'rgba(217,115,13,.35)', chip: 'rgba(217,115,13,.12)',
  bg: '#fff8ec', card: '#fffdf8', text: '#3a2a14', muted: '#7d6648', faint: '#a8957a',
  line: '#f0e0c0', 'border-strong': '#d6c19a', field: '#fffdf8',
  accent: '#d9730d', 'on-accent': '#ffffff', 'accent-soft': '#fdeed6', 'accent-fill': '#fbe3b0',
  'accent-dim': '#eec9a0', warn: '#f0a020',
  expense: '#d1453b', 'expense-soft': '#fbe4df', income: '#2f9a5e', 'income-soft': '#e0f2d9',
  transfer: '#8a5bd0', 'transfer-soft': '#f3ecfb', 'transfer-line': '#c4aae8', 'transfer-line-soft': '#d9c8f1',
  reimb: '#c97a00', 'reimb-soft': '#ffefcc', budget: '#2a8fc0', 'budget-soft': '#e6f3f9', 'on-color': '#ffffff',
  advance: '#16929a', 'advance-soft': '#dcf1f0', owed: '#c2417a', 'owed-soft': '#fbe3ee',
  'notice-bg': '#fff1cf', 'notice-text': '#7a4f00', 'fill-soft': '#f6ead2', 'overlay-soft': 'rgba(0,0,0,.12)',
  key: '#fffdf8', 'key-alt': '#fbf3e3', 'key-press': '#f2e4c8',
  inverse: '#4a3417', 'on-inverse': '#fff8ec', 'inverse-accent': '#ffd36b', 'inverse-line': 'rgba(255,255,255,.4)',
  backdrop: 'rgba(40,20,0,.38)', 'shadow-xs': 'rgba(90,50,0,.1)', 'shadow-sm': 'rgba(90,50,0,.12)',
  'shadow-md': 'rgba(90,50,0,.2)', 'shadow-lg': 'rgba(90,50,0,.25)',
  'chart-grid': '#f3e8d0', 'chart-axis': '#d9c8a4', 'chart-track': '#f2e6cc', pin: '#f0a020',
  'pal-1': '#d9730d', 'pal-2': '#d1453b', 'pal-3': '#2f9a5e', 'pal-4': '#8a5bd0', 'pal-5': '#e0a800', 'pal-6': '#9a8f7d',
  'cat-food': '#f59e0b', 'cat-shopping': '#ec4899', 'cat-fun': '#8b5cf6', 'cat-transport': '#3b82f6', 'cat-living': '#10b981',
  'cat-study': '#6366f1', 'cat-health': '#ef4444', 'cat-digital': '#06b6d4', 'cat-other': '#a39a8a',
};

export const THEMES: Record<ThemeName, Palette> = { light, dark, warm };

/**
 * 3.3 風格色票微調：只列「和基底不一樣的 token」，paint() 時先套基底色票（THEMES）再蓋上這裡。
 * glass（毛玻璃＝現行外觀）是空的，所以完全沒有改動。亮暗色各一份，和 settings.theme 獨立組合。
 * 形狀（圓角、邊框、陰影）不在這裡，寫在 src/styles/ui-*.css（html[data-style="…"] 開頭）。
 */
export type StylePatch = Partial<Palette>;
export const STYLE_PALETTE: Record<UiStyleId, { light: StylePatch; dark: StylePatch }> = {
  glass: { light: {}, dark: {} },

  // 簡約扁平：冷灰白／炭黑底，全部實心；玻璃 token 改成「卡片色＋細線＋無陰影」，所以原本的 .glass 元素自動變扁平
  flat: {
    light: {
      bg: '#f4f5f7', card: '#ffffff', field: '#ffffff', line: '#e2e5ea', 'border-strong': '#c5cad2',
      'fill-soft': '#eceef2', key: '#ffffff', 'key-alt': '#f6f7f9', 'key-press': '#e4e7ec',
      accent: '#1670ad', 'accent-soft': '#e6f1f8', 'accent-fill': '#cfe6f3', 'accent-dim': '#a9c9de',
      gbg: '#ffffff', gbd: '#e2e5ea', gsh: '0 0 0 0 transparent', ghi: '0 0 0 0 transparent',
      'glow-a': '#f4f5f7', 'glow-b': '#f4f5f7', glow: 'rgba(22,112,173,.25)', chip: 'rgba(22,112,173,.10)',
      'shadow-xs': 'rgba(0,0,0,0)', 'shadow-sm': 'rgba(0,0,0,0)', 'shadow-md': 'rgba(0,0,0,.14)', 'shadow-lg': 'rgba(0,0,0,.18)',
      'chart-grid': '#e8ebef', 'chart-axis': '#c9ced6', 'chart-track': '#e8ebef',
    },
    dark: {
      bg: '#121316', card: '#1c1e22', field: '#24272c', line: '#2c2f35', 'border-strong': '#434850',
      text: '#eceef1', muted: '#a2a8b2', faint: '#7e848e',
      'fill-soft': '#262a30', key: '#1f2226', 'key-alt': '#262a30', 'key-press': '#33383f',
      gbg: '#1c1e22', gbd: '#2c2f35', gsh: '0 0 0 0 transparent', ghi: '0 0 0 0 transparent',
      'glow-a': '#121316', 'glow-b': '#121316', glow: 'rgba(227,185,95,.35)', chip: 'rgba(227,185,95,.14)',
      'shadow-xs': 'rgba(0,0,0,0)', 'shadow-sm': 'rgba(0,0,0,0)', 'shadow-md': 'rgba(0,0,0,.5)', 'shadow-lg': 'rgba(0,0,0,.6)',
      'chart-grid': '#25282d', 'chart-axis': '#4a4f58', 'chart-track': '#2a2d33',
      inverse: '#2a2d33', 'on-inverse': '#eceef1',
    },
  },

  // 手帳紙本：暖米白紙／深褐牛皮紙；墨綠當主色、赭紅當支出；邊框用虛線（ui-paper.css）
  paper: {
    light: {
      bg: '#f3ead6', card: '#fbf5e6', field: '#fffaf0', text: '#3b2a1a', muted: '#6f5a44', faint: '#98836a',
      line: '#dccdab', 'border-strong': '#b39b70',
      accent: '#24664f', 'on-accent': '#fff8ea', 'accent-soft': '#e2ead9', 'accent-fill': '#cddcc2', 'accent-dim': '#a3bb9e', warn: '#c27a10',
      expense: '#b03a2a', 'expense-soft': '#f6ddd2', income: '#3f7a1f', 'income-soft': '#e0ecc9',
      transfer: '#6a4c93', 'transfer-soft': '#ebe3f2', 'transfer-line': '#b5a0cf', 'transfer-line-soft': '#cdbfe0',
      reimb: '#b8690a', 'reimb-soft': '#f8e6bf', budget: '#2c6fa0', 'budget-soft': '#dde9f1', 'on-color': '#fff8ea',
      advance: '#1f7a7a', 'advance-soft': '#d6ebe6', owed: '#a8407a', 'owed-soft': '#f3dbe5',
      'notice-bg': '#f7e7b8', 'notice-text': '#6b4a0a', 'fill-soft': '#eadfc4', 'overlay-soft': 'rgba(60,40,10,.14)',
      key: '#fbf5e6', 'key-alt': '#f3ead5', 'key-press': '#e6d9b8',
      inverse: '#3b2a1a', 'on-inverse': '#fbf1dc', 'inverse-accent': '#f2c46b', 'inverse-line': 'rgba(255,240,210,.45)',
      backdrop: 'rgba(50,30,10,.4)', 'shadow-xs': 'rgba(80,55,20,.10)', 'shadow-sm': 'rgba(80,55,20,.12)',
      'shadow-md': 'rgba(80,55,20,.22)', 'shadow-lg': 'rgba(80,55,20,.28)',
      'chart-grid': '#e6d9bb', 'chart-axis': '#c9b88f', 'chart-track': '#eadfc4', pin: '#c27a10',
      'pal-1': '#24664f', 'pal-2': '#b8472f', 'pal-3': '#c99a2e', 'pal-4': '#6a4c93', 'pal-5': '#2c6fa0', 'pal-6': '#8c7b66',
      gbg: '#fbf5e6', gbd: '#b39b70', gsh: '1px 2px 4px rgba(80,55,20,.12)', ghi: '0 0 0 0 transparent',
      'glow-a': '#eadcb8', 'glow-b': '#e6d3a8', glow: 'rgba(36,102,79,.3)', chip: 'rgba(36,102,79,.12)',
      'cap-owed': '#a55a14', 'cap-owed-soft': '#f3e0c4',
      'cat-food': '#d98a1c', 'cat-shopping': '#c4457a', 'cat-fun': '#7a5ab8', 'cat-transport': '#3b76b8', 'cat-living': '#3f8f5a',
      'cat-study': '#4f56b0', 'cat-health': '#c7473c', 'cat-digital': '#2a9aa6', 'cat-other': '#9a8f7d',
    },
    dark: {
      bg: '#2a2018', card: '#35291f', field: '#3d3025', text: '#f1e4cb', muted: '#bda98a', faint: '#9a8769',
      line: '#4d3e2e', 'border-strong': '#6e5a41',
      accent: '#8fc9a4', 'on-accent': '#1b2a20', 'accent-soft': '#2c3a2e', 'accent-fill': '#3a4d3d', 'accent-dim': '#5d7a63', warn: '#f0b45a',
      expense: '#f08a78', 'expense-soft': '#4a2b26', income: '#a6d16a', 'income-soft': '#2f3a22',
      transfer: '#b8a0e0', 'transfer-soft': '#34304a', 'transfer-line': '#7a65a8', 'transfer-line-soft': '#574a7e',
      reimb: '#f0b45a', 'reimb-soft': '#47381d', budget: '#7fb6e0', 'budget-soft': '#26384a', 'on-color': '#1f1810',
      advance: '#6fd0c8', 'advance-soft': '#1f3a38', owed: '#eb8fbf', 'owed-soft': '#47283a',
      'notice-bg': '#463a1c', 'notice-text': '#f0d58a', 'fill-soft': '#413325', 'overlay-soft': 'rgba(255,235,200,.12)',
      key: '#3a2e22', 'key-alt': '#41342a', 'key-press': '#4d3f31',
      inverse: '#1f1812', 'on-inverse': '#f5e8cc', 'inverse-accent': '#f0c872', 'inverse-line': 'rgba(240,200,114,.45)',
      backdrop: 'rgba(10,6,2,.62)', 'shadow-xs': 'rgba(0,0,0,.35)', 'shadow-sm': 'rgba(0,0,0,.4)',
      'shadow-md': 'rgba(0,0,0,.5)', 'shadow-lg': 'rgba(0,0,0,.6)',
      'chart-grid': '#3e3226', 'chart-axis': '#6a5840', 'chart-track': '#44372a', pin: '#f0b45a',
      'pal-1': '#8fc9a4', 'pal-2': '#f0946a', 'pal-3': '#e6c05a', 'pal-4': '#b8a0e0', 'pal-5': '#7fb6e0', 'pal-6': '#a89878',
      gbg: '#35291f', gbd: '#6e5a41', gsh: '1px 2px 5px rgba(0,0,0,.4)', ghi: '0 0 0 0 transparent',
      'glow-a': '#4a3622', 'glow-b': '#3a2c1c', glow: 'rgba(143,201,164,.4)', chip: 'rgba(143,201,164,.14)',
      'cap-owed': '#f0a968', 'cap-owed-soft': '#47321f',
      'cat-food': '#f2b84a', 'cat-shopping': '#ee7fae', 'cat-fun': '#a78bfa', 'cat-transport': '#6aa8f0', 'cat-living': '#5ccf96',
      'cat-study': '#8a90ee', 'cat-health': '#f0786e', 'cat-digital': '#4cc9d6', 'cat-other': '#b8aa92',
    },
  },

  // 像素復古：亮＝奶油底＋鮮紅／藍／黃；暗＝深藍紫底＋亮黃／綠／粉。邊框與硬陰影用文字色（ui-pixel.css）
  pixel: {
    light: {
      bg: '#fff4d6', card: '#fffdf2', field: '#ffffff', text: '#1a1a2e', muted: '#4a4a68', faint: '#767691',
      line: '#d8c89a', 'border-strong': '#1a1a2e',
      accent: '#2a5bd7', 'on-accent': '#ffffff', 'accent-soft': '#dbe6ff', 'accent-fill': '#b9ccff', 'accent-dim': '#8fa8e8', warn: '#e08a00',
      expense: '#d11f2a', 'expense-soft': '#ffd9d6', income: '#12873a', 'income-soft': '#d3f5d9',
      transfer: '#7a2fd0', 'transfer-soft': '#e8dcff', 'transfer-line': '#a98be0', 'transfer-line-soft': '#c9b6ee',
      reimb: '#b86200', 'reimb-soft': '#ffe9b3', budget: '#1f6fd0', 'budget-soft': '#d6e6ff', 'on-color': '#ffffff',
      advance: '#008a92', 'advance-soft': '#c9f3f2', owed: '#c4237a', 'owed-soft': '#ffd6ec',
      'notice-bg': '#ffe27a', 'notice-text': '#4a3200', 'fill-soft': '#f3e4b5', 'overlay-soft': 'rgba(26,26,46,.14)',
      key: '#fffdf2', 'key-alt': '#ffefc2', 'key-press': '#ffd96a',
      inverse: '#1a1a2e', 'on-inverse': '#fff4d6', 'inverse-accent': '#ffd43b', 'inverse-line': 'rgba(255,244,214,.5)',
      backdrop: 'rgba(26,26,46,.55)', 'shadow-xs': 'rgba(26,26,46,0)', 'shadow-sm': 'rgba(26,26,46,0)',
      'shadow-md': 'rgba(26,26,46,.35)', 'shadow-lg': 'rgba(26,26,46,.45)',
      'chart-grid': '#e6d7a8', 'chart-axis': '#8a7c52', 'chart-track': '#eadba8', pin: '#ffb800',
      'pal-1': '#2a5bd7', 'pal-2': '#e0262d', 'pal-3': '#12873a', 'pal-4': '#7a2fd0', 'pal-5': '#f0a800', 'pal-6': '#6b6b86',
      gbg: '#fffdf2', gbd: '#1a1a2e', gsh: '0 0 0 0 transparent', ghi: '0 0 0 0 transparent',
      'glow-a': '#ffe3a0', 'glow-b': '#ffd0d6', glow: 'rgba(42,91,215,.4)', chip: 'rgba(42,91,215,.14)',
      'cap-owed': '#b85a00', 'cap-owed-soft': '#ffe0bd',
      'cat-food': '#ff9f00', 'cat-shopping': '#ff3d9a', 'cat-fun': '#8a3ffc', 'cat-transport': '#1f6feb', 'cat-living': '#12b24a',
      'cat-study': '#4b4bd8', 'cat-health': '#e0262d', 'cat-digital': '#00b8d9', 'cat-other': '#8a8aa3',
    },
    dark: {
      bg: '#161233', card: '#221c4a', field: '#2a2358', text: '#f4f0ff', muted: '#b7b0e0', faint: '#8e87bd',
      line: '#3a3270', 'border-strong': '#6a5fc0',
      accent: '#ffd93d', 'on-accent': '#1a1440', 'accent-soft': '#3a3512', 'accent-fill': '#554a14', 'accent-dim': '#8a7a28', warn: '#ffa94d',
      expense: '#ff5c6c', 'expense-soft': '#4a1f3a', income: '#4dff9e', 'income-soft': '#134a38',
      transfer: '#9c8cff', 'transfer-soft': '#2e2866', 'transfer-line': '#6f62d0', 'transfer-line-soft': '#4a3f9a',
      reimb: '#ffa94d', 'reimb-soft': '#4a3418', budget: '#5cc8ff', 'budget-soft': '#16405e', 'on-color': '#0e0b24',
      advance: '#3de0d0', 'advance-soft': '#124a4a', owed: '#ff8fd8', 'owed-soft': '#4a1f4a',
      'notice-bg': '#4a3d10', 'notice-text': '#ffe27a', 'fill-soft': '#2e2760', 'overlay-soft': 'rgba(244,240,255,.16)',
      key: '#2a2358', 'key-alt': '#322a68', 'key-press': '#413883',
      inverse: '#0b0820', 'on-inverse': '#f4f0ff', 'inverse-accent': '#ffd93d', 'inverse-line': 'rgba(244,240,255,.5)',
      backdrop: 'rgba(5,3,20,.7)', 'shadow-xs': 'rgba(0,0,0,0)', 'shadow-sm': 'rgba(0,0,0,0)',
      'shadow-md': 'rgba(0,0,0,.55)', 'shadow-lg': 'rgba(0,0,0,.65)',
      'chart-grid': '#2c2660', 'chart-axis': '#6f66c0', 'chart-track': '#2e2760', pin: '#ffd93d',
      'pal-1': '#ffd93d', 'pal-2': '#ff5c6c', 'pal-3': '#4dff9e', 'pal-4': '#9c8cff', 'pal-5': '#5cc8ff', 'pal-6': '#b7b0e0',
      gbg: '#221c4a', gbd: '#f4f0ff', gsh: '0 0 0 0 transparent', ghi: '0 0 0 0 transparent',
      'glow-a': '#2a2358', 'glow-b': '#3a1f5a', glow: 'rgba(255,217,61,.45)', chip: 'rgba(255,217,61,.16)',
      'cap-owed': '#ffa94d', 'cap-owed-soft': '#4a3418',
      'cat-food': '#ffb02e', 'cat-shopping': '#ff6fb5', 'cat-fun': '#b388ff', 'cat-transport': '#4da6ff', 'cat-living': '#4dff9e',
      'cat-study': '#8c9bff', 'cat-health': '#ff5c6c', 'cat-digital': '#3de0e0', 'cat-other': '#a8a3cc',
    },
  },

  // Liquid Glass（仿 iOS 26）：偏藍紫的冷色底、半透明材質、帶色光影；背景光暈更鮮明
  liquid: {
    light: {
      bg: '#e8f0fc', card: '#ffffff', field: '#ffffff', text: '#14213d', muted: '#55627a', faint: '#7f8ba2',
      line: '#d8e2f4', 'border-strong': '#b3c2de',
      accent: '#0b6fe6', 'on-accent': '#ffffff', 'accent-soft': '#e0edff', 'accent-fill': '#cbe0ff', 'accent-dim': '#a3c4f0',
      gbg: 'rgba(255,255,255,.40)', gbd: 'rgba(255,255,255,.75)', gsh: '0 10px 30px rgba(70,100,255,.20)',
      ghi: 'inset 0 1px 0 rgba(255,255,255,.95), inset 0 0 0 1px rgba(255,255,255,.35)',
      'glow-a': '#6ec6ff', 'glow-b': '#c58cff', glow: 'rgba(60,110,255,.40)', chip: 'rgba(11,111,230,.14)',
      'fill-soft': '#e3eaf7', 'key-alt': '#f3f7fd', 'key-press': '#dbe5f6',
    },
    dark: {
      bg: '#0b1020', card: '#1a2036', field: '#1f2640', text: '#eef2ff', muted: '#a3adc9', faint: '#7d88a8',
      line: '#2a3354', 'border-strong': '#44507a',
      accent: '#6ea8ff', 'on-accent': '#07122b', 'accent-soft': '#1c2c52', 'accent-fill': '#27407a', 'accent-dim': '#3e5fa5',
      expense: '#ff7a85', 'expense-soft': '#3a1f2c', income: '#4fe0aa', 'income-soft': '#143a34',
      transfer: '#b0a2ff', 'transfer-soft': '#2a2756', reimb: '#ffb54d', 'reimb-soft': '#3a2f1c',
      budget: '#62c4ff', 'budget-soft': '#16304a', 'on-color': '#08101f',
      advance: '#4fe0e8', 'advance-soft': '#143a40', owed: '#ff8fd0', 'owed-soft': '#3a1f3c',
      'notice-bg': '#3a3320', 'notice-text': '#ffd98a', 'fill-soft': '#252d4a', 'overlay-soft': 'rgba(255,255,255,.14)',
      key: '#1f2744', 'key-alt': '#252e50', 'key-press': '#313c66',
      inverse: '#2a3558', 'on-inverse': '#f1f4ff', 'inverse-accent': '#9cc2ff', 'inverse-line': 'rgba(160,190,255,.5)',
      backdrop: 'rgba(3,6,18,.62)',
      'chart-grid': '#1f2842', 'chart-axis': '#44507a', 'chart-track': '#242d4a', pin: '#ffd166',
      'pal-1': '#6ea8ff', 'pal-2': '#ff8a6a', 'pal-3': '#4fe0aa', 'pal-4': '#b98aff', 'pal-5': '#ffd166', 'pal-6': '#98a2c0',
      gbg: 'rgba(255,255,255,.08)', gbd: 'rgba(255,255,255,.24)', gsh: '0 10px 34px rgba(90,110,255,.30)',
      ghi: 'inset 0 1px 0 rgba(255,255,255,.42), inset 0 0 0 1px rgba(255,255,255,.08)',
      'glow-a': '#3b6dff', 'glow-b': '#a24dff', glow: 'rgba(110,168,255,.45)', chip: 'rgba(110,168,255,.18)',
      'cap-owed': '#ffb070', 'cap-owed-soft': '#3a2a1c',
    },
  },
};

/** 實際套用的色票＝基底（亮／暗／warm）＋風格微調（warm 沒有風格版本，借亮色那份） */
export function paletteFor(name: ThemeName, style: UiStyleId = 'glass'): Palette {
  const patch = (STYLE_PALETTE[style] ?? STYLE_PALETTE.glass)[name === 'dark' ? 'dark' : 'light'];
  return { ...THEMES[name], ...patch };
}

/** 設定裡的外觀（缺值＝亮色） */
export const themeOf = (settings: { theme?: ThemeMode } | undefined | null): ThemeMode => settings?.theme ?? 'light';

export const THEME_LABEL: Record<ThemeMode, string> = { light: '亮色', dark: '暗色', system: '跟隨系統' };

const DARK_QUERY = '(prefers-color-scheme: dark)';
const CACHE_KEY = 'tt-theme-mode';

/** 實際要用哪份色票（system 依手機目前亮暗） */
export function resolveTheme(mode: ThemeMode): ThemeName {
  if (mode === 'dark') return 'dark';
  if (mode === 'system') {
    return typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
  }
  return 'light';
}

let currentMode: ThemeMode = 'light';
let currentStyle: UiStyleId = 'glass';
let mq: MediaQueryList | null = null;

function paint(name: ThemeName) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const p = paletteFor(name, currentStyle);
  for (const k of KEYS) root.style.setProperty('--' + k, p[k]);
  root.dataset.theme = name;
  root.style.colorScheme = name === 'dark' ? 'dark' : 'light';
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', p.bg);
}

function onSystemChange() {
  if (currentMode === 'system') paint(resolveTheme('system'));
}

/** 把外觀設定套到畫面（CSS 變數＋手機狀態列顏色）。mode='system' 會隨系統亮暗即時切換 */
export function applyTheme(mode: ThemeMode) {
  currentMode = mode;
  paint(resolveTheme(mode));
  try { localStorage.setItem(CACHE_KEY, mode); } catch { /* 沒有 localStorage 就略過 */ }
  if (!mq && typeof matchMedia === 'function') {
    mq = matchMedia(DARK_QUERY);
    mq.addEventListener?.('change', onSystemChange);
  }
}

/** 預覽用：只套用外觀、不寫進 localStorage 快取（dev 網址 ?theme=dark 用） */
export function previewTheme(mode: ThemeMode) {
  currentMode = mode;
  paint(resolveTheme(mode));
}

/** 3.3 換風格色票並即時重畫（由 src/uiStyle.ts 呼叫；不用重開 App） */
export function setPaletteStyle(style: UiStyleId) {
  currentStyle = style;
  paint(resolveTheme(currentMode));
}

/** 開機第一個畫面用：先套上次存的外觀（避免暗色使用者先閃一下白），沒有就用亮色 */
export function applyCachedTheme() {
  let m: ThemeMode = 'light';
  try {
    const v = localStorage.getItem(CACHE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') m = v;
  } catch { /* 略過 */ }
  applyTheme(m);
}
