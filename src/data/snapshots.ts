// 自動存檔（2.0 修正批，PK 2026-11-10 定案）：純函式，方便測試。
// 「留底」＝把當下整份資料原樣複製一份，存在和主資料分開的地方，資料壞掉或按錯時可以還原。
// - 每天第一次開啟留一份（daily）。
// - 資料升級、匯入取代、清空、載入範例、還原之前各留一份（事件留底），存的是「動手前」的原樣。
// - 份數上限見 config.ts 的 SNAPSHOT；超過時刪最舊的。
import { SNAPSHOT } from '../config';
import { dayKey } from './calc';

export type SnapshotReason =
  | 'daily'
  | 'pre-upgrade'
  | 'pre-import'
  | 'pre-settings-import'
  | 'pre-clear-records'
  | 'pre-clear-all'
  | 'pre-sample'
  | 'pre-restore';

export const REASON_LABEL: Record<SnapshotReason, string> = {
  daily: '每日留底',
  'pre-upgrade': '資料升級前',
  'pre-import': '匯入完整備份前',
  'pre-settings-import': '匯入設定前',
  'pre-clear-records': '清空紀錄前',
  'pre-clear-all': '清空所有資料前',
  'pre-sample': '載入範例前',
  'pre-restore': '還原留底前',
};

/** 清單用的摘要（不含資料本身，列清單時不必把每份都讀出來） */
export interface SnapshotMeta {
  id: string;
  /** 留底時間（ISO） */
  at: string;
  reason: SnapshotReason;
  /** 留底當時的資料版本；讀不出來＝null */
  version: number | null;
  accounts: number;
  transactions: number;
}

export interface Snapshot extends SnapshotMeta {
  /** 原樣保存的資料（可能是舊版本，還原時再升級） */
  data: unknown;
}

const countOf = (v: unknown) => (Array.isArray(v) ? v.length : 0);

/** 做一份留底。資料先深拷貝，之後主資料怎麼改都不會影響這份 */
export function makeSnapshot(raw: unknown, reason: SnapshotReason, now: Date, id: string): Snapshot {
  const data = raw === undefined ? null : JSON.parse(JSON.stringify(raw));
  const o = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return {
    id,
    at: now.toISOString(),
    reason,
    version: typeof o.version === 'number' ? o.version : null,
    accounts: countOf(o.accounts),
    transactions: countOf(o.transactions),
    data,
  };
}

export const metaOf = ({ data: _d, ...m }: Snapshot): SnapshotMeta => m;

/** 新的在前 */
export const byNewest = (a: SnapshotMeta, b: SnapshotMeta) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);

/** 超過份數時要刪掉哪些（每日、事件各自計算，各留最新的幾份） */
export function prunePlan(list: SnapshotMeta[], keep: { dailyKeep: number; eventKeep: number } = SNAPSHOT): string[] {
  const sorted = [...list].sort(byNewest);
  const daily = sorted.filter((s) => s.reason === 'daily');
  const events = sorted.filter((s) => s.reason !== 'daily');
  return [...daily.slice(keep.dailyKeep), ...events.slice(keep.eventKeep)].map((s) => s.id);
}

/** 今天（手機本地日期）是否已經有每日留底 */
export function hasDailyFor(list: SnapshotMeta[], now: Date): boolean {
  const today = dayKey(now);
  return list.some((s) => s.reason === 'daily' && dayKey(s.at) === today);
}
