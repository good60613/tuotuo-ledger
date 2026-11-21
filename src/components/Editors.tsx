import { useState } from 'preact/hooks';
import { Sheet } from './Sheet';
import { useAppState, updateData } from '../store';
import { nextCategoryOrder, uid, upsertCategory } from '../data/ops';
import { addNoteTag, allNotes, hideNote, togglePin } from '../data/notes';
import type { Category, CategoryType } from '../data/types';
import { CATEGORY_COLORS, DEFAULT_COLOR, DEFAULT_NEW_ICON, ICON_GROUPS, type CategoryColorKey } from '../categoryStyle';
import { CatIcon, catBg } from './CatIcon';
import { Icon } from './Icon';
import { ICON } from '../config';
import { ICON_LABELS, isIconName } from '../icons';

/**
 * 新增或修改分類（第三批第 4 項）：最上面名稱欄（左邊顯示目前圖示）→ 顏色標籤 → 圖示選單。
 * 圖示只能從選單點，不能自己輸入；新增時預設選第一個圖示。
 */
export function CategoryForm({
  type, existing, onClose, onSaved,
}: { type: CategoryType; existing?: Category; onClose: () => void; onSaved?: (id: string) => void }) {
  const d = useAppState().data;
  const [name, setName] = useState(existing?.name ?? '');
  const [icon, setIcon] = useState(existing?.icon || DEFAULT_NEW_ICON);
  const [color, setColor] = useState<CategoryColorKey>(existing?.color ?? DEFAULT_COLOR);
  const save = () => {
    const n = name.trim();
    if (!n) return;
    const cat: Category = existing
      ? { ...existing, name: n, icon, color }
      : { id: uid('c'), type, name: n, icon, color, order: nextCategoryOrder(d, type) };
    updateData((x) => upsertCategory(x, cat));
    onSaved?.(cat.id);
    onClose();
  };
  return (
    <Sheet title={existing ? '修改分類' : `新增${type === 'expense' ? '支出' : '收入'}分類`} onClose={onClose}>
      <div class="catform-top">
        <CatIcon icon={icon} color={color} />
        <input value={name} maxLength={8} onInput={(e) => setName(e.currentTarget.value)} placeholder="分類名稱，例如：午餐" aria-label="名稱" />
      </div>
      <div class="color-tags">
        {CATEGORY_COLORS.map((c) => (
          <button key={c.key} class={`color-tag${c.key === color ? ' on' : ''}`}style={{ background: catBg(c.key) }} onClick={() => setColor(c.key)}>
            {c.label}
          </button>
        ))}
      </div>
      <div class="icon-picker" data-no-swipe>
        {!isIconName(icon) && (
          <div>
            <div class="icon-group-title">目前使用（舊圖示，可從下面換成新圖示）</div>
            <div class="icon-grid">
              <button class="icon-cell on" onClick={() => setIcon(icon)}><Icon name={icon} size={ICON.pickerPx} /></button>
            </div>
          </div>
        )}
        {ICON_GROUPS.map((g) => (
          <div key={g.title}>
            <div class="icon-group-title">{g.title}</div>
            <div class="icon-grid">
              {g.icons.map((ic) => (
                <button key={ic} class={`icon-cell${ic === icon ? ' on' : ''}`} onClick={() => setIcon(ic)} aria-label={ICON_LABELS[ic] ?? ic}>
                  <Icon name={ic} size={ICON.pickerPx} />
                  {ICON_LABELS[ic] && <span class="icon-cell-label">{ICON_LABELS[ic]}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
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
  const [newText, setNewText] = useState('');
  const [pinNew, setPinNew] = useState(true);
  return (
    <Sheet title="備註標籤" onClose={onClose}>
      <p class="muted small">輸入頁會自動顯示最近用過的備註。加星星＝釘選，所有分類都會顯示在最前面。</p>
      <div class="inline-add">
        <input value={newText} maxLength={20} placeholder="新增標籤，例如：午餐便當" onInput={(e) => setNewText(e.currentTarget.value)} />
        <label class="pin-check">
          <input type="checkbox" checked={pinNew} onChange={(e) => setPinNew(e.currentTarget.checked)} />
          釘選
        </label>
        <button class="btn" disabled={!newText.trim()} onClick={() => {
          updateData((x) => addNoteTag(x, newText, pinNew));
          setNewText('');
        }}>新增</button>
      </div>
      {notes.length === 0 && <div class="empty-list small">還沒有用過的備註</div>}
      {notes.map((n) => (
        <div class="list-row" key={n.text}>
          <span class="grow">{n.text}</span>
          <button
            class="icon-btn"
            style={{ color: n.pinned ? 'var(--pin)' : undefined }}
            onClick={() => updateData((x) => togglePin(x, n.text))}
            aria-label={n.pinned ? '取消釘選' : '釘選'}
          >
            <Icon name="star" class={n.pinned ? 'star-on' : ''} />
          </button>
          <button class="icon-btn danger" onClick={() => updateData((x) => hideNote(x, n.text))} aria-label="刪除"><Icon name="trash-2" /></button>
        </div>
      ))}
    </Sheet>
  );
}
