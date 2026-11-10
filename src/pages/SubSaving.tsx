import { Icon } from '../components/Icon';
// 儲蓄子畫面：頂端總額、儲蓄目標（直向等寬，「已存／目標」）、長按拖曳排序、記一筆三種（存入、取出、利息）。
// 排序採金字塔概念：越下面越必要（緊急預備金），越上面越想要。
import { useEffect, useRef, useState } from 'preact/hooks';
import { useAppState, updateData, showToast } from '../store';
import { allBalances } from '../data/calc';
import { addTransaction, reorder, savingGoals, upsertAccount, uid, OpError, ballDropTarget, type TxInput } from '../data/ops';
import type { Account } from '../data/types';
import { accountName } from '../selectors';
import { GESTURE } from '../config';
import { vibrate } from '../gestures/haptics';
import { SubFrame } from '../components/SubFrame';
import { AmountForm } from '../components/AmountForm';
import { AccountPicker } from '../components/AccountPicker';
import { Sheet } from '../components/Sheet';
import { CalibrateSheet } from './Sub';
import { money } from '../format';

type EntryKind = 'in' | 'out' | 'interest';
const ENTRY_LABEL: Record<EntryKind, string> = { in: '存入', out: '取出', interest: '利息' };

export function SavingSub() {
  const d = useAppState().data;
  const goals = savingGoals(d);
  const bal = allBalances(d);
  const [sel, setSel] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'entry' | 'add' | 'calib'>(null);
  const selected = goals.find((g) => g.id === sel) ?? null;
  const total = goals.reduce((s, g) => s + (bal.get(g.id) ?? 0), 0);
  // 校正：只有一個目標時一直顯示；多個時選了某個目標才出現
  const target = goals.length === 1 ? goals[0] : selected;
  const shown = selected ? [selected.id] : goals.map((g) => g.id);

  // ---- 長按拖曳排序 ----
  const [drag, setDrag] = useState<{ id: string; over: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ id: string; x: number; y: number; timer?: ReturnType<typeof setTimeout> } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  // 拖曳中要擋住頁面捲動（需要非 passive 的 touchmove）
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const block = (e: TouchEvent) => {
      if (dragRef.current) e.preventDefault();
    };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, []);

  const overId = (x: number, y: number, fallback: string) => {
    const row = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-goal]') as HTMLElement | null;
    return row?.dataset.goal ?? fallback;
  };
  const down = (e: PointerEvent, g: Account) => {
    press.current = { id: g.id, x: e.clientX, y: e.clientY };
    press.current.timer = setTimeout(() => {
      if (!press.current) return;
      vibrate(GESTURE.liftVibrateMs);
      setDrag({ id: g.id, over: g.id });
    }, GESTURE.longPressMs);
  };
  const move = (e: PointerEvent) => {
    const p = press.current;
    if (!p) return;
    if (!dragRef.current) {
      // 還沒拿起就移動太多＝在捲動，取消
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > GESTURE.moveTolerancePx) {
        clearTimeout(p.timer);
        press.current = null;
      }
      return;
    }
    const over = overId(e.clientX, e.clientY, dragRef.current.over);
    if (over !== dragRef.current.over) {
      vibrate(GESTURE.hoverVibrateMs);
      setDrag({ id: dragRef.current.id, over });
    }
  };
  const up = () => {
    const p = press.current;
    const dr = dragRef.current;
    if (p) clearTimeout(p.timer);
    press.current = null;
    if (dr) {
      if (dr.over !== dr.id) {
        const ids = goals.map((g) => g.id).filter((i) => i !== dr.id);
        ids.splice(ids.indexOf(dr.over) + (goals.findIndex((g) => g.id === dr.over) > goals.findIndex((g) => g.id === dr.id) ? 1 : 0), 0, dr.id);
        updateData((x) => ({ ...x, accounts: reorder(x.accounts, ids) }));
      }
      setDrag(null);
      // 放開後的那下 click 不當作選取
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), GESTURE.afterDropCooldownMs);
    }
  };
  const justDragged = useRef(false);

  return (
    <SubFrame
      title="儲蓄"
      total={money(total)}
      accountIds={shown}
      topRight={target && <button class="pill-btn small" onClick={() => setSheet('calib')}>校正</button>}
      onAdd={() => (goals.length ? setSheet('entry') : showToast('請先新增儲蓄目標'))}
    >
      <p class="muted small goal-hint">越下面越必要，長按目標可拖曳調整順序</p>
      <div class="goal-list" ref={listRef} data-no-swipe>
        {goals.map((g) => {
          const saved = bal.get(g.id) ?? 0;
          const ratio = g.target ? Math.min(1, Math.max(0, saved / g.target)) : 0;
          return (
            <div
              key={g.id}
              data-goal={g.id}
              class={`goal-row${sel === g.id ? ' on' : ''}${drag?.id === g.id ? ' lifted' : ''}${drag && drag.over === g.id && drag.id !== g.id ? ' over' : ''}`}
              onPointerDown={(e) => down(e as PointerEvent, g)}
              onPointerMove={(e) => move(e as PointerEvent)}
              onPointerUp={up}
              onPointerCancel={up}
              onClick={() => !justDragged.current && setSel(g.id === sel ? null : g.id)}
            >
              <div class="goal-fill" style={{ width: `${ratio * 100}%` }} />
              <span class="goal-name">{g.name}</span>
              <span class="goal-amt">{money(saved)} <span class="muted">／ {g.target ? money(g.target) : '未設目標'}</span></span>
            </div>
          );
        })}
        <button class="goal-row add" onClick={() => setSheet('add')}><Icon name="plus" size={16} /> 新增目標</button>
      </div>

      {sheet === 'entry' && <SavingEntry goals={goals} preset={selected?.id ?? null} onClose={() => setSheet(null)} />}
      {sheet === 'add' && <AddGoal onClose={() => setSheet(null)} />}
      {sheet === 'calib' && target && <CalibrateSheet accountId={target.id} name={target.name} onClose={() => setSheet(null)} />}
    </SubFrame>
  );
}

function SavingEntry({ goals, preset, onClose }: { goals: Account[]; preset: string | null; onClose: () => void }) {
  const s = useAppState();
  const d = s.data;
  const [kind, setKind] = useState<EntryKind>('in');
  const [gid, setGid] = useState<string>(preset ?? ballDropTarget(d, 'saving')?.id ?? goals[0].id);
  const lastUsed = d.accounts.find((a) => a.id === d.settings.lastUsedAccountId && a.kind !== 'saving');
  const [other, setOther] = useState<string | null>(lastUsed?.id ?? d.accounts.find((a) => a.kind === 'bank')?.id ?? null);
  const [pickOther, setPickOther] = useState(false);
  const [note, setNote] = useState('');
  const needsOther = kind !== 'interest';
  return (
    <AmountForm
      title="儲蓄記一筆"
      ready={!needsOther || !!other}
      onSubmit={(amount) => {
        const base = { amount, note: note.trim(), occurredAt: new Date().toISOString() };
        const input: TxInput =
          kind === 'in' ? { ...base, type: 'transfer', accountId: other!, toAccountId: gid, source: 'saving-in' }
          : kind === 'out' ? { ...base, type: 'transfer', accountId: gid, toAccountId: other!, source: 'saving-out' }
          : { ...base, type: 'income', accountId: gid, source: 'saving-interest' };
        try {
          updateData((x) => addTransaction(x, input).data);
          showToast(`已記一筆${ENTRY_LABEL[kind]}`);
        } catch (e) {
          showToast(e instanceof OpError ? e.message : '存檔失敗');
          return false;
        }
      }}
      onClose={onClose}
    >
      <div class="mini-seg wide">
        {(Object.keys(ENTRY_LABEL) as EntryKind[]).map((k) => (
          <button key={k} class={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{ENTRY_LABEL[k]}</button>
        ))}
      </div>
      <div class="chip-row">
        {goals.map((g) => (
          <button key={g.id} class={`chip${gid === g.id ? ' on' : ''}`} onClick={() => setGid(g.id)}>{g.name}</button>
        ))}
      </div>
      {needsOther && (
        <button class="pick-row" onClick={() => setPickOther(true)}>
          <span class="pick-name">{kind === 'in' ? '從' : '轉到'}：{other ? accountName(d, other) : '選擇帳戶'}</span>
          <span class="pick-amt">›</span>
        </button>
      )}
      <p class="muted small">
        {kind === 'in' ? '對方帳戶 → 目標（等同轉帳）' : kind === 'out' ? '目標 → 對方帳戶（等同轉帳）' : '利息直接進目標，不算主帳收入'}
        。
      </p>
      <input class="note-input full" value={note} maxLength={40} placeholder="備註" onInput={(e) => setNote(e.currentTarget.value)} />
      {pickOther && (
        <AccountPicker
          title={kind === 'in' ? '從哪個帳戶存入' : '取出轉到哪個帳戶'}
          value={other}
          exclude={gid}
          onPick={setOther}
          onClose={() => setPickOther(false)}
        />
      )}
    </AmountForm>
  );
}

function AddGoal({ onClose }: { onClose: () => void }) {
  const d = useAppState().data;
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const t = Math.round(Number(target.replace(/,/g, '')));
  const ok = name.trim() !== '' && Number.isFinite(t) && t > 0;
  return (
    <Sheet title="新增儲蓄目標" onClose={onClose}>
      <label class="field">
        <span>名稱</span>
        <input value={name} maxLength={12} onInput={(e) => setName(e.currentTarget.value)} placeholder="例如：旅行" />
      </label>
      <label class="field">
        <span>目標金額（元）</span>
        <input value={target} inputMode="numeric" onInput={(e) => setTarget(e.currentTarget.value)} />
      </label>
      <p class="muted small">新目標會放在最上面（最想要），之後可長按拖曳調整。</p>
      <button
        class="btn block"
        disabled={!ok}
        onClick={() => {
          const top = Math.min(0, ...savingGoals(d).map((g) => g.order)) - 1;
          updateData((x) => upsertAccount(x, { id: uid('a'), name: name.trim(), kind: 'saving', initialBalance: 0, target: t, order: top }));
          showToast('已新增目標');
          onClose();
        }}
      >
        新增
      </button>
    </Sheet>
  );
}
