import { useEffect, useRef } from 'preact/hooks';
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
import { UI_ICONS } from './icons';
import { Icon } from './components/Icon';
import { BlockedScreen } from './pages/BlockedScreen';

const NAV_ICON = UI_ICONS;

export function App() {
  const s = useAppState();
  const pagerRef = useRef<HTMLDivElement>(null);
  // 翻頁時手指的位移直接寫到 track 的樣式上，不經過 state：
  // 用 state 的話每移動一點點就會把 5 個分頁（含首頁的餘額計算）整個重畫一次，這就是翻頁會頓的原因。
  const trackRef = useRef<HTMLDivElement>(null);
  const onOffset = (dx: number | null) => {
    const t = trackRef.current;
    if (!t) return;
    const base = -getState().page * 100;
    if (dx === null) {
      t.style.transition = `transform ${PAGER.animMs}ms ease-out`;
      t.style.transform = `translateX(${base}%)`;
    } else {
      t.style.transition = 'none';
      t.style.transform = `translateX(calc(${base}% + ${dx}px))`;
    }
  };

  useEffect(() => {
    const el = pagerRef.current;
    if (!el) return;
    return attachPager(el, {
      getPage: () => getState().page,
      pageCount: PAGES.length,
      setPage: goPage,
      // 卡片拿起中、或有輸入畫面開著，都不換頁
      getDragging: () => getState().dragging || getState().overlays.length > 0,
      onOffset,
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
          ref={trackRef}
          style={{
            transform: `translateX(${-s.page * 100}%)`,
            transition: s.fade ? 'none' : `transform ${PAGER.animMs}ms ease-out`,
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
            <span class="nav-icon"><Icon name={NAV_ICON[name as keyof typeof UI_ICONS]} size={22} /></span>
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
