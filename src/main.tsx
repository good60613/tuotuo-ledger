import { render } from 'preact';
import { App } from './app';
import { initStore } from './store';
import { installClickGuard } from './gestures/guard';
import './styles.css';

installClickGuard();
initStore();
render(<App />, document.getElementById('app')!);
