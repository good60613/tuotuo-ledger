// 設定頁「清空或範例」（第三批第 1 項）。
import type { AppData, NoteTag } from './types';
import { allNotes } from './notes';
import { uid } from './ops';

/**
 * 清空紀錄：只刪記帳紀錄（支出、收入、轉帳、調整、報帳、市值…全部）。
 * 帳戶、小帳戶、分類、備註標籤、結算日等設定全部保留；帳戶金額因此回到初始餘額。
 * 備註清單原本有一部分是從紀錄自動產生的，清空前先轉成標籤留下來（釘選狀態不變），
 * 這樣設定裡的備註清單不會一起消失。
 */
export function clearRecords(d: AppData): AppData {
  const known = new Set(d.noteTags.map((t) => t.text));
  const extra: NoteTag[] = allNotes(d)
    .filter((n) => !known.has(n.text))
    .map((n, i) => ({ id: uid('n'), text: n.text, order: i, pinned: false }));
  return { ...d, transactions: [], noteTags: [...d.noteTags, ...extra] };
}
