import { render } from 'preact';
import { App } from './app';
import { initStore, getState, subscribeState } from './store';
import { installClickGuard } from './gestures/guard';
import { installNativeBackButton, navFromNative } from './backNav';
import { installWidgetSync } from './widget';
import './styles.css';
// 3.3 UI 風格樣式（全部 html[data-style="…"] 開頭；毛玻璃＝現行外觀，沒有覆蓋檔）
import './styles/ui-flat.css';
import './styles/ui-paper.css';
import './styles/ui-pixel.css';
import './styles/ui-liquid.css';
import { BOTTOM_BAR, TIMELINE, GLASS, HOME, DRAG_FX, TOAST_IN_MS, TOAST_EXIT_MS } from './config';
import { applyCachedTheme } from './theme';
import { applyCachedUiStyle, applyDevPreview } from './uiStyle';

// 第一個畫面前先套顏色（上次存的外觀，沒有就亮色），讀到設定後由 App 再套正確模式
applyCachedTheme();
// 3.3 風格也先套上次存的（避免先閃一下毛玻璃）；同時依風格決定要不要開即時模糊（只有 Liquid Glass 開）
applyCachedUiStyle();
// 開發預覽：網址帶 ?style=pixel&theme=dark 直接套用（只套用、不存進設定；正式版不啟用）
if (import.meta.env.DEV) applyDevPreview(location.search);
// 底部操作列、導覽列尺寸從設定檔套到畫面（CSS 變數）
document.documentElement.style.setProperty('--nav-h', BOTTOM_BAR.navHeightPx + 'px');
document.documentElement.style.setProperty('--toast-in-ms', TOAST_IN_MS + 'ms');
document.documentElement.style.setProperty('--toast-out-ms', TOAST_EXIT_MS + 'ms');
document.documentElement.style.setProperty('--bar-h', BOTTOM_BAR.heightPx + 'px');
document.documentElement.style.setProperty('--bar-gap', BOTTOM_BAR.gapPx + 'px');
{
  const st = document.documentElement.style;
  st.setProperty('--fx-lift', String(DRAG_FX.liftScale));
  st.setProperty('--fx-tilt', DRAG_FX.tiltDeg + 'deg');
  st.setProperty('--fx-lift-ms', DRAG_FX.liftMs + 'ms');
  // glass-blur（即時模糊）由 src/uiStyle.ts 依風格切換（config GLASS.liveBlur 仍是毛玻璃等風格的預設）
  st.setProperty('--fx-shadow', DRAG_FX.shadowPx + 'px');
  st.setProperty('--fx-glow', DRAG_FX.glowPx + 'px');
  st.setProperty('--fx-hover-glow', DRAG_FX.hoverGlowPx + 'px');
  st.setProperty('--fx-drop-ms', DRAG_FX.dropMs + 'ms');
  st.setProperty('--fx-hover-ms', DRAG_FX.hoverMs + 'ms');
  st.setProperty('--nav-gap', BOTTOM_BAR.navInsetPx + 'px');
  st.setProperty('--home-gap', HOME.gapPx + 'px');
  st.setProperty('--home-card-h', HOME.cardHeightPx + 'px');
  st.setProperty('--home-ball', HOME.ballPx + 'px');
  st.setProperty('--glass-blur', GLASS.blurPx + 'px');
  st.setProperty('--glass-sat', GLASS.saturatePct + '%');
  st.setProperty('--glass-nav-blur', GLASS.navBlurPx + 'px');
  st.setProperty('--glass-nav-sat', GLASS.navSaturatePct + '%');
  st.setProperty('--glow-pct', GLASS.glowPct + '%');
}
// 時間軸豎線在最後一筆下面延伸的長度
document.documentElement.style.setProperty('--tl-tail-todo', TIMELINE.tailTodoPx + 'px');
document.documentElement.style.setProperty('--tl-tail-detail', TIMELINE.tailDetailPx + 'px');

installClickGuard();
initStore();
void installNativeBackButton();
// 桌面小工具與通知欄快捷列：資料一變就把數字送過去；點小工具開新增記帳（點條碼區是複製載具，由原生處理）；通知欄按鈕去對應的頁面
void installWidgetSync(
  // 保護狀態（讀不到資料）時不送數字給小工具
  () => (getState().ready && !getState().blocked ? getState().data : null),
  subscribeState,
  (target) => void navFromNative(target),
);
render(<App />, document.getElementById('app')!);
