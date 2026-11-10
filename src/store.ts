// 全域狀態：資料（會存檔）＋畫面狀態（不存檔）。
import { useEffect, useState } from 'preact/hooks';
import type { AppData } from './data/types';
import { loadData, saveData, requestPersistence } from './data/storage';
import { sampleData } from './data/seed';
import { TOAST_MS, TRANSITION } from './config';

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
  /** 跳頁時用淡入淡出（不滑動） */
  fade: boolean;
  toast: Toast | null;
  /** 拖曳中：鎖住換頁 */
  dragging: boolean;
  /** 待辦頁目前的分頁（首頁點「已圈預算」會切到預算） */
  todoTab: TodoTab;
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
  fade: false,
  toast: null,
  dragging: false,
  todoTab: 'reimb',
};

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

export async function initStore() {
  try {
    const saved = await loadData();
    if (saved) setState({ data: saved, ready: true });
    else {
      const d = sampleData();
      await saveData(d);
      setState({ data: d, ready: true });
    }
  } catch (e) {
    console.error(e);
    setState({ ready: true });
    showToast('無法讀取手機上的資料，這次的變更可能不會保存');
  }
  requestPersistence();
}
