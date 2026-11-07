// 資料備份：匯出／匯入全部資料（JSON 檔）。
import type { AppData } from './types';

export function exportJson(data: AppData): string {
  return JSON.stringify({ app: 'ledger-app', exportedAt: new Date().toISOString(), data }, null, 2);
}

export function parseBackup(text: string): AppData {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('檔案不是正確的備份格式');
  }
  const d = (obj as { data?: AppData })?.data ?? (obj as AppData);
  const ok =
    d &&
    d.version === 1 &&
    Array.isArray(d.accounts) &&
    Array.isArray(d.transactions) &&
    Array.isArray(d.categories) &&
    Array.isArray(d.noteTags) &&
    typeof d.settings === 'object';
  if (!ok) throw new Error('檔案不是這個 App 的備份');
  return d;
}

/** 在手機上觸發下載 */
export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
