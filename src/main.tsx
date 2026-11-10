import { render } from 'preact';
import { App } from './app';
import { initStore, getState, subscribeState } from './store';
import { installClickGuard } from './gestures/guard';
import { installNativeBackButton, goHomeFromWidget } from './backNav';
import { installWidgetSync } from './widget';
import './styles.css';
import { BOTTOM_BAR, TIMELINE, GLASS, HOME, DRAG_FX } from './config';
import { applyCachedTheme } from './theme';

// 第一個畫面前先套顏色（上次存的外觀，沒有就亮色），讀到設定後由 App 再套正確模式
applyCachedTheme();
// 底部操作列、導覽列尺寸從設定檔套到畫面（CSS 變數）
document.documentElement.style.setProperty('--nav-h', BOTTOM_BAR.navHeightPx + 'px');
document.documentElement.style.setProperty('--bar-h', BOTTOM_BAR.heightPx + 'px');
document.documentElement.style.setProperty('--bar-gap', BOTTOM_BAR.gapPx + 'px');
{
  const st = document.documentElement.style;
  st.setProperty('--fx-lift', String(DRAG_FX.liftScale));
  st.setProperty('--fx-tilt', DRAG_FX.tiltDeg + 'deg');
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
// 桌面小工具：資料一變就把數字送過去；點小工具回首頁
void installWidgetSync(
  // 保護狀態（讀不到資料）時不送數字給小工具
  () => (getState().ready && !getState().blocked ? getState().data : null),
  subscribeState,
  () => void goHomeFromWidget(),
);
render(<App />, document.getElementById('app')!);
