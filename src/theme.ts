// 顏色清單（主題）：全 app 的顏色只存在這個檔案。
// 三份色票：light 亮色（預設，藍綠清爽）、dark 暗色（金色夕陽）、warm 橘黃溫暖（備用，尚無切換介面）。
// applyTheme 會把選到的色票寫成 :root 的 CSS 變數（--bg、--card…），styles.css 與元件只用 var(--名稱)。
import type { ThemeMode } from './data/types';

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
  // --- 分類顏色標籤（資料裡存的是 key，色碼在這裡）---
  'cat-food', 'cat-shopping', 'cat-fun', 'cat-transport', 'cat-living',
  'cat-study', 'cat-health', 'cat-digital', 'cat-other',
] as const;

export type TokenName = (typeof KEYS)[number];
export type Palette = Record<TokenName, string>;

/** 亮色：白底、天空藍與薄荷綠點綴 */
const light: Palette = {
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
let mq: MediaQueryList | null = null;

function paint(name: ThemeName) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const p = THEMES[name];
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

/** 開機第一個畫面用：先套上次存的外觀（避免暗色使用者先閃一下白），沒有就用亮色 */
export function applyCachedTheme() {
  let m: ThemeMode = 'light';
  try {
    const v = localStorage.getItem(CACHE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') m = v;
  } catch { /* 略過 */ }
  applyTheme(m);
}
