// 第三批第 6 項：設定裡手動新增備註標籤
import { describe, expect, it } from 'vitest';
import { addNoteTag, allNotes, hideNote, suggestedNotes } from '../src/data/notes';
import { emptyData } from '../src/data/seed';

describe('新增備註標籤', () => {
  it('新增並釘選：記帳時就出現在最前面', () => {
    const d = addNoteTag(emptyData(), '  健身房 ', true);
    expect(suggestedNotes(d, null)[0]).toBe('健身房');
    expect(allNotes(d).find((n) => n.text === '健身房')?.pinned).toBe(true);
  });

  it('新增不釘選：只出現在設定清單，不佔記帳格', () => {
    const d = addNoteTag(emptyData(), '健身房', false);
    expect(allNotes(d).some((n) => n.text === '健身房')).toBe(true);
    expect(suggestedNotes(d, null)).not.toContain('健身房');
  });

  it('重複新增不會變兩個；刪除過的再新增會回來', () => {
    let d = addNoteTag(emptyData(), '健身房', false);
    d = addNoteTag(d, '健身房', true);
    expect(d.noteTags.filter((t) => t.text === '健身房').length).toBe(1);
    expect(d.noteTags.find((t) => t.text === '健身房')?.pinned).toBe(true);
    d = hideNote(d, '健身房');
    expect(allNotes(d).some((n) => n.text === '健身房')).toBe(false);
    d = addNoteTag(d, '健身房', false);
    expect(allNotes(d).some((n) => n.text === '健身房')).toBe(true);
  });

  it('釘選數超過 5 格時只顯示前 5 個（沿用既有規則）', () => {
    let d = emptyData();
    for (const t of ['a', 'b', 'c', 'd', 'e', 'f']) d = addNoteTag(d, t, true);
    expect(suggestedNotes(d, null)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('空白不新增', () => {
    const d0 = emptyData();
    expect(addNoteTag(d0, '   ', true)).toBe(d0);
  });
});
