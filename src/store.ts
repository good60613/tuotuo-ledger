// 全域狀態：資料（會存檔）＋畫面狀態（不存檔）。
import { useEffect, useState } from 'preact/hooks';
import type { TypeFilter } from './detailFilter';
import type { AppData } from './data/types';
import { saveData, requestPersistence, deviceStorage } from './data/storage';
import { sampleData } from './data/seed';
import { TOAST_MS, TRANSITION, RECURRING_CHECK_MS } from './config';
import { postDueRecurring } from './data/recurring';
import { boot, ensureDailySnapshot, loadSnapshotData, replaceWithSnapshot, type BlockReason } from './data/boot';
import type { SnapshotReason } from './data/snapshots';

export const PAGES = ['待辦', '統計', '首頁', '明細', '設定'] as const;
export const TODO_PAGE = 0;
/** 待辦頁的分頁 */
export type TodoTab = 'reimb' | 'advance' | 'owed' | 'budget';
export const HOME_PAGE = 2;

/** 疊在主頁面上的畫面 */
export type Overlay =
  | {
      kind: 'entry';
      /** expense/income/transfer */
      mode: 'expense' | 'income' | 'transfer';
      accountId: string | null;
      toAccountId?: string | null;
      /** 編輯既有紀錄 */
      txId?: string;
    }
  /** 小帳戶子畫面（悠遊卡、電子錢包、投資、儲蓄） */
  | { kind: 'sub'; ball: 'easycard' | 'ewallet' | 'invest' | 'saving' }
  | { kind: 'placeholder'; title: string; lines: string[] };

export interface DetailFilter {
  accountId: string | null; // null = 全部
  categoryId: string | null;
  day: string | null; // YYYY-MM-DD
  /** 結算期 'YYYY-MM'；null＝目前這一期（到結算日會自動換下一期） */
  period?: string | null;
  /** 2.2 類型膠囊；null／缺值＝全部 */
  kind?: TypeFilter | null;
  /** 2.2 搜尋（備註、分類名稱），範圍是全部月份；空＝不搜 */
  q?: string;
}

export interface Toast {
  id: number;
  text: string;
  undo?: () => void;
}

export interface DialogButton {
  label: string;
  value: string;
  style?: 'primary' | 'danger' | 'secondary';
}
export interface Dialog {
  title: string;
  body?: string;
  buttons: DialogButton[];
  resolve: (v: string | null) => void;
}

export interface State {
  dialog: Dialog | null;
  ready: boolean;
  data: AppData;
  page: number;
  overlays: Overlay[];
  detail: DetailFilter;
  statsAccountId: string | null;
  /** 統計頁看的結算期；null＝目前這一期 */
  statsPeriod: string | null;
  /** 2.2 統計頁檢視：月（預設）／年／自訂區間。只在這次使用中記住 */
  statsMode: 'month' | 'year' | 'custom';
  /** 年檢視看哪一年；null＝目前這一期所在的年 */
  statsYear: number | null;
  /** 自訂區間（兩端都含，YYYY-MM-DD） */
  statsCustom: { from: string; to: string } | null;
  /** 跳頁時用淡入淡出（不滑動） */
  fade: boolean;
  toast: Toast | null;
  /** 拖曳中：鎖住換頁 */
  dragging: boolean;
  /** 待辦頁目前的分頁（首頁點「已圈預算」會切到預算） */
  todoTab: TodoTab;
  /**
   * 資料保護狀態（2.0 修正批）：讀不到、升級失敗、版本比 App 新時不為 null。
   * 這時畫面只顯示保護畫面，任何存檔都會被擋下。
   */
  blocked: { reason: BlockReason; message: string } | null;
}

let state: State = {
  dialog: null,
  ready: false,
  data: sampleData(),
  page: HOME_PAGE,
  overlays: [],
  detail: { accountId: null, categoryId: null, day: null },
  statsAccountId: null,
  statsPeriod: null,
  statsMode: 'month',
  statsYear: null,
  statsCustom: null,
  fade: false,
  toast: null,
  dragging: false,
  todoTab: 'reimb',
  blocked: null,
};

/** 保護狀態時手機上的原始資料（還原、匯入前要先把它留一份） */
let blockedRaw: unknown = null;

const listeners = new Set<() => void>();
export const getState = () => state;
/** 畫面以外的程式（例如桌面小工具同步）監聽狀態變化 */
export const subscribeState = (fn: () => void) => {
  listeners.add(fn);
};

export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}

let saveChain: Promise<void> = Promise.resolve();
/** 改資料並存檔。fn 丟出錯誤時資料不變，錯誤往外丟給畫面顯示 */
export function updateData(fn: (d: AppData) => AppData) {
  if (state.blocked || !state.ready) {
    // 保護狀態（或還沒讀完資料）：不改、不存，並說明原因
    showToast('資料保護中：目前不會存任何變更');
    return;
  }
  const next = fn(state.data);
  setState({ data: next });
  saveChain = saveChain.then(() => saveData(next)).catch((e) => {
    console.error(e);
    showToast('存檔失敗，請再試一次');
  });
}

export function useAppState(): State {
  const [, force] = useState(0);
  const seen = state;
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    // 畫面掛上之前狀態就變了（例如資料讀得很快）→ 立刻補一次更新
    if (state !== seen) l();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return state;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastSeq = 0;
export function showToast(text: string, undo?: () => void) {
  clearTimeout(toastTimer);
  const id = ++toastSeq;
  setState({ toast: { id, text, undo } });
  toastTimer = setTimeout(() => {
    if (state.toast?.id === id) setState({ toast: null });
  }, TOAST_MS);
}
export const hideToast = () => setState({ toast: null });

/** 跳出選擇視窗，回傳按下的按鈕 value；按背景關閉回傳 null */
export function ask(title: string, body: string | undefined, buttons: DialogButton[]): Promise<string | null> {
  return new Promise((resolve) => setState({ dialog: { title, body, buttons, resolve } }));
}
export async function confirmDanger(title: string, body: string, okLabel = '刪除'): Promise<boolean> {
  const v = await ask(title, body, [
    { label: '取消', value: 'no', style: 'secondary' },
    { label: okLabel, value: 'yes', style: 'danger' },
  ]);
  return v === 'yes';
}
export function closeDialog(v: string | null) {
  const d = state.dialog;
  setState({ dialog: null });
  d?.resolve(v);
}

// 疊層畫面與手機「返回鍵」連動：開畫面時記一筆瀏覽紀錄，按返回就關掉最上層。
export function openOverlay(o: Overlay) {
  setState((s) => ({ overlays: [...s.overlays, o] }));
  try {
    history.pushState({ overlay: state.overlays.length }, '');
  } catch { /* ignore */ }
}
export function closeOverlay() {
  if (state.overlays.length === 0) return;
  if (typeof history !== 'undefined' && history.state && typeof history.state.overlay === 'number') history.back();
  else setState((s) => ({ overlays: s.overlays.slice(0, -1) }));
}
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (state.dialog) closeDialog(null);
    const depth = typeof history.state?.overlay === 'number' ? history.state.overlay : 0;
    if (state.overlays.length > depth) setState((s) => ({ overlays: s.overlays.slice(0, depth) }));
  });
}
export function goPage(page: number, fade = false) {
  const p = Math.max(0, Math.min(PAGES.length - 1, page));
  if (!fade) return setState({ page: p });
  setState({ page: p, fade: true });
  setTimeout(() => setState({ fade: false }), TRANSITION.fadeMs);
}

/**
 * 定期扣款自動記帳（補強批）：打開 App、回到前景、每隔一段時間各檢查一次。
 * 補記日期是原本的扣款日，同一項同一月只記一次（見 data/recurring.ts）。
 */
export function runRecurring(now: Date = new Date()) {
  if (state.blocked) return;
  const r = postDueRecurring(state.data, now);
  if (r.posted.length === 0) return;
  updateData(() => r.data);
  showToast(`已自動記 ${r.posted.length} 筆定期扣款`);
}

/** 每天第一次開啟（含 App 一直開著跨日後回到前景）留一份 */
function dailySnapshot() {
  if (state.blocked || !state.ready) return;
  ensureDailySnapshot(deviceStorage, state.data).catch((e) => console.error('每日留底失敗', e));
}

let running = false;
/** 讀到資料之後才開始的背景工作（定期扣款、每日留底）；只會啟動一次 */
function startRunning() {
  if (running) return;
  running = true;
  runRecurring();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      dailySnapshot();
      runRecurring();
    });
    setInterval(runRecurring, RECURRING_CHECK_MS);
  }
}

/**
 * 開啟 App：讀資料（見 data/boot.ts）。讀不到、升級失敗、版本太新 → 保護狀態，絕不寫入；
 * 第一次使用才載入範例。重試也走這裡。
 */
export async function initStore() {
  const r = await boot(deviceStorage);
  if (r.kind === 'blocked') {
    blockedRaw = r.raw;
    setState({ ready: true, blocked: { reason: r.reason, message: r.message } });
    return;
  }
  blockedRaw = null;
  setState({ data: r.data, ready: true, blocked: null });
  if (r.warnings.length) showToast(r.warnings.join('；'));
  requestPersistence();
  startRunning();
}

/**
 * 整份取代（匯入完整備份、匯入設定、清空、載入範例、還原留底）：
 * 先把目前資料自動留一份，再存新的。留底失敗就不取代，丟錯給畫面顯示。
 * 保護狀態下也能用（用來救回資料），留的是手機上原本那份。
 */
export async function replaceData(next: AppData, reason: SnapshotReason) {
  await saveChain; // 等前面還在排隊的存檔寫完，避免舊的蓋掉新的
  const current = state.blocked ? blockedRaw : state.data;
  const p = replaceWithSnapshot(deviceStorage, current, next, reason);
  saveChain = p.catch(() => undefined);
  await p;
  const wasBlocked = !!state.blocked;
  blockedRaw = null;
  setState({ data: next, blocked: null, ready: true });
  if (wasBlocked) {
    requestPersistence();
    startRunning();
  }
}

/** 從某份自動留底還原（還原前會先把目前資料再留一份） */
export async function restoreSnapshot(id: string) {
  const data = await loadSnapshotData(deviceStorage, id);
  await replaceData(data, 'pre-restore');
}

/** 保護畫面「從範例開始」：只有找不到主資料時才提供 */
export async function startFresh() {
  await replaceData(sampleData(), 'pre-sample');
}
