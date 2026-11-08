import { render } from 'preact';
import { App } from './app';
import { initStore, getState, subscribeState } from './store';
import { installClickGuard } from './gestures/guard';
import { installNativeBackButton, goHomeFromWidget } from './backNav';
import { installWidgetSync } from './widget';
import './styles.css';
import { TAG_COLOR, BOTTOM_BAR, TIMELINE } from './config';

// 報帳、預算的顏色從設定檔套到畫面上（CSS 變數）
document.documentElement.style.setProperty('--reimb', TAG_COLOR.reimb);
document.documentElement.style.setProperty('--budget', TAG_COLOR.budget);
// 底部操作列、導覽列尺寸從設定檔套到畫面（CSS 變數）
document.documentElement.style.setProperty('--nav-h', BOTTOM_BAR.navHeightPx + 'px');
document.documentElement.style.setProperty('--bar-h', BOTTOM_BAR.heightPx + 'px');
document.documentElement.style.setProperty('--bar-gap', BOTTOM_BAR.gapPx + 'px');
// 時間軸豎線在最後一筆下面延伸的長度
document.documentElement.style.setProperty('--tl-tail-todo', TIMELINE.tailTodoPx + 'px');
document.documentElement.style.setProperty('--tl-tail-detail', TIMELINE.tailDetailPx + 'px');

installClickGuard();
initStore();
void installNativeBackButton();
// 桌面小工具：資料一變就把數字送過去；點小工具回首頁
void installWidgetSync(
  () => (getState().ready ? getState().data : null),
  subscribeState,
  () => void goHomeFromWidget(),
);
render(<App />, document.getElementById('app')!);
