// 3.3 更新檢查：版本比較、Release 解析、略過清單、距離上次檢查、fetch 失敗
import { describe, expect, it } from 'vitest';
import {
  parseVersion,
  compareVersions,
  isNewer,
  trimNotes,
  parseRelease,
  fetchLatestRelease,
  checkLatest,
  readSkipList,
  isSkipped,
  addSkip,
  readLastCheck,
  writeLastCheck,
  shouldCheckNow,
  SKIP_KEY,
  LAST_KEY,
} from '../src/updateCheck';

/** 測試用的假 localStorage */
function fakeStore(init: Record<string, string> = {}, broken = false) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => {
      if (broken) throw new Error('denied');
      return m.has(k) ? m.get(k)! : null;
    },
    setItem: (k: string, v: string) => {
      if (broken) throw new Error('denied');
      m.set(k, v);
    },
  };
}

const releaseJson = (over: Record<string, unknown> = {}) => ({
  tag_name: 'v3.3.0',
  html_url: 'https://github.com/good60613/tuotuo-ledger/releases/tag/v3.3.0',
  body: '第一行\n第二行',
  assets: [
    { name: 'notes.txt', browser_download_url: 'https://example.com/notes.txt' },
    { name: 'tuotuo-ledger-3.3.0.apk', browser_download_url: 'https://example.com/a.apk' },
    { name: 'other.apk', browser_download_url: 'https://example.com/b.apk' },
  ],
  ...over,
});

const okFetch = (json: unknown, status = 200) =>
  (async () => ({ ok: status >= 200 && status < 300, status, json: async () => json })) as unknown as typeof fetch;

describe('版本比較', () => {
  it('逐段用數字比，3.10.0 大於 3.9.0', () => {
    expect(compareVersions('3.10.0', '3.9.0')).toBe(1);
    expect(compareVersions('3.9.0', '3.10.0')).toBe(-1);
    expect(compareVersions('3.3.0', '3.3.0')).toBe(0);
    expect(compareVersions('v3.3.0', '3.3.0')).toBe(0);
    expect(compareVersions('3.3', '3.3.0')).toBe(0);
    expect(compareVersions('3.3.1', '3.3')).toBe(1);
  });
  it('非法格式視為無新版', () => {
    expect(parseVersion('latest')).toBeNull();
    expect(parseVersion('v3.x.0')).toBeNull();
    expect(parseVersion('3')).toBeNull();
    expect(parseVersion('3.3.0-beta')).toBeNull();
    expect(parseVersion(undefined)).toBeNull();
    expect(compareVersions('abc', '3.0.0')).toBeNull();
    expect(isNewer('abc', '3.0.0')).toBe(false);
    expect(isNewer('3.3.0', 'abc')).toBe(false);
  });
  it('isNewer：只有真的比較新才算', () => {
    expect(isNewer('3.3.0', '3.1.0')).toBe(true);
    expect(isNewer('3.1.0', '3.1.0')).toBe(false);
    expect(isNewer('3.0.9', '3.1.0')).toBe(false);
  });
});

describe('Release 說明截短', () => {
  it('只取前 10 行', () => {
    const body = Array.from({ length: 15 }, (_, i) => `行${i + 1}`).join('\n');
    const out = trimNotes(body);
    expect(out.split('\n')).toHaveLength(10);
    expect(out.endsWith('行10')).toBe(true);
  });
  it('超過 400 字截斷並加「…」', () => {
    const out = trimNotes('字'.repeat(500));
    expect(out.length).toBe(401);
    expect(out.endsWith('…')).toBe(true);
  });
  it('不是字串＝空字串；CRLF 也能分行', () => {
    expect(trimNotes(null)).toBe('');
    expect(trimNotes('a\r\nb')).toBe('a\nb');
  });
});

describe('Release JSON 解析', () => {
  it('有 apk 資產：下載網址用第一個 .apk', () => {
    const r = parseRelease(releaseJson());
    expect(r).toEqual({
      version: '3.3.0',
      tag: 'v3.3.0',
      notes: '第一行\n第二行',
      url: 'https://example.com/a.apk',
    });
  });
  it('沒有 apk 資產：改用 Release 網頁', () => {
    const r = parseRelease(releaseJson({ assets: [{ name: 'x.zip', browser_download_url: 'https://example.com/x.zip' }] }));
    expect(r?.url).toBe('https://github.com/good60613/tuotuo-ledger/releases/tag/v3.3.0');
    expect(parseRelease(releaseJson({ assets: undefined }))?.url).toContain('/releases/tag/');
  });
  it('tag 不合法、缺網址、不是物件＝null', () => {
    expect(parseRelease(releaseJson({ tag_name: 'nightly' }))).toBeNull();
    expect(parseRelease(releaseJson({ assets: [], html_url: undefined }))).toBeNull();
    expect(parseRelease(null)).toBeNull();
    expect(parseRelease('x')).toBeNull();
  });
});

describe('略過清單', () => {
  it('加入後該版本被略過，其他版本不受影響', () => {
    const st = fakeStore();
    expect(isSkipped('3.3.0', st)).toBe(false);
    addSkip('3.3.0', st);
    expect(isSkipped('3.3.0', st)).toBe(true);
    expect(isSkipped('v3.3.0', st)).toBe(true);
    expect(isSkipped('3.4.0', st)).toBe(false);
    addSkip('3.3.0', st); // 重複加不會變兩筆
    expect(readSkipList(st)).toEqual(['3.3.0']);
  });
  it('存的內容壞掉、localStorage 不能用＝當作沒有，不丟錯', () => {
    expect(readSkipList(fakeStore({ [SKIP_KEY]: '{壞' }))).toEqual([]);
    expect(readSkipList(fakeStore({ [SKIP_KEY]: '"abc"' }))).toEqual([]);
    expect(readSkipList(fakeStore({}, true))).toEqual([]);
    expect(() => addSkip('3.3.0', fakeStore({}, true))).not.toThrow();
    expect(isSkipped('3.3.0', null)).toBe(false);
  });
});

describe('距離上次檢查', () => {
  const H = 3600 * 1000;
  it('不到 20 小時不查，滿 20 小時才查', () => {
    const now = 1_000_000_000_000;
    expect(shouldCheckNow(now - 19 * H, now, 20)).toBe(false);
    expect(shouldCheckNow(now - 20 * H, now, 20)).toBe(true);
    expect(shouldCheckNow(now - 48 * H, now, 20)).toBe(true);
  });
  it('從沒查過、或手機時間被往前調＝該查', () => {
    expect(shouldCheckNow(null, Date.now(), 20)).toBe(true);
    expect(shouldCheckNow(Date.now() + 5 * H, Date.now(), 20)).toBe(true);
  });
  it('讀寫上次檢查時間；壞值當作沒查過', () => {
    const st = fakeStore();
    expect(readLastCheck(st)).toBeNull();
    writeLastCheck(12345, st);
    expect(readLastCheck(st)).toBe(12345);
    expect(readLastCheck(fakeStore({ [LAST_KEY]: 'abc' }))).toBeNull();
    expect(readLastCheck(fakeStore({}, true))).toBeNull();
    expect(() => writeLastCheck(1, fakeStore({}, true))).not.toThrow();
  });
});

describe('連線', () => {
  it('查到新版／已是最新', async () => {
    const f = okFetch(releaseJson());
    expect((await checkLatest('3.1.0', f)).status).toBe('newer');
    expect((await checkLatest('3.3.0', f)).status).toBe('latest');
    expect((await checkLatest('3.10.0', f)).status).toBe('latest');
  });
  it('請求網址是公開的 latest release，且不帶 token', async () => {
    let url = '';
    let init: RequestInit | undefined;
    const f = (async (u: string, i?: RequestInit) => {
      url = u;
      init = i;
      return { ok: true, status: 200, json: async () => releaseJson() };
    }) as unknown as typeof fetch;
    await fetchLatestRelease(f, 'a/b', 1000);
    expect(url).toBe('https://api.github.com/repos/a/b/releases/latest');
    expect(JSON.stringify(init?.headers ?? {})).not.toMatch(/authorization|token/i);
  });
  it('fetch 丟錯、限流(403)、找不到(404)、格式錯、JSON 壞掉＝查不到（無新版）', async () => {
    const boom = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await checkLatest('3.1.0', boom)).toEqual({ status: 'error' });
    expect(await checkLatest('3.1.0', okFetch({ message: 'rate limit' }, 403))).toEqual({ status: 'error' });
    expect(await checkLatest('3.1.0', okFetch({}, 404))).toEqual({ status: 'error' });
    expect(await checkLatest('3.1.0', okFetch({ tag_name: 'abc', html_url: 'x' }))).toEqual({ status: 'error' });
    const badJson = (async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('bad json');
      },
    })) as unknown as typeof fetch;
    expect(await checkLatest('3.1.0', badJson)).toEqual({ status: 'error' });
  });
  it('逾時（fetch 永遠不回）＝查不到', async () => {
    const hang = (() => new Promise(() => {})) as unknown as typeof fetch;
    expect(await fetchLatestRelease(hang, 'a/b', 30)).toBeNull();
  });
});
