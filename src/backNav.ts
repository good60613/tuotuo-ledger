// 返回鍵（Android 返回手勢／返回鍵）：一律「返回上一層」，只有在首頁且什麼都沒開時才離開 App。
//
// 順序（由上往下，找到第一個就處理掉，不再往下）：
// 1. 確認視窗（Dialog）→ 關掉（等同按取消）
// 2. 底部選單（Sheet）、頁面裡的二級畫面（設定的子頁、報帳的多選）→ 關掉最上面那一個
// 3. 疊層畫面（記帳頁、編輯頁、小帳戶子畫面）→ 關掉最上面那一個
// 4. 不在首頁 → 回首頁
// 5. 在首頁、什麼都沒開 → 離開 App
import { useEffect, useRef } from 'preact/hooks';
import { getState, closeDialog, closeOverlay, goPage, HOME_PAGE } from './store';
import { quickEntry } from './actions';

interface Layer {
  id: number;
  close: () => void;
  /** 註冊當下開著幾層疊層畫面：在它上面又開了疊層畫面時，要先關疊層畫面 */
  depth: number;
}

const layers: Layer[] = [];
let nextId = 1;

/** 登記一層「按返回要先關掉」的東西，回傳取消登記的函式 */
export function pushBackLayer(close: () => void): () => void {
  const layer: Layer = { id: nextId++, close, depth: getState().overlays.length };
  layers.push(layer);
  return () => {
    const i = layers.findIndex((l) => l.id === layer.id);
    if (i >= 0) layers.splice(i, 1);
  };
}

/** 元件用：active 為 true 時，按返回會呼叫 close */
export function useBackLayer(active: boolean, close: () => void) {
  const ref = useRef(close);
  ref.current = close;
  useEffect(() => {
    if (!active) return;
    return pushBackLayer(() => ref.current());
  }, [active]);
}

export type BackResult = 'dialog' | 'layer' | 'overlay' | 'home' | 'exit';

/** 處理一次返回。回傳做了什麼；'exit' 表示應該離開 App（由呼叫端決定怎麼離開） */
export function handleBack(): BackResult {
  const s = getState();
  if (s.dialog) {
    closeDialog(null);
    return 'dialog';
  }
  const top = [...layers].reverse().find((l) => l.depth >= s.overlays.length);
  if (top) {
    top.close();
    return 'layer';
  }
  if (s.overlays.length > 0) {
    closeOverlay();
    return 'overlay';
  }
  if (s.page !== HOME_PAGE) {
    goPage(HOME_PAGE);
    return 'home';
  }
  return 'exit';
}

/**
 * 點了桌面小工具：回首頁。PK 決定（第七批）：記帳頁若開著（可能打到一半），那層保留不清掉；
 * 其他確認視窗、選單、疊層畫面都關掉。疊層用瀏覽紀錄關，是非同步的，所以每關一層等一下再看。
 */
export async function goHomeFromWidget(wait = (ms: number) => new Promise((r) => setTimeout(r, ms))) {
  for (let i = 0; i < 20; i++) {
    const s = getState();
    const top = s.overlays[s.overlays.length - 1];
    const layerAbove = layers.some((l) => l.depth >= s.overlays.length);
    if (top?.kind === 'entry' && !s.dialog && !layerAbove) break;
    const r = handleBack();
    if (r === 'home' || r === 'exit') return;
    if (r === 'overlay') await wait(60);
  }
  // 記帳頁保留時，底下的頁面也先切回首頁（存完或關掉記帳頁就看到首頁）
  if (getState().page !== HOME_PAGE) goPage(HOME_PAGE);
}

/**
 * 點了桌面小工具（條碼區以外，2.3）：開「新增記帳」（支出分頁）。
 * 先等資料讀好（冷啟動時網頁剛載入）；確認視窗、選單、其他疊層照 goHomeFromWidget 的規矩收掉。
 * 記帳頁已經開著（可能打到一半）就保留，不再多開一個。
 */
export async function openEntryFromWidget(wait = (ms: number) => new Promise((r) => setTimeout(r, ms))) {
  for (let i = 0; i < 100 && !(getState().ready && !getState().blocked); i++) {
    if (getState().blocked) return;
    await wait(100);
  }
  if (!getState().ready || getState().blocked) return;
  await goHomeFromWidget(wait);
  const s = getState();
  if (s.overlays[s.overlays.length - 1]?.kind !== 'entry') quickEntry(null);
}

/** 測試用：清掉所有登記 */
export function _resetBackLayers() {
  layers.length = 0;
}

/** APK 版：接上 Capacitor 的返回鍵事件（接上之後，系統預設的「直接離開」就不會發生） */
export async function installNativeBackButton() {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return;
  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', () => {
    if (handleBack() === 'exit') void App.exitApp();
  });
}
