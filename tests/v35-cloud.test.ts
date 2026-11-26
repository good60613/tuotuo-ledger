// 3.5 雲端備份：判斷規則、提示條、跟 Google 雲端溝通的格式
import { afterEach, describe, expect, it } from 'vitest';
import { decide, barState } from '../src/cloud/sync';
import { findBackup, uploadBackup, setFetch, AuthError, OfflineError, type RemoteMeta } from '../src/cloud/drive';
import type { CloudStatus } from '../src/store';
import { exportJson, readBackup } from '../src/data/backup';
import { sampleData } from '../src/data/seed';

const remote = (modifiedTime: string, deviceId?: string): RemoteMeta => ({ id: 'f1', modifiedTime, props: { deviceId, txCount: '3' } });
const me = { deviceId: 'me', lastRemoteModified: '2026-11-26T01:00:00Z', pending: 0 };

describe('要做什麼（decide）', () => {
  it('雲端沒有 → 傳上去', () => {
    expect(decide(me, null)).toBe('upload');
  });
  it('雲端是別台傳的新版本 → 一定先問，不自動蓋', () => {
    expect(decide(me, remote('2026-11-26T02:00:00Z', 'other'))).toBe('ask');
    expect(decide({ ...me, pending: 5 }, remote('2026-11-26T02:00:00Z', 'other'))).toBe('ask');
  });
  it('這支手機第一次連結、雲端已經有一份 → 問', () => {
    expect(decide({ ...me, lastRemoteModified: null }, remote('2026-11-26T02:00:00Z', 'other'))).toBe('ask');
  });
  it('雲端是自己上次傳的、沒有變更 → 不用做', () => {
    expect(decide(me, remote(me.lastRemoteModified, 'me'))).toBe('nothing');
  });
  it('雲端是自己傳的、有變更 → 傳上去', () => {
    expect(decide({ ...me, pending: 2 }, remote(me.lastRemoteModified, 'me'))).toBe('upload');
  });
  it('雲端是自己傳的但時間對不上（上次沒收到回應）→ 傳上去，不問', () => {
    expect(decide(me, remote('2026-11-26T03:00:00Z', 'me'))).toBe('upload');
  });
});

const base: CloudStatus = { available: true, linked: true, phase: 'needTap', lastBackupAt: new Date().toISOString(), pending: 2, dismissed: false };

describe('首頁提示條（barState）', () => {
  it('授權過期＋有變更 → 出現', () => {
    expect(barState(base)).toBe('normal');
  });
  it('沒有變更、沒連結、按過叉叉、正常狀態、沒網路 → 不出現', () => {
    expect(barState({ ...base, pending: 0 })).toBeNull();
    expect(barState({ ...base, linked: false })).toBeNull();
    expect(barState({ ...base, dismissed: true })).toBeNull();
    expect(barState({ ...base, phase: 'idle' })).toBeNull();
    expect(barState({ ...base, phase: 'offline' })).toBeNull();
    expect(barState({ ...base, available: false })).toBeNull();
  });
  it('超過 3 天沒備份 → 顯眼樣式', () => {
    const now = new Date('2026-11-26T12:00:00Z');
    expect(barState({ ...base, lastBackupAt: '2026-11-22T12:00:00Z' }, now)).toBe('stale');
    expect(barState({ ...base, lastBackupAt: '2026-11-25T12:00:00Z' }, now)).toBe('normal');
    expect(barState({ ...base, lastBackupAt: null }, now)).toBe('stale');
  });
});

describe('跟 Google 雲端溝通', () => {
  afterEach(() => setFetch((...a) => fetch(...a)));

  it('只找 App 專用隱藏區，回傳最新那份', async () => {
    let url = '';
    setFetch((async (u: string) => {
      url = u;
      return new Response(JSON.stringify({ files: [{ id: 'a', modifiedTime: 't', appProperties: { txCount: '9' } }] }), { status: 200 });
    }) as typeof fetch);
    const r = await findBackup('tok');
    expect(url).toContain('spaces=appDataFolder');
    expect(r).toEqual({ id: 'a', modifiedTime: 't', props: { txCount: '9' } });
  });

  it('上傳的內容就是完整備份，讀回來資料一樣', async () => {
    const d = sampleData();
    const text = exportJson(d, 'full');
    let body = '';
    let method = '';
    setFetch((async (_u: string, init: RequestInit) => {
      body = String(init.body);
      method = String(init.method);
      return new Response(JSON.stringify({ id: 'new', modifiedTime: 'm' }), { status: 200 });
    }) as typeof fetch);
    await uploadBackup('tok', text, { deviceId: 'me' }, null);
    expect(method).toBe('POST');
    expect(body).toContain('"parents":["appDataFolder"]');
    const part = body.split('\r\n\r\n')[2].split('\r\n--')[0];
    expect(readBackup(part)).toEqual(readBackup(text));
    // 已經有檔案：覆蓋那份，不另建
    await uploadBackup('tok', text, {}, 'old');
    expect(method).toBe('PATCH');
    expect(body).not.toContain('appDataFolder');
  });

  it('授權過期 → AuthError；沒網路 → OfflineError', async () => {
    setFetch((async () => new Response('', { status: 401 })) as typeof fetch);
    await expect(findBackup('tok')).rejects.toBeInstanceOf(AuthError);
    setFetch((async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch);
    await expect(findBackup('tok')).rejects.toBeInstanceOf(OfflineError);
  });
});
