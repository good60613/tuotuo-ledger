// 開啟 App 時讀資料、保護資料（2.0 修正批，PK 2026-11-10 定案）。
//
// 規則：
// - 手機上本來就沒有資料（第一次使用）→ 載入範例並存檔，照舊。
//   但如果沒有主資料、卻有自動留底（代表資料被清掉了，不是第一次用）→ 進保護狀態，讓 PK 選要不要還原。
// - 讀取失敗、資料升級失敗、資料版本比 App 新 → 進「保護狀態」：絕不寫入、絕不用範例蓋掉。
// - 資料版本比 App 舊、要升級 → 升級前先把原樣留一份。
// - 正常讀到 → 每天第一次開啟時留一份每日留底。
//
// 讀寫都經過 Storage 介面（實際是 storage.ts；測試用記憶體假的），所以可以模擬各種失敗。
import type { AppData } from './types';
import { DATA_VERSION } from './types';
import { migrate } from './migrate';
import { sampleData } from './seed';
import { hasDailyFor, makeSnapshot, prunePlan, type Snapshot, type SnapshotMeta, type SnapshotReason } from './snapshots';

export interface Storage {
  /** 讀出手機上的原始資料（不升級）；沒有＝null */
  loadRaw(): Promise<unknown>;
  saveData(d: AppData): Promise<void>;
  /** 寫入鎖：鎖住時 saveData 一律失敗（保護狀態用） */
  setWriteLock(locked: boolean): void;
  listSnapshots(): Promise<SnapshotMeta[]>;
  getSnapshot(id: string): Promise<Snapshot | undefined>;
  addSnapshot(s: Snapshot): Promise<void>;
  deleteSnapshots(ids: string[]): Promise<void>;
}

export type BlockReason = 'read' | 'upgrade' | 'newer' | 'missing';

export type BootResult =
  | { kind: 'ok'; data: AppData; firstRun: boolean; warnings: string[] }
  | { kind: 'blocked'; reason: BlockReason; message: string; raw: unknown };

const newId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** 留一份，並刪掉超過份數的舊留底 */
export async function takeSnapshot(st: Storage, raw: unknown, reason: SnapshotReason, now: Date = new Date(), id = newId()): Promise<void> {
  await st.addSnapshot(makeSnapshot(raw, reason, now, id));
  const extra = prunePlan(await st.listSnapshots());
  if (extra.length) await st.deleteSnapshots(extra);
}

/** 今天還沒有每日留底就留一份 */
export async function ensureDailySnapshot(st: Storage, data: AppData, now: Date = new Date()): Promise<boolean> {
  if (hasDailyFor(await st.listSnapshots(), now)) return false;
  await takeSnapshot(st, data, 'daily', now);
  return true;
}

function blocked(st: Storage, reason: BlockReason, message: string, raw: unknown): BootResult {
  st.setWriteLock(true);
  return { kind: 'blocked', reason, message, raw };
}

export async function boot(st: Storage, now: Date = new Date()): Promise<BootResult> {
  st.setWriteLock(true);
  let raw: unknown;
  try {
    raw = await st.loadRaw();
  } catch (e) {
    return blocked(st, 'read', `讀不到手機上的帳本資料（${errText(e)}）。`, undefined);
  }

  const warnings: string[] = [];
  if (raw === null || raw === undefined) {
    let snaps: SnapshotMeta[] = [];
    try {
      snaps = await st.listSnapshots();
    } catch { /* 留底也讀不到：當成第一次使用 */ }
    if (snaps.length > 0) return blocked(st, 'missing', '手機上找不到帳本資料，但有自動留底。', raw);
    const data = sampleData(now);
    // 3.0：只有真的第一次安裝才自動出現新手教學（舊使用者的資料沒有這欄＝不出現）
    data.settings.tutorial = 'pending';
    st.setWriteLock(false);
    try {
      await st.saveData(data);
    } catch {
      warnings.push('無法存檔，這次的變更可能不會保存');
    }
    return { kind: 'ok', data, firstRun: true, warnings };
  }

  const version = (raw as { version?: unknown })?.version;
  if (typeof version === 'number' && version > DATA_VERSION) {
    return blocked(st, 'newer', `手機上的帳本是比較新的 App 存的（資料版本 ${version}，這個 App 只認得到 ${DATA_VERSION}）。`, raw);
  }

  const needUpgrade = typeof version === 'number' && version < DATA_VERSION;
  if (needUpgrade) {
    try {
      await takeSnapshot(st, raw, 'pre-upgrade', now);
    } catch {
      warnings.push('升級前的自動留底沒有成功');
    }
  }

  let data: AppData;
  try {
    data = migrate(raw);
  } catch (e) {
    return blocked(st, 'upgrade', `帳本資料升級失敗（${errText(e)}）。原本的資料沒有被改動。`, raw);
  }

  st.setWriteLock(false);
  if (needUpgrade) {
    try {
      await st.saveData(data);
    } catch {
      warnings.push('升級後的資料沒有存成功，下次開啟會再升級一次');
    }
  }
  try {
    await ensureDailySnapshot(st, data, now);
  } catch {
    warnings.push('今天的自動留底沒有成功');
  }
  return { kind: 'ok', data, firstRun: false, warnings };
}

/**
 * 整份取代（匯入完整備份、匯入設定、清空、載入範例、還原留底）：先把目前資料留一份，再存新資料。
 * 留底失敗就不取代（丟錯），避免「蓋掉了卻沒有留底」。current 是 null／undefined（讀不到）時不留。
 */
export async function replaceWithSnapshot(
  st: Storage,
  current: unknown,
  next: AppData,
  reason: SnapshotReason,
  now: Date = new Date(),
): Promise<void> {
  if (current !== null && current !== undefined) {
    try {
      await takeSnapshot(st, current, reason, now);
    } catch (e) {
      throw new Error(`自動留底失敗，這次沒有執行（${errText(e)}）`);
    }
  }
  st.setWriteLock(false);
  await st.saveData(next);
}

/** 讀出某份留底並升級成目前格式（還沒寫入）。讀不到或升級失敗丟錯 */
export async function loadSnapshotData(st: Storage, id: string): Promise<AppData> {
  const s = await st.getSnapshot(id);
  if (!s) throw new Error('找不到這份留底');
  try {
    return migrate(s.data);
  } catch (e) {
    throw new Error(`這份留底無法使用（${errText(e)}）`);
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
