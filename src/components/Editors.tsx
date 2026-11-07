import { useState } from 'preact/hooks';
import { Sheet } from './Sheet';
import { useAppState, updateData } from '../store';
import { byOrder, reorder, uid, upsertCategory } from '../data/ops';
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

/** 常用備註標籤：新增、刪除、排序 */
export function TagManager({ onClose }: { onClose: () => void }) {
  const d = useAppState().data;
  const tags = [...d.noteTags].sort(byOrder);
  const [text, setText] = useState('');
  const move = (i: number, dir: -1 | 1) => {
    const ids = tags.map((t) => t.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    updateData((x) => ({ ...x, noteTags: reorder(x.noteTags, ids) }));
  };
  const add = () => {
    const t = text.trim();
    if (!t) return;
    updateData((x) => ({ ...x, noteTags: [...x.noteTags, { id: uid('n'), text: t, order: x.noteTags.length, pinned: false }] }));
    setText('');
  };
  return (
    <Sheet title="常用備註標籤" onClose={onClose}>
      {tags.map((t, i) => (
        <div class="list-row" key={t.id}>
          <span class="grow">{t.text}</span>
          <button class="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="上移">↑</button>
          <button class="icon-btn" onClick={() => move(i, 1)} disabled={i === tags.length - 1} aria-label="下移">↓</button>
          <button
            class="icon-btn danger"
            onClick={() => updateData((x) => ({ ...x, noteTags: x.noteTags.filter((n) => n.id !== t.id) }))}
            aria-label="刪除"
          >
            🗑
          </button>
        </div>
      ))}
      <div class="inline-add">
        <input value={text} maxLength={12} onInput={(e) => setText(e.currentTarget.value)} placeholder="新增標籤" />
        <button class="btn" disabled={!text.trim()} onClick={add}>新增</button>
      </div>
    </Sheet>
  );
}
