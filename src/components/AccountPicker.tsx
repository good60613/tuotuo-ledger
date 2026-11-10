import { useAppState } from '../store';
import { Sheet } from './Sheet';
import { allBalances } from '../data/calc';
import { bankAccounts, balls } from '../selectors';
import { Icon } from './Icon';
import { accountIconOf } from '../categoryStyle';
import { money } from '../format';

interface Props {
  title: string;
  value: string | null;
  /** 顯示「全部」選項（明細、統計篩選用） */
  allowAll?: boolean;
  /** 只列一般帳戶（明細、統計的篩選用；小帳戶看各自的子畫面） */
  mainOnly?: boolean;
  /** 不列出的帳戶（例如刪除帳戶時，不能選自己） */
  exclude?: string;
  /** 額外的「不設定」選項 */
  noneLabel?: string;
  /** 只列這些帳戶（例如刪帳戶時只能移到同種類、還朋友錢不能用儲蓄投資）；不給＝全部 */
  only?: string[];
  /** 列表最下面的說明（例如為什麼有些帳戶沒列出來） */
  footnote?: string;
  onPick: (id: string | null) => void;
  onClose: () => void;
}

/** 選帳戶：一般帳戶在上，五顆小帳戶球依序在下 */
export function AccountPicker(p: Props) {
  const d = useAppState().data;
  const bal = allBalances(d);
  const shown = (id: string) => id !== p.exclude && (!p.only || p.only.includes(id));
  const row = (id: string, name: string, icon: string) => !shown(id) ? null : (
    <button
      key={id}
      class={`pick-row${p.value === id ? ' selected' : ''}`}
      onClick={() => {
        p.onPick(id);
        p.onClose();
      }}
    >
      <span class="pick-icon"><Icon name={icon} /></span>
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
          <span class="pick-icon"><Icon name="layers" /></span>
          <span class="pick-name">全部</span>
        </button>
      )}
      {bankAccounts(d).some((a) => shown(a.id)) && <div class="pick-group">一般帳戶</div>}
      {bankAccounts(d).map((a) => row(a.id, a.name, accountIconOf(a)))}
      {!p.mainOnly && balls(d).map((b) =>
        !b.accounts.some((a) => shown(a.id)) ? null : (
          <div key={b.kind}>
            <div class="pick-group">{b.label}</div>
            {b.accounts.map((a) => row(a.id, a.name, accountIconOf(a)))}
          </div>
        ),
      )}
      {p.footnote && <p class="muted small">{p.footnote}</p>}
    </Sheet>
  );
}
