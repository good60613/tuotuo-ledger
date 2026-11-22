import { useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useAppState, closeOverlay, getState, type Overlay } from '../store';
import { useGhostOut } from '../motion';
import { EntryPage } from './Entry';
import { SubPage } from './Sub';

/** 疊在主頁上的畫面（記帳頁、轉帳輸入…） */
export function OverlayHost() {
  const s = useAppState();
  const depth = s.overlays.length;
  const top = depth > 0 ? s.overlays[depth - 1] : null;
  // key：每次開新的畫面都重新初始化
  const key = top ? depth + ':' + JSON.stringify(top) : '';
  // 「關掉上面那層、底下那層被重建出來」時，底下那層不要再播進場動畫（上面那層的殘影正在退場）
  const st = useRef({ key: '', depth: 0, quiet: false });
  if (st.current.key !== key) st.current = { key, depth, quiet: depth > 0 && depth < st.current.depth };
  if (!top) return null;
  return (
    <OverlayShell key={key} depth={depth} sub={top.kind === 'sub'} quiet={st.current.quiet}>
      {renderOverlay(top)}
    </OverlayShell>
  );
}

/**
 * 疊層外框。卸載時如果是「疊層變少」（關掉了），做一份離場殘影；
 * 「換成另一個疊層」（數量沒變少）不做殘影，免得蓋住新畫面。
 */
function OverlayShell({ depth, sub, quiet, children }: { depth: number; sub: boolean; quiet: boolean; children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  useGhostOut(ref, sub ? 'sub' : 'entry', () => getState().overlays.length < depth);
  // ov-stacked：疊在另一個疊層上面時，底下沒東西可透，進場不淡入（只位移）
  const cls = `overlay ${sub ? 'ov-sub' : 'ov-entry'}${depth > 1 ? ' ov-stacked' : ''}${quiet ? ' ov-quiet' : ''}`;
  return (
    <div class={cls} data-no-swipe ref={ref}>
      {children}
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
  if (o.kind === 'sub') return <SubPage o={o} />;
  return <EntryPage o={o} />;
}
