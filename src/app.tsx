import { useEffect, useRef, useState } from 'preact/hooks';
import { PAGES, getState, goPage, useAppState, hideToast } from './store';
import { attachPager } from './gestures/pager';
import { PAGER, BOTTOM_BAR } from './config';
import { HomePage } from './pages/Home';
import { OverlayHost } from './pages/OverlayHost';
import { DialogHost } from './components/DialogHost';
import { DetailPage } from './pages/Detail';
import { StatsPage } from './pages/Stats';
import { TodoPage } from './pages/Todo';
import { SettingsPage } from './pages/Settings';
import { applyTheme, themeOf } from './theme';
import { glassOn } from './features';
import { BlockedScreen } from './pages/BlockedScreen';

const NAV_ICON = ['🧾', '📊', '🏠', '📋', '⚙️'];

export function App() {
  const s = useAppState();
  const pagerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState<number | null>(null);

  useEffect(() => {
    const el = pagerRef.current;
    if (!el) return;
    return attachPager(el, {
      getPage: () => getState().page,
      pageCount: PAGES.length,
      setPage: goPage,
      // 卡片拿起中、或有輸入畫面開著，都不換頁
      getDragging: () => getState().dragging || getState().overlays.length > 0,
      onOffset: setOffset,
    });
  }, [s.ready]);

  // 讀到設定或設定變動時套用外觀
  const themeMode = themeOf(s.data?.settings);
  useEffect(() => {
    if (s.ready) applyTheme(themeMode);
  }, [s.ready, themeMode]);

  // 毛玻璃關閉時在 <html> 加 no-glass，讓毛玻璃元素改成實心
  const glass = glassOn(s.data?.settings);
  useEffect(() => {
    document.documentElement.classList.toggle('no-glass', !glass);
  }, [glass]);

  if (!s.ready) return <div class="loading">讀取中…</div>;

  // 資料保護狀態：只顯示保護畫面（不顯示範例資料、不能記帳）
  if (s.blocked)
    return (
      <div class="app">
        <BlockedScreen />
        <DialogHost />
        {s.toast && <div class="toast" role="status"><span>{s.toast.text}</span></div>}
      </div>
    );

  // 目前這頁有沒有底部操作列（統計、明細、待辦）：提示條要再往上抬
  // 有疊層（記帳頁、小帳戶畫面）開著時，畫面上看不到底部操作列，提示條不用再往上抬
  const hasBar = s.overlays.length === 0 && ['待辦', '統計', '明細'].includes(PAGES[s.page]);
  const pages = [<TodoPage />, <StatsPage />, <HomePage />, <DetailPage />, <SettingsPage />];

  return (
    <div class={`app${s.fade ? ' fading' : ''}`} style={{ '--bottom-bar-h': `${hasBar ? BOTTOM_BAR.heightPx + BOTTOM_BAR.gapPx * 2 : 0}px` }}>
      <div class="pager" ref={pagerRef}>
        <div
          class="track"
          style={{
            transform: `translateX(calc(${-s.page * 100}% + ${offset ?? 0}px))`,
            transition: s.fade ? 'none' : offset === null ? `transform ${PAGER.animMs}ms ease-out` : 'none',
          }}
        >
          {pages.map((p, i) => (
            <section class="page" key={i} aria-hidden={i !== s.page} data-page={PAGES[i]}>
              {p}
            </section>
          ))}
        </div>
      </div>

      <nav class="bottom-nav glass glass-nav">
        {PAGES.map((name, i) => (
          <button
            key={name}
            class={`nav-item${i === s.page ? ' active' : ''}`}
            onClick={() => goPage(i)}
            aria-current={i === s.page ? 'page' : undefined}
          >
            <span class="nav-icon">{NAV_ICON[i]}</span>
            <span class="nav-label">{name}</span>
          </button>
        ))}
      </nav>

      <OverlayHost />
      <DialogHost />

      {s.toast && (
        <div class="toast" role="status">
          <span>{s.toast.text}</span>
          {s.toast.undo && (
            <button
              class="toast-undo"
              onClick={() => {
                const u = s.toast?.undo;
                hideToast();
                u?.();
              }}
            >
              復原
            </button>
          )}
        </div>
      )}
    </div>
  );
}
