// 3.5 雲端備份：跟 Google 雲端（Drive）溝通的部分。
// 只碰「App 專用隱藏區」（appDataFolder）裡的一個檔案：備份檔，內容跟「匯出完整備份」一樣。
// 檔案的 appProperties 另外記：匯出時間、紀錄筆數、哪一台裝置上傳的（給「要用哪一份」的對話框用）。
import { CLOUD } from '../config';

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FIELDS = 'id,modifiedTime,appProperties';

export interface RemoteProps {
  exportedAt?: string;
  txCount?: string;
  deviceId?: string;
}
export interface RemoteMeta {
  id: string;
  modifiedTime: string;
  props: RemoteProps;
}

/** 授權過期或被收回：要重新連結 */
export class AuthError extends Error {
  constructor() {
    super('雲端授權過期');
  }
}
/** 沒網路（連不到 Google） */
export class OfflineError extends Error {
  constructor() {
    super('沒有網路');
  }
}

type Fetch = typeof fetch;
let fetcher: Fetch = (...a) => fetch(...a);
/** 測試用：換掉 fetch */
export const setFetch = (f: Fetch) => {
  fetcher = f;
};

async function call(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  let r: Response;
  try {
    r = await fetcher(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } });
  } catch {
    throw new OfflineError();
  }
  // 401＝授權過期；403 可能是權限被收回（也可能是其他原因，一律當作要重新連結比較保險）
  if (r.status === 401 || r.status === 403) throw new AuthError();
  if (!r.ok) throw new Error(`雲端回應錯誤（${r.status}）`);
  return r;
}

const toMeta = (j: { id: string; modifiedTime: string; appProperties?: RemoteProps }): RemoteMeta => ({
  id: j.id,
  modifiedTime: j.modifiedTime,
  props: j.appProperties ?? {},
});

/** 找雲端上的備份檔；沒有＝null。萬一有好幾份（極少見），用最新的那份 */
export async function findBackup(token: string): Promise<RemoteMeta | null> {
  const q = encodeURIComponent(`name='${CLOUD.fileName}' and trashed=false`);
  const r = await call(token, `${API}?spaces=appDataFolder&q=${q}&orderBy=modifiedTime%20desc&pageSize=5&fields=files(${FIELDS})`);
  const j = (await r.json()) as { files?: { id: string; modifiedTime: string; appProperties?: RemoteProps }[] };
  const f = j.files?.[0];
  return f ? toMeta(f) : null;
}

export async function downloadBackup(token: string, id: string): Promise<string> {
  const r = await call(token, `${API}/${encodeURIComponent(id)}?alt=media`);
  return r.text();
}

/** 上傳：existingId 有給＝覆蓋那份，沒給＝新建一份 */
export async function uploadBackup(token: string, text: string, props: RemoteProps, existingId?: string | null): Promise<RemoteMeta> {
  const boundary = 'tuotuo' + Math.random().toString(36).slice(2);
  const meta: Record<string, unknown> = { appProperties: props };
  if (!existingId) {
    meta.name = CLOUD.fileName;
    meta.parents = ['appDataFolder'];
  }
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${text}\r\n--${boundary}--`;
  const url = existingId
    ? `${UPLOAD}/${encodeURIComponent(existingId)}?uploadType=multipart&fields=${FIELDS}`
    : `${UPLOAD}?uploadType=multipart&fields=${FIELDS}`;
  const r = await call(token, url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return toMeta(await r.json());
}

/** 刪掉雲端那份（中斷連結時使用者選「一起刪除」） */
export async function deleteBackup(token: string, id: string): Promise<void> {
  await call(token, `${API}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** 收回授權（中斷連結）。失敗就算了：本機的狀態照樣清掉 */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetcher(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  } catch {
    /* 沒網路也沒關係 */
  }
}
