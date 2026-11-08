import { render } from 'preact';
import { App } from './app';
import { initStore } from './store';
import { installClickGuard } from './gestures/guard';
import { installNativeBackButton } from './backNav';
import './styles.css';
import { TAG_COLOR } from './config';

// 報帳、預算的顏色從設定檔套到畫面上（CSS 變數）
document.documentElement.style.setProperty('--reimb', TAG_COLOR.reimb);
document.documentElement.style.setProperty('--budget', TAG_COLOR.budget);

installClickGuard();
initStore();
void installNativeBackButton();
render(<App />, document.getElementById('app')!);
