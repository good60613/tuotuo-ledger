// 3.3 更新檢查的畫面接線：開機自動查、設定頁〔現在檢查〕、「有新版本」對話框。
// 純邏輯在 updateCheck.ts。失敗一律安靜略過（自動）或顯示「查不到，請稍後再試」（手動）。
import { ask, getState, showToast } from './store';
import { UPDATE } from './config';
import { getAppVersion } from './appVersion';
import { isNative } from './widget';
import { checkLatest, addSkip, isSkipped, readLastCheck, writeLastCheck, shouldCheckNow, type ReleaseInfo } from './updateCheck';

const doFetch: typeof fetch = (input, init) => fetch(input, init);

/** 開外部網址（沿用 Capacitor 的做法：交給系統瀏覽器；APK 的網址會直接開始下載） */
function openExternal(url: string): void {
  try {
    window.open(url, '_system');
  } catch { /* ignore */ }
}

/** 跳出「有新版本」對話框：〔下載更新〕〔之後再說〕〔這版不再提醒〕 */
export async function showUpdateDialog(r: ReleaseInfo): Promise<void> {
  const v = await ask(`有新版本 ${r.version}`, r.notes || undefined, [
    { label: '下載更新', value: 'download', style: 'primary' },
    { label: '之後再說', value: 'later', style: 'secondary' },
    { label: '這版不再提醒', value: 'skip', style: 'secondary' },
  ]);
  if (v === 'download') openExternal(r.url);
  else if (v === 'skip') addSkip(r.version);
}

/** 開機自動檢查：只在 APK 版、設定沒關、距離上次超過 20 小時才查；失敗安靜略過 */
export async function maybeAutoCheck(): Promise<void> {
  try {
    const st = getState();
    if (!st.ready || st.blocked || st.tutorial || st.dialog) return;
    if (st.data.settings.autoUpdateCheck === false) return;
    if (!(await isNative())) return;
    const now = Date.now();
    if (!shouldCheckNow(readLastCheck(), now, UPDATE.minHoursBetween)) return;
    const current = await getAppVersion();
    if (!current) return;
    const res = await checkLatest(current, doFetch);
    if (res.status === 'error') return; // 沒查成功不記時間，下次開機再試
    writeLastCheck(now);
    if (res.status === 'newer' && !isSkipped(res.release.version) && !getState().dialog) {
      await showUpdateDialog(res.release);
    }
  } catch { /* 任何意外都不打擾使用者 */ }
}

/** 設定頁〔現在檢查〕：結果用提示條顯示；有新版（就算之前選過略過）會跳對話框 */
export async function checkUpdateNow(): Promise<void> {
  try {
    const current = await getAppVersion().catch(() => null);
    const res = await checkLatest(current ?? '0.0', doFetch);
    if (res.status === 'error') return showToast('查不到，請稍後再試');
    writeLastCheck(Date.now());
    if (!current) return showToast(`最新版是 ${res.release.version}（網頁預覽無法比對）`);
    if (res.status === 'latest') return showToast('已是最新版');
    showToast(`有新版 ${res.release.version}`);
    await showUpdateDialog(res.release);
  } catch {
    showToast('查不到，請稍後再試');
  }
}
