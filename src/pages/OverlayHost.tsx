import { useAppState, closeOverlay, type Overlay } from '../store';
import { EntryPage } from './Entry';

/** 疊在主頁上的畫面（記帳頁、轉帳輸入…） */
export function OverlayHost() {
  const s = useAppState();
  if (s.overlays.length === 0) return null;
  const o = s.overlays[s.overlays.length - 1];
  // key：每次開新的畫面都重新初始化
  return (
    <div class="overlay" data-no-swipe key={s.overlays.length + ':' + JSON.stringify(o)}>
      {renderOverlay(o)}
    </div>
  );
}

function renderOverlay(o: Overlay) {
  if (o.kind === 'placeholder') {
    return (
      <div class="placeholder">
        <h2>{o.title}</h2>
        {o.lines.map((l) => <p key={l}>{l}</p>)}
        <button class="btn" onClick={closeOverlay}>關閉</button>
      </div>
    );
  }
  return <EntryPage o={o} />;
}
