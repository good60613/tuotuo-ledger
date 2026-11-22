// 3.3 B3 開啟動畫：index.html 內嵌的 #splash（拖拖硬幣落下→彈跳→翻轉）由這裡決定何時淡出並移除。
// 規則：資料讀好（store.ready）且最短時間（約 900ms；系統減少動態時 300ms）已到 → 淡出 250ms 後從 DOM 移除；
// 整體最長 3 秒保險一定移除。只在冷啟動（頁面載入）跑一次，App 從背景回前景不會重播（頁面沒有重新載入）。
// dev 預覽：網址帶 ?splash=hold 時不自動移除（方便截圖檢查）。
import { getState, subscribeState } from './store';
import { prefersReducedMotion } from './motion';

export const SPLASH = {
  /** 動畫至少顯示多久（毫秒），讓落下＋翻轉播完 */
  minMs: 900,
  /** 系統開了「減少動態效果」時的最短顯示 */
  minReducedMs: 300,
  /** 整體最長（保險，避免卡死） */
  maxMs: 3000,
  /** 淡出時間（要和 index.html 內 #splash 的 transition 一致） */
  fadeMs: 250,
} as const;

/** 算出什麼時候可以開始淡出（純函式，方便測試）：資料好了且最短時間到；超過最長時間一律開始 */
export function splashShouldHide(elapsedMs: number, ready: boolean, reduced: boolean): boolean {
  if (elapsedMs >= SPLASH.maxMs) return true;
  return ready && elapsedMs >= (reduced ? SPLASH.minReducedMs : SPLASH.minMs);
}

export function runSplash() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('splash');
  if (!el) return;
  const hold = import.meta.env.DEV && new URLSearchParams(location.search).get('splash') === 'hold';
  if (hold) return; // dev 預覽：留在畫面上
  const t0 = (window as unknown as { __splashT0?: number }).__splashT0 ?? performance.now();
  const reduced = prefersReducedMotion();
  let gone = false;
  const hide = () => {
    if (gone) return;
    gone = true;
    el.classList.add('sp-out');
    setTimeout(() => el.remove(), SPLASH.fadeMs + 80);
  };
  const check = () => {
    if (splashShouldHide(performance.now() - t0, getState().ready, reduced)) hide();
  };
  const wait = (ms: number) => setTimeout(check, Math.max(0, t0 + ms - performance.now()) + 5);
  wait(reduced ? SPLASH.minReducedMs : SPLASH.minMs);
  setTimeout(hide, Math.max(0, t0 + SPLASH.maxMs - performance.now())); // 保險：最長 3 秒一定移除
  subscribeState(() => {
    if (!gone && getState().ready) check();
  });
  check();
}
