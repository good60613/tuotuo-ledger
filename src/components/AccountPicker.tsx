import { useAppState } from '../store';
import { Sheet } from './Sheet';
import { allBalances } from '../data/calc';
import { bankAccounts, balls, KIND_ICON } from '../selectors';
import { money } from '../format';

interface Props {
  title: string;
  value: string | null;
  /** 顯示「全部」選項（明細、統計篩選用） */
  allowAll?: boolean;
  /** 不列出的帳戶（例如刪除帳戶時，不能選自己） */
  exclude?: string;
  /** 額外的「不設定」選項 */
  noneLabel?: string;
  onPick: (id: string | null) => void;
  onClose: () => void;
}

/** 選帳戶：一般帳戶在上，五顆小帳戶球依序在下 */
export function AccountPicker(p: Props) {
  const d = useAppState().data;
  const bal = allBalances(d);
  const row = (id: string, name: string, icon: string) => id === p.exclude ? null : (
    <button
      key={id}
      class={`pick-row${p.value === id ? ' selected' : ''}`}
      onClick={() => {
        p.onPick(id);
        p.onClose();
      }}
    >
      <span class="pick-icon">{icon}</span>
      <span class="pick-name">{name}</span>
      <span class="pick-amt">{money(bal.get(id) ?? 0)}</span>
    </button>
  );
  return (
    <Sheet title={p.title} onClose={p.onClose}>
      {p.noneLabel && (
        <button
          class={`pick-row${p.value === null ? ' selected' : ''}`}
          onClick={() => {
            p.onPick(null);
            p.onClose();
          }}
        >
          <span class="pick-icon">⊘</span>
          <span class="pick-name">{p.noneLabel}</span>
        </button>
      )}
      {p.allowAll && (
        <button
          class={`pick-row${p.value === null ? ' selected' : ''}`}
          onClick={() => {
            p.onPick(null);
            p.onClose();
          }}
        >
          <span class="pick-icon">📚</span>
          <span class="pick-name">全部</span>
        </button>
      )}
      <div class="pick-group">一般帳戶</div>
      {bankAccounts(d).map((a) => row(a.id, a.name, KIND_ICON.bank))}
      {balls(d).map((b) =>
        b.accounts.length === 0 ? null : (
          <div key={b.kind}>
            <div class="pick-group">{b.label}</div>
            {b.accounts.map((a) => row(a.id, a.name, KIND_ICON[b.kind]))}
          </div>
        ),
      )}
    </Sheet>
  );
}
