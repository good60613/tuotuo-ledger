// 全域狀態：資料（會存檔）＋畫面狀態（不存檔）。
import { useEffect, useState } from 'preact/hooks';
import type { AppData } from './data/types';
import { loadData, saveData, requestPersistence } from './data/storage';
import { sampleData } from './data/seed';
import { TOAST_MS } from './config';

export const PAGES = ['報帳', '統計', '首頁', '明細', '設定'] as const;
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
  | { kind: 'placeholder'; title: string; lines: string[] };

export interface DetailFilter {
  accountId: string | null; // null = 全部
  categoryId: string | null;
  day: string | null; // YYYY-MM-DD
}

export interface Toast {
  id: number;
  text: string;
  undo?: () => void;
}

export interface State {
  ready: boolean;
  data: AppData;
  page: number;
  overlays: Overlay[];
  detail: DetailFilter;
  statsAccountId: string | null;
  toast: Toast | null;
  /** 拖曳中：鎖住換頁 */
  dragging: boolean;
}

let state: State = {
  ready: false,
  data: sampleData(),
  page: HOME_PAGE,
  overlays: [],
  detail: { accountId: null, categoryId: null, day: null },
  statsAccountId: null,
  toast: null,
  dragging: false,
};

const listeners = new Set<() => void>();
export const getState = () => state;

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

export function openOverlay(o: Overlay) {
  setState((s) => ({ overlays: [...s.overlays, o] }));
}
export function closeOverlay() {
  setState((s) => ({ overlays: s.overlays.slice(0, -1) }));
}
export function goPage(page: number) {
  setState({ page: Math.max(0, Math.min(PAGES.length - 1, page)) });
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
