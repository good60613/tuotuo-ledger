import { useState } from 'preact/hooks';
import { Sheet } from './Sheet';
import { useAppState, updateData } from '../store';
import { uid, upsertCategory } from '../data/ops';
import { allNotes, hideNote, togglePin } from '../data/notes';
import type { Category, CategoryType } from '../data/types';

/** 新增或改名分類 */
export function CategoryForm({
  type, existing, onClose, onSaved,
}: { type: CategoryType; existing?: Category; onClose: () => void; onSaved?: (id: string) => void }) {
  const d = useAppState().data;
  const [name, setName] = useState(existing?.name ?? '');
  const [icon, setIcon] = useState(existing?.icon ?? '');
  const save = () => {
    const n = name.trim();
    if (!n) return;
    const cat: Category = existing
      ? { ...existing, name: n, icon: icon.trim() || n.slice(0, 1) }
      : {
          id: uid('c'),
          type,
          name: n,
          icon: icon.trim() || n.slice(0, 1),
          order: d.categories.filter((c) => c.type === type).length,
        };
    updateData((x) => upsertCategory(x, cat));
    onSaved?.(cat.id);
    onClose();
  };
  return (
    <Sheet title={existing ? '修改分類' : `新增${type === 'expense' ? '支出' : '收入'}分類`} onClose={onClose}>
      <label class="field">
        <span>名稱</span>
        <input value={name} maxLength={8} onInput={(e) => setName(e.currentTarget.value)} placeholder="例如：午餐" />
      </label>
      <label class="field">
        <span>圖示（一個表情符號或字，可留空）</span>
        <input value={icon} maxLength={4} onInput={(e) => setIcon(e.currentTarget.value)} placeholder="🍱" />
      </label>
      <button class="btn block" disabled={!name.trim()} onClick={save}>儲存</button>
    </Sheet>
  );
}

/**
 * 備註標籤（記憶模式）：列出所有用過的備註，可以加星星釘選、刪除。
 * 釘選的備註所有分類都看得到，排在輸入頁 5 格最前面。
 */
export function TagManager({ onClose }: { onClose: () => void }) {
  const d = useAppState().data;
  const notes = allNotes(d);
  return (
    <Sheet title="備註標籤" onClose={onClose}>
      <p class="muted small">輸入頁會自動顯示最近用過的備註。加星星＝釘選，所有分類都會顯示在最前面。</p>
      {notes.length === 0 && <div class="empty-list small">還沒有用過的備註</div>}
      {notes.map((n) => (
        <div class="list-row" key={n.text}>
          <span class="grow">{n.text}</span>
          <button
            class="icon-btn"
            style={{ color: n.pinned ? '#f5a623' : undefined }}
            onClick={() => updateData((x) => togglePin(x, n.text))}
            aria-label={n.pinned ? '取消釘選' : '釘選'}
          >
            {n.pinned ? '★' : '☆'}
          </button>
          <button class="icon-btn danger" onClick={() => updateData((x) => hideNote(x, n.text))} aria-label="刪除">🗑</button>
        </div>
      ))}
    </Sheet>
  );
}
