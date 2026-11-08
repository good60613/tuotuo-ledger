import { render } from 'preact';
import { App } from './app';
import { initStore } from './store';
import { installClickGuard } from './gestures/guard';
import { installNativeBackButton } from './backNav';
import './styles.css';

installClickGuard();
initStore();
void installNativeBackButton();
render(<App />, document.getElementById('app')!);
