// 3.5 雲端備份：什麼時候上傳、什麼時候問「要用哪一份」、斷線時首頁提示條。
//
// 規則（PK 2026-11-26 定案）：
// - 存在使用者自己的 Google 雲端「App 專用隱藏區」，一個檔案，內容＝完整備份。
// - 資料一改，等一下（CLOUD.uploadDelayMs）就自動上傳；打開 App、回到前景也會檢查一次。
// - 雲端那份是「別台裝置」後來傳的（或這支手機第一次連結、資料被清過）→ 一定先問要用哪一份，不自動蓋。
// - 從雲端拿回來之前，手機上的資料先自動存檔一份（replaceData 會做）。
// - 授權過期、背景續不上 → 首頁提示條請使用者點一下（只有「有變更還沒備份」時才出現）。
//
// 連結狀態存在 localStorage（不放進記帳資料：不升資料版本，匯出的備份檔也不會帶著）。
import { getState, setState, subscribeState, replaceData, ask, confirmDanger, showToast, type CloudStatus } from '../store';
import { exportJson, readBackup } from '../data/backup';
import { CLOUD } from '../config';
import { AuthError, OfflineError, findBackup, downloadBackup, uploadBackup, deleteBackup, revokeToken, type RemoteMeta } from './drive';
import { tokenProvider, cloudAvailable, CancelledError } from './auth';

const KEY = 'tt-cloud';

export interface Saved {
  linked: boolean;
  lastBackupAt: string | null;
  /** 我們最後一次看到（或傳上去）的雲端檔案修改時間：不一樣＝雲端被別人改過 */
  lastRemoteModified: string | null;
  pending: number;
  /** 這支手機（這個瀏覽器）的代號，寫在雲端檔案上，用來分辨是不是自己傳的 */
  deviceId: string;
}

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    if (s && typeof s.deviceId === 'string') {
      return {
        linked: !!s.linked,
        lastBackupAt: s.lastBackupAt ?? null,
        lastRemoteModified: s.lastRemoteModified ?? null,
        pending: Math.max(0, Number(s.pending) || 0),
        deviceId: s.deviceId,
      };
    }
  } catch {
    /* 壞掉就重來 */
  }
  return { linked: false, lastBackupAt: null, lastRemoteModified: null, pending: 0, deviceId: newId() };
}

let saved: Saved = { linked: false, lastBackupAt: null, lastRemoteModified: null, pending: 0, deviceId: '' };

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* 存不了：這次使用中照樣能用 */
  }
}

function publish(patch: Partial<CloudStatus> = {}) {
  setState((s) => ({
    cloud: { ...s.cloud, linked: saved.linked, lastBackupAt: saved.lastBackupAt, pending: saved.pending, ...patch },
  }));
}

// ---------------- 判斷（純函式，有測試） ----------------

export type Decision = 'upload' | 'ask' | 'nothing';

/**
 * 跟雲端那份比較之後要做什麼：
 * - 雲端沒有 → 傳上去
 * - 雲端那份是別台裝置傳的，而且是我們沒看過的版本 → 問使用者
 * - 其他：有變更、或雲端版本跟我們記得的不同（自己傳的，可能上次沒收到回應）→ 傳上去；都沒有 → 不用做
 */
export function decide(s: Pick<Saved, 'lastRemoteModified' | 'pending' | 'deviceId'>, remote: RemoteMeta | null): Decision {
  if (!remote) return 'upload';
  const unseen = remote.modifiedTime !== s.lastRemoteModified;
  if (unseen && remote.props.deviceId !== s.deviceId) return 'ask';
  return s.pending > 0 || unseen ? 'upload' : 'nothing';
}

/** 首頁提示條要不要出現、用哪種樣子 */
export function barState(c: CloudStatus, now: Date = new Date()): null | 'normal' | 'stale' {
  if (!c.available || !c.linked || c.dismissed || c.pending <= 0) return null;
  if (c.phase !== 'needTap' && c.phase !== 'error') return null;
  const last = c.lastBackupAt ? Date.parse(c.lastBackupAt) : NaN;
  const stale = !Number.isFinite(last) || now.getTime() - last > CLOUD.staleDays * 86400000;
  return stale ? 'stale' : 'normal';
}

// ---------------- 同步 ----------------

/** 從雲端拿回來時資料會整份換掉，這時不算「使用者改了資料」 */
let suppress = false;
/** 雲端有別台的新資料、使用者選了「先不要」：這次使用中不自動上傳，免得蓋掉 */
let held = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | null = null;
let again = false;

const fmtTime = (iso: string | undefined) => {
  if (!iso) return '不知道什麼時候';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '不知道什麼時候';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

async function upload(token: string, remote: RemoteMeta | null) {
  const data = getState().data;
  const startPending = saved.pending;
  const now = new Date().toISOString();
  const meta = await uploadBackup(
    token,
    exportJson(data, 'full'),
    { exportedAt: now, txCount: String(data.transactions.length), deviceId: saved.deviceId },
    remote?.id,
  );
  saved.lastRemoteModified = meta.modifiedTime;
  saved.lastBackupAt = now;
  // 上傳途中又改的，留到下一次
  saved.pending = Math.max(0, saved.pending - startPending);
  persist();
}

async function restore(token: string, remote: RemoteMeta) {
  const parsed = readBackup(await downloadBackup(token, remote.id));
  if (parsed.type !== 'full') throw new Error('雲端那份不是完整備份');
  suppress = true;
  try {
    await replaceData({ ...parsed.data, settings: { ...parsed.data.settings, sample: false } }, 'pre-cloud-restore');
  } finally {
    suppress = false;
  }
  // 篩選條件可能指到已經不存在的帳戶，跟匯入一樣清掉
  setState({
    detail: { accountId: null, categoryId: null, day: null, period: null },
    statsAccountId: null,
    statsPeriod: null,
    statsMode: 'month',
    statsYear: null,
    statsCustom: null,
  });
  saved.lastRemoteModified = remote.modifiedTime;
  saved.lastBackupAt = remote.props.exportedAt ?? remote.modifiedTime;
  saved.pending = 0;
  persist();
}

/** 雲端有別台的版本：問使用者。回傳 true＝處理完了 */
async function askWhich(token: string, remote: RemoteMeta): Promise<boolean> {
  const local = getState().data;
  const sample = local.settings.sample;
  const v = await ask(
    '雲端有另一份備份',
    `雲端：${fmtTime(remote.props.exportedAt ?? remote.modifiedTime)} 備份，${remote.props.txCount ?? '?'} 筆紀錄\n` +
      `這支手機：${sample ? '範例資料' : `${local.transactions.length} 筆紀錄`}\n\n` +
      '要用哪一份？選雲端那份，這支手機的資料會被取代（會先自動存檔一份）。',
    [
      { label: '用雲端那份', value: 'cloud', style: 'primary' },
      { label: '用這支手機的', value: 'local', style: 'secondary' },
      { label: '先不要', value: 'later', style: 'secondary' },
    ],
  );
  if (v === 'cloud') {
    await restore(token, remote);
    showToast('已從雲端拿回資料（原本的已自動存檔）');
    return true;
  }
  if (v === 'local') {
    const ok = await confirmDanger('用這支手機的資料覆蓋雲端？', '雲端那份會被這支手機的資料取代。', '覆蓋雲端');
    if (!ok) return askWhich(token, remote);
    await upload(token, remote);
    showToast('已備份到雲端');
    return true;
  }
  held = true;
  return false;
}

async function syncOnce(interactiveToken?: string) {
  const st = getState();
  if (!saved.linked || !st.ready || st.blocked) return;
  const prov = tokenProvider();
  const token = interactiveToken ?? (await prov.silent());
  if (!token) {
    publish({ phase: 'needTap' });
    return;
  }
  publish({ phase: 'syncing' });
  try {
    const remote = await findBackup(token);
    const d = decide(saved, remote);
    if (d === 'ask') {
      // 使用者選過「先不要」，又不是自己點的 → 不再自動問，等使用者點提示條
      if (held && !interactiveToken) {
        publish({ phase: 'error', message: '雲端有別台的新資料，還沒選要用哪一份' });
        return;
      }
      const done = await askWhich(token, remote!);
      if (!done) {
        publish({ phase: 'error', message: '雲端有別台的新資料，還沒選要用哪一份' });
        return;
      }
      held = false;
    } else if (d === 'upload') {
      await upload(token, remote);
    }
    publish({ phase: 'idle', message: undefined });
  } catch (e) {
    if (e instanceof AuthError) {
      prov.forget();
      publish({ phase: 'needTap' });
    } else if (e instanceof OfflineError) {
      publish({ phase: 'offline' });
    } else {
      console.error('雲端備份失敗', e);
      publish({ phase: 'error', message: e instanceof Error ? e.message : '雲端備份失敗' });
    }
  }
}

/** 同一時間只跑一個；跑的途中又被叫，跑完再補一次 */
function sync(interactiveToken?: string): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = syncOnce(interactiveToken).finally(() => {
    running = null;
    if (again) {
      again = false;
      void sync();
    }
  });
  return running;
}

function schedule() {
  clearTimeout(timer);
  if (held) return;
  timer = setTimeout(() => void sync(), CLOUD.uploadDelayMs);
}

/**
 * 使用者點了（連結按鈕、首頁提示條、立刻備份）：可以跳登入視窗。
 * 一定要在點擊當下直接呼叫，前面不要 await 別的東西（iPhone 才不會擋視窗）。
 */
export async function tapSync(): Promise<void> {
  const prov = tokenProvider();
  let token: string;
  try {
    // 先拿 peek（同步），沒有就馬上 interactive：中間不能有 await
    token = await (prov.peek() ?? prov.interactive());
  } catch (e) {
    if (!(e instanceof CancelledError)) showToast(e instanceof Error ? e.message : '連不上 Google');
    return;
  }
  const first = !saved.linked;
  if (first) {
    saved.linked = true;
    persist();
  }
  await sync(token);
  const c = getState().cloud;
  if (c.phase === 'idle') showToast(first ? '已連結 Google 雲端，之後會自動備份' : '備份好了！');
  else if (c.phase === 'offline') showToast('沒有網路，連上後會自動備份');
  publish({ dismissed: false });
}

/** 設定頁「從雲端拿回來」 */
export async function pullFromCloud(): Promise<void> {
  const prov = tokenProvider();
  let token: string;
  try {
    token = await (prov.peek() ?? prov.interactive());
  } catch (e) {
    if (!(e instanceof CancelledError)) showToast(e instanceof Error ? e.message : '連不上 Google');
    return;
  }
  try {
    const remote = await findBackup(token);
    if (!remote) {
      showToast('雲端還沒有備份');
      return;
    }
    const ok = await confirmDanger(
      '用雲端那份取代這支手機的資料？',
      `雲端：${fmtTime(remote.props.exportedAt ?? remote.modifiedTime)} 備份，${remote.props.txCount ?? '?'} 筆紀錄\n` +
        `這支手機：${getState().data.transactions.length} 筆紀錄\n\n這支手機的資料會先自動存檔一份。`,
      '取代',
    );
    if (!ok) return;
    await restore(token, remote);
    held = false;
    publish({ phase: 'idle', message: undefined });
    showToast('已從雲端拿回資料（原本的已自動存檔）');
  } catch (e) {
    showToast(e instanceof OfflineError ? '沒有網路' : e instanceof AuthError ? '授權過期，請再按一次' : e instanceof Error ? e.message : '拿不回來');
    if (e instanceof AuthError) prov.forget();
  }
}

/** 設定頁「中斷連結」：可選要不要把雲端那份一起刪掉（永久刪除，要再確認） */
export async function unlink(): Promise<void> {
  const v = await ask('中斷 Google 雲端連結？', '這支手機上的資料不會刪除，只是之後不再自動備份。\n雲端那份備份要怎麼處理？', [
    { label: '留著雲端那份', value: 'keep', style: 'primary' },
    { label: '雲端那份也刪除', value: 'delete', style: 'danger' },
    { label: '取消', value: 'no', style: 'secondary' },
  ]);
  if (v !== 'keep' && v !== 'delete') return;
  const prov = tokenProvider();
  let token = prov.peek();
  if (v === 'delete') {
    if (!(await confirmDanger('真的要刪除雲端那份？', '雲端的備份刪除後無法復原。這支手機上的資料不受影響。', '確定刪除'))) return;
    try {
      // 前面跳過確認視窗，已經不是點擊當下：網頁版授權過期的話視窗可能被擋，會提示再點一次
      token = token ?? (await prov.silent()) ?? (await prov.interactive());
      const remote = await findBackup(token);
      if (remote) await deleteBackup(token, remote.id);
    } catch (e) {
      if (!(e instanceof CancelledError)) showToast(`刪不了雲端那份：${e instanceof OfflineError ? '沒有網路' : e instanceof Error ? e.message : '請再試一次'}（連結先不中斷）`);
      return;
    }
  }
  if (token) await revokeToken(token);
  prov.forget();
  clearTimeout(timer);
  held = false;
  saved = { ...saved, linked: false, lastBackupAt: null, lastRemoteModified: null, pending: 0 };
  persist();
  publish({ phase: 'idle', message: undefined, dismissed: false });
  showToast(v === 'delete' ? '已中斷連結，雲端那份已刪除' : '已中斷連結');
}

/** 首頁提示條的叉叉：這次先不提醒 */
export const dismissBar = () => publish({ dismissed: true });

// ---------------- 啟動 ----------------

let installed = false;
/** main.tsx 呼叫一次：開始監聽資料變動、前景切換、網路恢復 */
export async function installCloudSync(): Promise<void> {
  if (installed) return;
  installed = true;
  saved = load();
  persist();
  const available = cloudAvailable();
  publish({ available });
  if (!available) return;
  if (saved.linked) (tokenProvider()).prepare();

  let last = getState().ready ? getState().data : null;
  let wasReady = getState().ready && !getState().blocked;
  subscribeState(() => {
    const st = getState();
    const ok = st.ready && !st.blocked;
    if (!ok) {
      wasReady = false;
      return;
    }
    if (!wasReady) {
      // 剛讀完資料：不算變更，順便檢查一次雲端
      wasReady = true;
      last = st.data;
      if (saved.linked) void sync();
      return;
    }
    if (st.data === last) return;
    last = st.data;
    if (suppress || !saved.linked) return;
    saved.pending++;
    persist();
    publish();
    schedule();
  });
  if (wasReady && saved.linked) void sync();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && saved.linked) void sync();
  });
  window.addEventListener('online', () => {
    if (saved.linked) void sync();
  });
}
