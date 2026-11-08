// 第三批第 5 項：長按拖曳換位、自動排序開關與還原
import { describe, expect, it } from 'vitest';
import { moveId } from '../src/gestures/Sortable';
import { sortedCategories } from '../src/data/notes';
import { nextCategoryOrder, removeCategory, reorder, upsertCategory, addTransaction } from '../src/data/ops';
import { emptyData } from '../src/data/seed';
import type { AppData } from '../src/data/types';

const NOW = new Date(2026, 10, 8, 12);
const ids = (d: AppData) => sortedCategories(d, 'expense', NOW).map((c) => c.id);

describe('拖曳換位', () => {
  it('往後拖：插到目標後面；往前拖：插到目標前面', () => {
    expect(moveId(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
    expect(moveId(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
  });
  it('放回原位或拖到不存在的格子：不變', () => {
    expect(moveId(['a', 'b'], 'a', 'a')).toEqual(['a', 'b']);
    expect(moveId(['a', 'b'], 'a', '__trash')).toEqual(['a', 'b']);
  });
});

describe('分類自動排序：關掉後回到手動排序', () => {
  it('開啟期間新增的排最後、刪掉的直接移除，其他維持原本手動順序', () => {
    let d = emptyData();
    d.accounts = [{ id: 'X', name: '現金', kind: 'bank', initialBalance: 0, order: 0 }];
    // 手動排序：把「其他」c-e11 拖到最前面
    const manual = ['c-e11', ...ids(d).filter((i) => i !== 'c-e11')];
    d = { ...d, categories: reorder(d.categories, manual) };
    expect(ids(d)).toEqual(manual);

    // 開啟自動排序，常用「飲料」c-e3
    d = { ...d, settings: { ...d.settings, autoSortCategories: true } };
    for (let i = 0; i < 3; i++) {
      d = addTransaction(d, { type: 'expense', amount: 50, accountId: 'X', categoryId: 'c-e3', note: '', occurredAt: NOW.toISOString(), reimbursable: false }, `t${i}`).data;
    }
    expect(ids(d)[0]).toBe('c-e3');

    // 期間新增一個、刪掉一個
    d = upsertCategory(d, { id: 'new', type: 'expense', name: '新的', icon: '🍽️', color: 'other', order: nextCategoryOrder(d, 'expense') });
    d = removeCategory(d, 'c-e5', { mode: 'deleteRecords' });

    // 關掉 → 回到手動排序
    d = { ...d, settings: { ...d.settings, autoSortCategories: false } };
    expect(ids(d)).toEqual([...manual.filter((i) => i !== 'c-e5'), 'new']);
  });

  it('刪除過分類後再新增，排序號碼不會撞號', () => {
    let d = removeCategory(emptyData(), 'c-e0', { mode: 'deleteRecords' });
    const n = nextCategoryOrder(d, 'expense');
    expect(d.categories.filter((c) => c.type === 'expense').every((c) => c.order < n)).toBe(true);
    d = upsertCategory(d, { id: 'z', type: 'expense', name: 'z', icon: '❓', color: 'other', order: n });
    expect(ids(d).at(-1)).toBe('z');
  });
});
