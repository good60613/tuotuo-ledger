// 備註記憶模式與分類自動排序（第二批第五節、PK 確認事項 G、H）。
import type { AppData, Category, CategoryType, NoteTag, Transaction } from './types';
import { uid, byOrder } from './ops';
import { NOTES, CATEGORY_SORT } from '../config';

export interface NoteItem {
  text: string;
  pinned: boolean;
  /** 最後一次使用的時間（ISO），沒用過為 null */
  lastUsedAt: string | null;
}

/** 備註是系統自動產生的紀錄類型（報帳入帳「報帳入帳（1 筆）」等）：不列入備註清單與統計 */
const SYSTEM_NOTE_TYPES: Transaction['type'][] = ['reimburse_in', 'adjust', 'valuation'];

/** 每個備註最後一次使用的時間；categoryId 給了就只看該分類 */
function lastUse(d: AppData, categoryId: string | null): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of d.transactions) {
    if (SYSTEM_NOTE_TYPES.includes(t.type)) continue; // 系統自動產生的備註不算
    const text = t.note.trim();
    if (!text) continue;
    if (categoryId && t.categoryId !== categoryId) continue;
    const prev = m.get(text);
    if (!prev || t.createdAt > prev) m.set(text, t.createdAt);
  }
  return m;
}

/** 被刪除的備註：刪除後沒再用過才算隱藏 */
function isHidden(tag: NoteTag | undefined, lastUsedAt: string | undefined): boolean {
  if (!tag?.hiddenAt) return false;
  return !lastUsedAt || lastUsedAt <= tag.hiddenAt;
}

/**
 * 設定頁「備註標籤」清單：所有用過的備註＋手動加過的標籤（刪除的除外）。
 * 釘選的排最前面（照釘選順序），其餘依最近使用排序。
 */
export function allNotes(d: AppData): NoteItem[] {
  const use = lastUse(d, null);
  const tagOf = new Map(d.noteTags.map((t) => [t.text, t]));
  const texts = new Set([...use.keys(), ...d.noteTags.map((t) => t.text)]);
  const items: (NoteItem & { order: number })[] = [];
  for (const text of texts) {
    const tag = tagOf.get(text);
    const lu = use.get(text);
    if (isHidden(tag, lu)) continue;
    items.push({ text, pinned: !!tag?.pinned, lastUsedAt: lu ?? null, order: tag?.order ?? 0 });
  }
  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.pinned) return a.order - b.order;
    return (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '');
  });
  return items.map(({ order: _o, ...x }) => x);
}

/**
 * 輸入頁的備註格：釘選的排最前面，剩下的格子用最近使用的補上。
 * 還沒選分類 → 全部分類最近用過的；選了分類 → 該分類最近用過的。
 * 釘選數超過格數時，只顯示前幾個釘選。
 */
export function suggestedNotes(d: AppData, categoryId: string | null, n: number = NOTES.slots): string[] {
  const all = lastUse(d, null);
  const tagOf = new Map(d.noteTags.map((t) => [t.text, t]));
  const pinned = d.noteTags
    .filter((t) => t.pinned && !isHidden(t, all.get(t.text)))
    .sort(byOrder)
    .map((t) => t.text);
  const out = pinned.slice(0, n);
  const recent = [...lastUse(d, categoryId).entries()]
    .filter(([text, at]) => !isHidden(tagOf.get(text), at))
    .sort((a, b) => b[1].localeCompare(a[1]));
  for (const [text] of recent) {
    if (out.length >= n) break;
    if (!out.includes(text)) out.push(text);
  }
  return out;
}

/** 加星星／取消星星 */
export function togglePin(d: AppData, text: string): AppData {
  const tag = d.noteTags.find((t) => t.text === text);
  const maxOrder = Math.max(-1, ...d.noteTags.filter((t) => t.pinned).map((t) => t.order));
  if (tag) {
    const pinned = !tag.pinned;
    return {
      ...d,
      noteTags: d.noteTags.map((t) => (t === tag ? { ...t, pinned, order: pinned ? maxOrder + 1 : t.order } : t)),
    };
  }
  return { ...d, noteTags: [...d.noteTags, { id: uid('n'), text, order: maxOrder + 1, pinned: true }] };
}

/** 從清單刪除備註（不改動任何紀錄）。之後若又用到，會重新出現 */
export function hideNote(d: AppData, text: string, now: Date = new Date()): AppData {
  const hiddenAt = now.toISOString();
  const tag = d.noteTags.find((t) => t.text === text);
  if (tag) return { ...d, noteTags: d.noteTags.map((t) => (t === tag ? { ...t, pinned: false, hiddenAt } : t)) };
  return { ...d, noteTags: [...d.noteTags, { id: uid('n'), text, order: 0, pinned: false, hiddenAt }] };
}

/** 釘選數（設定目錄顯示「自動篩選，已釘選 N 個」） */
export const pinnedCount = (d: AppData) => allNotes(d).filter((x) => x.pinned).length;

// ---------------- 分類排序 ----------------

/** 最近 N 天每個分類的使用次數 */
export function categoryUsage(d: AppData, now: Date = new Date(), days: number = CATEGORY_SORT.recentDays): Map<string, number> {
  const since = new Date(now.getTime() - days * 86400000).toISOString();
  const m = new Map<string, number>();
  for (const t of d.transactions) {
    if (!t.categoryId || t.occurredAt < since) continue;
    m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1);
  }
  return m;
}

/**
 * 輸入頁分類格的順序：自動排序關閉 → 照設定裡的順序；
 * 開啟 → 最近 90 天用越多越前面，次數相同照設定順序。
 */
export function sortedCategories(d: AppData, type: CategoryType, now: Date = new Date()): Category[] {
  const list = d.categories.filter((c) => c.type === type).sort(byOrder);
  if (!d.settings.autoSortCategories) return list;
  const use = categoryUsage(d, now);
  return list
    .map((c, i) => ({ c, i, n: use.get(c.id) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.c);
}
