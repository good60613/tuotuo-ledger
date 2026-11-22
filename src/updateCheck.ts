// 3.3 更新檢查（純邏輯，可測試）：問 GitHub 最新的 Release，跟目前安裝的版本比。
// 網路呼叫用可注入的 fetch；失敗（沒網路、逾時、限流、格式怪）一律當作「查不到」，不丟錯。
// 不帶任何使用者資料、不帶 token。畫面接線在 updateFlow.ts。
import { UPDATE } from './config';

export interface ReleaseInfo {
  /** 版本號（去掉 v），例如 3.3.0 */
  version: string;
  /** 原始 tag，例如 v3.3.0 */
  tag: string;
  /** Release 說明（已截短，可直接放進對話框） */
  notes: string;
  /** 〔下載更新〕要開的網址：第一個 .apk 資產的下載網址；沒有就是 Release 網頁 */
  url: string;
}

export type CheckResult =
  | { status: 'newer'; release: ReleaseInfo }
  | { status: 'latest'; release: ReleaseInfo }
  | { status: 'error' };

/** 版本字串 → 數字陣列。接受 3.3.0、v3.3.0（2～4 段）；其他格式回傳 null */
export function parseVersion(s: unknown): number[] | null {
  if (typeof s !== 'string') return null;
  const m = /^v?(\d+(?:\.\d+){1,3})$/.exec(s.trim());
  if (!m) return null;
  return m[1].split('.').map(Number);
}

/** 逐段用數字比（3.10.0 > 3.9.0；缺的段當 0）。任一邊格式不合法回傳 null */
export function compareVersions(a: string, b: string): number | null {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** latest 是否比 current 新；任一邊格式不合法＝不算新版 */
export function isNewer(latest: string, current: string): boolean {
  return compareVersions(latest, current) === 1;
}

/** Release 說明：取前幾行、截斷到指定字數（超過加「…」） */
export function trimNotes(body: unknown, maxLines: number = UPDATE.notesMaxLines, maxChars: number = UPDATE.notesMaxChars): string {
  if (typeof body !== 'string') return '';
  const lines = body.replace(/\r\n?/g, '\n').split('\n').slice(0, maxLines).join('\n').trim();
  return lines.length > maxChars ? lines.slice(0, maxChars).trimEnd() + '…' : lines;
}

/** GitHub「latest release」回傳的 JSON → ReleaseInfo；tag 格式不合法或缺網址回傳 null */
export function parseRelease(json: unknown): ReleaseInfo | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  const tag = j.tag_name;
  const parsed = parseVersion(tag);
  if (typeof tag !== 'string' || !parsed) return null;
  const version = parsed.join('.');
  const assets = Array.isArray(j.assets) ? j.assets : [];
  let apk: string | undefined;
  for (const a of assets) {
    const o = a as Record<string, unknown> | null;
    const name = o && typeof o.name === 'string' ? o.name : '';
    const url = o && typeof o.browser_download_url === 'string' ? o.browser_download_url : '';
    if (url && name.toLowerCase().endsWith('.apk')) {
      apk = url;
      break;
    }
  }
  const page = typeof j.html_url === 'string' ? j.html_url : '';
  const url = apk ?? page;
  if (!url) return null;
  return { version, tag, notes: trimNotes(j.body), url };
}

/** 問 GitHub 最新 Release。fetchFn 可注入（測試用）；逾時、非 200、格式錯都回傳 null */
export async function fetchLatestRelease(
  fetchFn: typeof fetch,
  repo: string = UPDATE.repo,
  timeoutMs: number = UPDATE.timeoutMs,
): Promise<ReleaseInfo | null> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        ctrl?.abort();
        resolve(null);
      }, timeoutMs);
    });
    const job = (async () => {
      const res = await fetchFn(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: ctrl?.signal,
      });
      if (!res.ok) return null;
      return parseRelease(await res.json());
    })();
    // 就算注入的 fetch 不理 signal，逾時也會先回傳
    return await Promise.race([job, timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 查更新：newer＝有新版、latest＝已是最新、error＝查不到（任何失敗都在這） */
export async function checkLatest(currentVersion: string, fetchFn: typeof fetch): Promise<CheckResult> {
  const release = await fetchLatestRelease(fetchFn);
  if (!release) return { status: 'error' };
  return isNewer(release.version, currentVersion) ? { status: 'newer', release } : { status: 'latest', release };
}

// ===== 略過清單與上次檢查時間（localStorage；全部 try/catch，讀寫失敗當作沒有） =====

export const SKIP_KEY = 'tt-update-skip';
export const LAST_KEY = 'tt-update-last';

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const defaultStore = (): Store | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

/** 已略過的版本清單（存成 JSON 陣列，例如 ["3.3.0"]） */
export function readSkipList(store: Store | null = defaultStore()): string[] {
  try {
    const raw = store?.getItem(SKIP_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** 這個版本是否在略過清單（用數字比，"v3.3.0" 與 "3.3.0" 視為同一版） */
export function isSkipped(version: string, store: Store | null = defaultStore()): boolean {
  return readSkipList(store).some((v) => compareVersions(v, version) === 0);
}

export function addSkip(version: string, store: Store | null = defaultStore()): void {
  try {
    if (!store || isSkipped(version, store)) return;
    store.setItem(SKIP_KEY, JSON.stringify([...readSkipList(store), version]));
  } catch { /* ignore */ }
}

export function readLastCheck(store: Store | null = defaultStore()): number | null {
  try {
    const n = Number(store?.getItem(LAST_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function writeLastCheck(now: number, store: Store | null = defaultStore()): void {
  try {
    store?.setItem(LAST_KEY, String(now));
  } catch { /* ignore */ }
}

/** 距離上次檢查是否已超過 minHours 小時（從沒查過、時間怪異＝該查） */
export function shouldCheckNow(last: number | null, now: number, minHours: number = UPDATE.minHoursBetween): boolean {
  if (last === null) return true;
  const elapsed = now - last;
  if (elapsed < 0) return true; // 手機時間被往前調：寧可多查一次
  return elapsed >= minHours * 3600 * 1000;
}
