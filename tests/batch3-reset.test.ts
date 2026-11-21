// 第三批第 1 項：清空紀錄只刪紀錄，設定全部保留
import { describe, expect, it } from 'vitest';
import { clearRecords } from '../src/data/reset';
import { allBalances } from '../src/data/calc';
import { allNotes, togglePin, hideNote } from '../src/data/notes';
import { blankData, sampleData } from '../src/data/seed';
import { calibrate, markReimbursed } from '../src/data/ops';

const NOW = new Date(2026, 10, 8, 12);

function rich() {
  let d = sampleData(NOW);
  d.settings = { ...d.settings, settleDay: 25, autoSortCategories: true };
  d = calibrate(d, 'a-cash', 9999, NOW); // 調整
  const pend = d.transactions.filter((t) => t.reimbursable).map((t) => t.id);
  d = markReimbursed(d, pend, 'a-salary', NOW); // 報帳
  d = togglePin(d, '星巴克');
  d = hideNote(d, '全家', NOW);
  return d;
}

describe('清空紀錄', () => {
  it('所有紀錄都刪掉（含調整、報帳、轉帳、市值）', () => {
    const d = rich();
    expect(d.transactions.some((t) => t.type === 'adjust')).toBe(true);
    expect(d.transactions.some((t) => t.type === 'transfer')).toBe(true);
    expect(d.transactions.some((t) => t.type === 'valuation')).toBe(true);
    expect(d.transactions.some((t) => t.type === 'reimburse_in')).toBe(true);
    expect(clearRecords(d).transactions).toEqual([]);
  });

  it('帳戶、小帳戶、分類、結算日、自動排序、預設報帳帳戶都保留', () => {
    const d = rich();
    const c = clearRecords(d);
    expect(c.accounts).toEqual(d.accounts);
    expect(c.categories).toEqual(d.categories);
    expect(c.settings).toEqual({ ...d.settings, sample: false }); // 3.0：清空紀錄後不再是範例
  });

  it('帳戶金額回到初始餘額', () => {
    const c = clearRecords(rich());
    for (const a of c.accounts) expect(allBalances(c).get(a.id)).toBe(a.initialBalance);
  });

  it('備註標籤保留：釘選的還是釘選、刪掉的還是隱藏、從紀錄來的轉成標籤留下', () => {
    const d = rich();
    const before = allNotes(d);
    const after = allNotes(clearRecords(d));
    expect(after.map((n) => n.text).sort()).toEqual(before.map((n) => n.text).sort());
    expect(after.find((n) => n.text === '星巴克')?.pinned).toBe(true);
    expect(after.some((n) => n.text === '全家')).toBe(false);
  });

  it('清空所有資料＝回到空白帳本（對照用）', () => {
    const b = blankData();
    expect(b.transactions).toEqual([]);
    expect(b.accounts.every((a) => a.kind !== 'bank')).toBe(true);
  });
});
