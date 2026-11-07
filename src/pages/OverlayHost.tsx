import { useAppState, closeOverlay, type Overlay } from '../store';
import { accountName } from '../selectors';

/** 疊在主頁上的畫面（記帳頁、轉帳輸入…） */
export function OverlayHost() {
  const s = useAppState();
  if (s.overlays.length === 0) return null;
  const o = s.overlays[s.overlays.length - 1];
  return <div class="overlay">{renderOverlay(o)}</div>;
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
  // 第 6 段完成前：暫時顯示「會開啟什麼」，用來測手勢
  return <EntryPreview o={o} />;
}

function EntryPreview({ o }: { o: Extract<Overlay, { kind: 'entry' }> }) {
  const s = useAppState();
  const d = s.data;
  const title = o.mode === 'expense' ? '記帳頁（支出）' : o.mode === 'income' ? '記帳頁（收入）' : '轉帳輸入';
  return (
    <div class="placeholder">
      <h2>{title}</h2>
      {o.mode === 'transfer' ? (
        <p class="big-line">{accountName(d, o.accountId)} → {accountName(d, o.toAccountId)}</p>
      ) : (
        <p class="big-line">帳戶：{accountName(d, o.accountId)}</p>
      )}
      <p class="muted">（手勢試玩版：這裡之後會是完整的輸入畫面，目前不會記任何帳）</p>
      <button class="btn" onClick={closeOverlay}>關閉</button>
    </div>
  );
}
