import { useEffect, useRef } from 'preact/hooks';
import { PAGES, getState, goPage, useAppState, pageOrder, navLabel, type PageId } from './store';
import { ToastHost } from './components/ToastHost';
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
import { applyAppFont } from './fonts';
import { Tutorial } from './components/Tutorial';
import { setState } from './store';
import { UI_ICONS } from './icons';
import { Icon } from './components/Icon';
import { BlockedScreen } from './pages/BlockedScreen';
import { maybeAutoCheck } from './updateFlow';

/** 導覽列圖示跟著顯示的名稱走（首頁使用明細頁時，中間是「首頁」、第四格是「帳戶」） */
const navIcon = (label: string) => (label === '帳戶' ? 'wallet' : UI_ICONS[label as keyof typeof UI_ICONS]);
const PAGE_VIEW: Record<PageId, () => preact.JSX.Element> = {
  待辦: () => <TodoPage />,
  統計: () => <StatsPage />,
  首頁: () => <HomePage />,
  明細: () => <DetailPage />,
  設定: () => <SettingsPage />,
};

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

  // 3.0 第一次安裝：讀完資料後打開新手教學
  useEffect(() => {
    if (s.ready && !s.blocked && s.data.settings.tutorial === 'pending') setState({ tutorial: true });
  }, [s.ready]);

  // 3.3 開機自動檢查更新：資料讀好後稍等一下再查（只有 APK 版、設定沒關、距離上次超過 20 小時才會真的連線）
  useEffect(() => {
    if (!s.ready || s.blocked) return;
    const t = setTimeout(() => void maybeAutoCheck(), 2500);
    return () => clearTimeout(t);
  }, [s.ready, !!s.blocked]);

  // 2.6 App 字體：讀到設定或換字體時套用（沒下載或載入失敗＝維持手機字體）
  const appFont = s.data?.settings.appFont;
  useEffect(() => {
    if (s.ready) void applyAppFont(appFont);
  }, [s.ready, appFont]);

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
        <ToastHost toast={s.toast} lift={false} />
      </div>
    );

  // 目前這頁有沒有底部操作列（統計、明細、待辦）：提示條要再往上抬
  // 有疊層（記帳頁、小帳戶畫面）開著時，畫面上看不到底部操作列，提示條不用再往上抬
  const order = pageOrder(s.data.settings);
  const hasBar = s.overlays.length === 0 && ['待辦', '統計', '明細'].includes(order[s.page]);

  // 提示膠囊要躲開右下角的「＋」：明細頁、小帳戶子畫面（都有＋）時再往上抬
  const topOverlay = s.overlays[s.overlays.length - 1];
  const toastLift = topOverlay ? topOverlay.kind === 'sub' : order[s.page] === '明細';

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
          {order.map((id, i) => (
            <section class="page" key={id} aria-hidden={i !== s.page} data-page={id}>
              {PAGE_VIEW[id]()}
            </section>
          ))}
        </div>
      </div>

      <nav class="bottom-nav glass glass-nav">
        {order.map((id, i) => (
          <button
            key={id}
            class={`nav-item${i === s.page ? ' active' : ''}`}
            onClick={() => goPage(i)}
            aria-current={i === s.page ? 'page' : undefined}
          >
            <span class="nav-icon"><Icon name={navIcon(navLabel(id, s.data.settings))} size={22} /></span>
            <span class="nav-label">{navLabel(id, s.data.settings)}</span>
          </button>
        ))}
      </nav>

      <OverlayHost />
      {s.tutorial && <Tutorial />}
      <DialogHost />

      <ToastHost toast={s.toast} lift={toastLift} />
    </div>
  );
}
