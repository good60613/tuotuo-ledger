// 2.5 明細頁：長按拖曳換位置（改時間）、拖去刪除、多選刪除。
// 換位置只改 occurredAt（時間不影響任何帳戶餘額，只影響它算在哪一天、哪一期）。
// 刪除一律走 deleteTransaction（現有規則：已報帳、已還的先欠、預算付款等會被擋下）。
import type { AppData, Transaction } from './types';
import { deleteTransaction, OpError } from './ops';
import { dayKey } from './calc';

const MIN = 60_000;

/**
 * 能不能拖曳換位置。不能：轉帳、校正（工單指定，避免動到餘額邏輯），
 * 以及市值、報帳入帳、還朋友錢、投資與儲蓄頁記的（都跟別筆或子畫面綁在一起）。
 */
export function canMoveTx(t: Transaction): boolean {
  if (t.type !== 'expense' && t.type !== 'income' && t.type !== 'owed') return false;
  if (t.source) return false;
  return true;
}

/** 放下的位置：在哪一天，上面（較新）那筆與下面（較舊）那筆（同一天內；沒有就 null） */
export interface DropSlot {
  day: string;
  aboveId: string | null;
  belowId: string | null;
}

const dayStart = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
};

/**
 * 放下後的新時間：上下兩筆中間；只有上面那筆＝比它早 1 分鐘、只有下面那筆＝比它晚 1 分鐘；
 * 那一天都沒有別筆＝維持原本的時分、換成那一天。一律夾在那一天的 00:00～23:59:59 裡。
 * 位置沒變（上下兩筆跟原本一樣）回傳 null。
 */
export function slotTime(data: AppData, id: string, slot: DropSlot): string | null {
  const t = data.transactions.find((x) => x.id === id);
  if (!t) return null;
  const at = (x: string | null) => (x ? data.transactions.find((y) => y.id === x) : undefined);
  const above = at(slot.aboveId === id ? null : slot.aboveId);
  const below = at(slot.belowId === id ? null : slot.belowId);
  const lo = dayStart(slot.day);
  const hi = lo + 24 * 60 * MIN - 1000;
  let ms: number;
  if (above && below) ms = Math.round((Date.parse(above.occurredAt) + Date.parse(below.occurredAt)) / 2);
  else if (above) ms = Date.parse(above.occurredAt) - MIN;
  else if (below) ms = Date.parse(below.occurredAt) + MIN;
  else {
    const old = new Date(t.occurredAt);
    ms = lo + (old.getHours() * 60 + old.getMinutes()) * MIN + old.getSeconds() * 1000;
  }
  ms = Math.min(hi, Math.max(lo, Math.round(ms / 1000) * 1000));
  const iso = new Date(ms).toISOString();
  if (iso === t.occurredAt) return null;
  // 原本就在這兩筆中間（同一天）：不動
  if (dayKey(t.occurredAt) === slot.day) {
    const cur = Date.parse(t.occurredAt);
    const okAbove = !above || Date.parse(above.occurredAt) >= cur;
    const okBelow = !below || Date.parse(below.occurredAt) <= cur;
    if (okAbove && okBelow && (above || below)) return null;
  }
  return iso;
}

/** 改時間。回傳新資料與原本那筆（復原用） */
export function moveTx(data: AppData, id: string, occurredAt: string): { data: AppData; old: Transaction } {
  const old = data.transactions.find((x) => x.id === id);
  if (!old) throw new OpError('找不到這筆紀錄');
  if (!canMoveTx(old)) throw new OpError('這類紀錄不能拖曳換位置');
  return { old, data: { ...data, transactions: data.transactions.map((x) => (x.id === id ? { ...x, occurredAt } : x)) } };
}

/**
 * 一次刪多筆：每筆照 deleteTransaction 的規則，不能刪的略過並記下原因。
 * 回傳被刪掉的紀錄（原樣，復原用）。
 */
export function deleteMany(data: AppData, ids: string[]): { data: AppData; deleted: Transaction[]; skipped: { id: string; reason: string }[] } {
  let d = data;
  const deleted: Transaction[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const id of ids) {
    const t = d.transactions.find((x) => x.id === id);
    if (!t) continue;
    try {
      d = deleteTransaction(d, id);
      deleted.push(t);
    } catch (e) {
      skipped.push({ id, reason: e instanceof Error ? e.message : '不能刪除' });
    }
  }
  return { data: d, deleted, skipped };
}

/** 復原刪除：原樣放回去（已經在的就不重複放） */
export function restoreDeleted(data: AppData, txs: Transaction[]): AppData {
  const have = new Set(data.transactions.map((t) => t.id));
  return { ...data, transactions: [...data.transactions, ...txs.filter((t) => !have.has(t.id))] };
}
