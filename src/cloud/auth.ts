// 3.5 雲端備份：拿 Google 的授權（access token，大約一小時有效）。
//
// - APK 版：用 Android 內建的 Google 授權（原生外掛 CloudAuth，見 android/.../CloudAuthPlugin.java）。
//   使用者同意過一次之後，背景就能自己拿到新的授權，不用點。
// - 網頁版：用 Google 的網頁登入元件（Google Identity Services）。網頁版沒有伺服器，
//   授權過期後一定要使用者「點一下」才能叫出登入視窗（iPhone 規定視窗只能由點擊叫出），
//   所以 silent() 只會拿還沒過期的那張；過期了由首頁提示條請使用者點。
import { Capacitor, registerPlugin } from '@capacitor/core';
import { CLOUD } from '../config';

export interface TokenProvider {
  /** 手上還沒過期的那張（同步，不等任何東西）；沒有＝null */
  peek(): string | null;
  /** 不打擾使用者能拿到就拿；拿不到＝null */
  silent(): Promise<string | null>;
  /** 使用者點了按鈕：可以跳出同意／登入畫面（APK 版同意過就直接拿到，不跳）。使用者取消會丟錯。
   *  網頁版一定要在點擊當下直接呼叫，前面不能 await 別的東西，iPhone 才不會擋視窗。 */
  interactive(): Promise<string>;
  /** 忘掉手上的授權（中斷連結用） */
  forget(): void;
  /** 先把要用的東西載好（網頁版：登入元件要先載好，點擊當下才能馬上開視窗） */
  prepare(): void;
}

/** 使用者自己關掉登入視窗或按取消 */
export class CancelledError extends Error {
  constructor() {
    super('已取消');
  }
}

// ---------------- 授權暫存（兩版共用） ----------------

const TOKEN_KEY = 'tt-cloud-token';
interface Cached {
  token: string;
  /** 過期時間（毫秒） */
  exp: number;
}
function readCached(): string | null {
  try {
    const c = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as Cached | null;
    if (c && c.exp - CLOUD.tokenSkewMs > Date.now()) return c.token;
  } catch {
    /* 壞掉就當作沒有 */
  }
  return null;
}
function writeCached(token: string, expiresInSec: number) {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp: Date.now() + expiresInSec * 1000 }));
  } catch {
    /* 存不了就每次重拿 */
  }
}
function clearCached() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
/** 目前手上那張（中斷連結時拿去收回） */
export const cachedToken = readCached;

// ---------------- APK 版 ----------------

interface CloudAuthPlugin {
  /** interactive=false：只在背景試，需要使用者同意時丟錯 NEED_INTERACTION */
  authorize(opts: { scope: string; interactive: boolean }): Promise<{ accessToken: string }>;
}
const CloudAuth = registerPlugin<CloudAuthPlugin>('CloudAuth');

const nativeProvider: TokenProvider = {
  peek: readCached,
  async silent() {
    const c = readCached();
    if (c) return c;
    try {
      const r = await CloudAuth.authorize({ scope: CLOUD.scope, interactive: false });
      // Android 沒告訴我們剩多久，保守當作 50 分鐘
      writeCached(r.accessToken, 50 * 60);
      return r.accessToken;
    } catch {
      return null;
    }
  },
  async interactive() {
    try {
      const r = await CloudAuth.authorize({ scope: CLOUD.scope, interactive: true });
      writeCached(r.accessToken, 50 * 60);
      return r.accessToken;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/cancel/i.test(msg)) throw new CancelledError();
      throw e;
    }
  },
  forget: clearCached,
  prepare() {},
};

// ---------------- 網頁版 ----------------

interface GisTokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
}
interface GisTokenClient {
  requestAccessToken(o?: { prompt?: string }): void;
}
interface Gis {
  accounts: {
    oauth2: {
      initTokenClient(o: {
        client_id: string;
        scope: string;
        callback: (r: GisTokenResponse) => void;
        error_callback?: (e: { type?: string }) => void;
      }): GisTokenClient;
    };
  };
}

let gisPromise: Promise<Gis> | null = null;
function loadGis(): Promise<Gis> {
  const w = window as unknown as { google?: Gis };
  if (w.google?.accounts?.oauth2) return Promise.resolve(w.google);
  return (gisPromise ??= new Promise<Gis>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (w.google ? resolve(w.google) : reject(new Error('Google 登入元件載入失敗')));
    s.onerror = () => {
      gisPromise = null;
      reject(new Error('連不到 Google（沒有網路？）'));
    };
    document.head.appendChild(s);
  }));
}

let gis: Gis | null = null;
/** 這一次授權的接收處（同一時間只會有一個） */
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;
let client: GisTokenClient | null = null;

function getClient(g: Gis): GisTokenClient {
  return (client ??= g.accounts.oauth2.initTokenClient({
    client_id: CLOUD.webClientId,
    scope: CLOUD.scope,
    callback: (r) => {
      const p = pending;
      pending = null;
      if (!p) return;
      if (r.access_token) {
        writeCached(r.access_token, Number(r.expires_in) || 3600);
        p.resolve(r.access_token);
      } else p.reject(r.error === 'access_denied' ? new CancelledError() : new Error('Google 沒有給授權'));
    },
    error_callback: (e) => {
      const p = pending;
      pending = null;
      // popup_closed＝使用者關掉視窗；popup_failed_to_open＝被擋（通常是沒在點擊當下開）
      p?.reject(e.type === 'popup_failed_to_open' ? new Error('登入視窗被擋住了，請再點一次') : new CancelledError());
    },
  }));
}

const webProvider: TokenProvider = {
  peek: readCached,
  async silent() {
    return readCached();
  },
  interactive() {
    return new Promise<string>((resolve, reject) => {
      const start = (g: Gis) => {
        pending?.reject(new CancelledError());
        pending = { resolve, reject };
        // prompt 空字串：同意過就不再問，只選帳號（或直接過）
        getClient(g).requestAccessToken({ prompt: '' });
      };
      // 登入元件已經載好：在點擊當下同步開視窗（iPhone 才不會擋）
      if (gis) return start(gis);
      loadGis()
        .then((g) => {
          gis = g;
          start(g);
        })
        .catch(reject);
    });
  },
  forget: clearCached,
  prepare() {
    if (gis || !CLOUD.webClientId) return;
    loadGis()
      .then((g) => {
        gis = g;
      })
      .catch(() => undefined);
  },
};

/** 同步取得（點擊當下要能馬上用） */
export function tokenProvider(): TokenProvider {
  return Capacitor.isNativePlatform() ? nativeProvider : webProvider;
}

/** 這一版能不能用雲端備份：APK 一律可以；網頁版要填了網頁用戶端 ID */
export function cloudAvailable(): boolean {
  return Capacitor.isNativePlatform() || !!CLOUD.webClientId;
}
