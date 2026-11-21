// 提示膠囊（2.3）的內容：把剛記下的紀錄整理成「已記 醫療 −$450」。只整理顯示，不算金額。
import type { AppData, Transaction } from './data/types';
import type { ToastRich } from './store';
import { txView } from './components/TxList';
import { money } from './format';

/** 剛記下（或剛動過）的幾筆紀錄 → 膠囊內容。多筆時顯示「N 筆」與合計，圖示用第一筆的 */
export function toastRich(verb: string, data: AppData, txs: Transaction[]): ToastRich | undefined {
  const first = txs[0];
  if (!first) return undefined;
  const v = txView(data, first);
  const one = txs.length === 1;
  const sum = txs.reduce((s, t) => s + t.amount, 0);
  const sign = v.amt.startsWith('-') ? '−' : v.amt.startsWith('+') ? '+' : '';
  return {
    icon: v.icon,
    bg: v.bg,
    fg: v.fg,
    verb,
    title: one ? v.title : `${txs.length} 筆`,
    amt: one ? sign + money(first.amount) : sign + money(sum),
    cls: v.cls,
  };
}
