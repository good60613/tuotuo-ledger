// 3.3 UI 風格：毛玻璃／簡約扁平／手帳紙本／像素復古／Liquid Glass。
// 風格與亮暗色（settings.theme）獨立，可任意組合。
// - 色票微調在 src/theme.ts 的 STYLE_PALETTE（切風格時 setPaletteStyle 即時重畫）
// - 形狀（圓角、邊框、陰影、按下回饋）在 src/styles/ui-*.css，全部以 html[data-style="…"] 開頭；glass 沒有任何覆蓋
import type { UiStyleId } from './data/types';
import { GLASS } from './config';
import { setPaletteStyle, previewTheme } from './theme';
import { applyMotionVars } from './motion';
import type { ThemeMode } from './theme';

export type { UiStyleId };

export const UI_STYLES: { id: UiStyleId; label: string; desc: string }[] = [
  { id: 'glass', label: '預設', desc: '半透明卡片，原本的樣子' },
  { id: 'flat', label: '簡約扁平', desc: '實心色塊，乾淨俐落' },
  { id: 'paper', label: '手帳紙本', desc: '米色紙感，像貼便條' },
  { id: 'pixel', label: '像素復古', desc: '粗框硬影，遊戲機感' },
  { id: 'liquid', label: 'Liquid Glass', desc: '通透高光，圓潤柔亮' },
];

export const DEFAULT_UI_STYLE: UiStyleId = 'glass';
const CACHE_KEY = 'tt-ui-style';

/** 是不是合法的風格 id */
export function isUiStyleId(v: unknown): v is UiStyleId {
  return typeof v === 'string' && UI_STYLES.some((s) => s.id === v);
}

/** 非法值一律退回 glass */
export function normalizeUiStyle(v: unknown): UiStyleId {
  return isUiStyleId(v) ? v : DEFAULT_UI_STYLE;
}

/** 設定裡的風格（缺值或不認得＝glass） */
export const styleOf = (settings: { uiStyle?: unknown } | undefined | null): UiStyleId => normalizeUiStyle(settings?.uiStyle);

/** 即時模糊：只有 Liquid Glass 打開（其他風格維持 config GLASS.liveBlur） */
export const liveBlurFor = (id: UiStyleId): boolean => id === 'liquid' || GLASS.liveBlur;

function paintStyle(id: UiStyleId) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.style = id;
  root.classList.toggle('glass-blur', liveBlurFor(id));
  setPaletteStyle(id); // 通知 theme 用新色票重畫
  applyMotionVars(id); // B2：動畫數值（--mo-*）跟著風格換
}

/** 套用風格（即時生效）並記到 localStorage（開機第一幕用）。非法值退回 glass */
export function applyUiStyle(id: unknown): UiStyleId {
  const s = normalizeUiStyle(id);
  paintStyle(s);
  try { localStorage.setItem(CACHE_KEY, s); } catch { /* 沒有 localStorage 就略過 */ }
  return s;
}

/** 開機第一個畫面前先套上次的風格（避免先閃一下毛玻璃）；沒有或讀不到＝glass */
export function applyCachedUiStyle(): UiStyleId {
  let v: unknown = null;
  try { v = localStorage.getItem(CACHE_KEY); } catch { /* 略過 */ }
  const s = normalizeUiStyle(v);
  paintStyle(s);
  return s;
}

// ---------------- 開發預覽：網址帶 ?style=pixel&theme=dark ----------------

export interface DevPreview { style?: UiStyleId; theme?: ThemeMode }

/** 讀網址參數（只認得合法值）。純函式，方便測試 */
export function parseDevPreview(search: string): DevPreview {
  const out: DevPreview = {};
  try {
    const q = new URLSearchParams(search);
    const st = q.get('style');
    if (isUiStyleId(st)) out.style = st;
    const th = q.get('theme');
    if (th === 'light' || th === 'dark' || th === 'system') out.theme = th;
  } catch { /* 略過 */ }
  return out;
}

let devLock: DevPreview = {};
/** 目前有沒有被網址鎖住（鎖住時，從設定同步風格／外觀的動作要略過，避免把預覽蓋掉） */
export const devPreviewLock = (): DevPreview => devLock;

/**
 * 開發預覽：開機時依網址直接套用風格／外觀，只套用、不存進設定也不寫快取。
 * 只在 dev 模式（import.meta.env.DEV）啟用；正式版呼叫端不會進來。
 */
export function applyDevPreview(search: string): DevPreview {
  const p = parseDevPreview(search);
  devLock = p;
  if (p.style) paintStyle(p.style);
  if (p.theme) previewTheme(p.theme);
  return p;
}
