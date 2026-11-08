// 資料備份：匯出／匯入全部資料（JSON 檔）。
import type { AppData } from './types';
import { DATA_VERSION } from './types';
import { migrate } from './migrate';

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
    ((d.version as number) === 1 || d.version === DATA_VERSION) &&
    Array.isArray(d.accounts) &&
    Array.isArray(d.transactions) &&
    Array.isArray(d.categories) &&
    Array.isArray(d.noteTags) &&
    typeof d.settings === 'object';
  if (!ok) throw new Error('檔案不是這個 App 的備份');
  return migrate(d);
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

/**
 * 匯出備份檔。網頁版：直接下載。APK 版：Android 的內嵌網頁不能下載檔案，
 * 改成先存到 App 的暫存資料夾，再跳出「分享」選單，讓使用者存到雲端硬碟、檔案管理或傳給自己。
 * 回傳要顯示給使用者的提示文字；使用者取消分享時回傳 null。
 */
export async function saveBackupFile(filename: string, text: string): Promise<string | null> {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) {
    downloadText(filename, text);
    return '已匯出備份檔（在手機的「下載」資料夾）';
  }
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const r = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
  try {
    await Share.share({ title: filename, files: [r.uri], dialogTitle: '把備份檔存到…' });
  } catch {
    return null; // 使用者關掉分享選單
  }
  return '已產生備份檔，請確認已存到雲端硬碟或檔案管理';
}
