import { useEffect, useRef, useState } from 'preact/hooks';
import { PAGES, getState, goPage, useAppState, hideToast } from './store';
import { attachPager } from './gestures/pager';
import { PAGER } from './config';
import { HomePage } from './pages/Home';
import { OverlayHost } from './pages/OverlayHost';
import { DialogHost } from './components/DialogHost';
import { DetailPage } from './pages/Detail';
import { StatsPage } from './pages/Stats';
import { TodoPage } from './pages/Todo';
import { SettingsPage } from './pages/Settings';

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

  if (!s.ready) return <div class="loading">讀取中…</div>;

  const pages = [<TodoPage />, <StatsPage />, <HomePage />, <DetailPage />, <SettingsPage />];

  return (
    <div class={`app${s.fade ? ' fading' : ''}`}>
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

      <nav class="bottom-nav">
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
