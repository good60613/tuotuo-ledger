import { Icon } from '../components/Icon';
// 設定 → 定期扣款（2.0 補強批）：固定金額的每月訂閱。規則見 data/recurring.ts。
import { useState } from 'preact/hooks';
import { useAppState, updateData, showToast, confirmDanger } from '../store';
import { addRecurring, updateRecurring, removeRecurring, setRecurringEnabled, recurringProblem, nextChargeDate, RecurringError, type RecurringInput } from '../data/recurring';
import { recurringReserved } from '../data/calc';
import { recurringOn } from '../features';
import type { Recurring } from '../data/types';
import { accountName, bankAccounts, categoriesOf } from '../selectors';
import { Sheet } from '../components/Sheet';
import { AccountPicker } from '../components/AccountPicker';
import { money } from '../format';

const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

export function RecurringPanel() {
  const d = useAppState().data;
  const on = recurringOn(d.settings);
  const [edit, setEdit] = useState<Recurring | 'new' | null>(null);
  const list = [...d.recurring].sort((a, b) => a.order - b.order);
  const reserved = recurringReserved(d);
  const monthly = list.reduce((s, r) => s + r.amount, 0);

  const toggle = () => {
    updateData((x) => setRecurringEnabled(x, !on));
    showToast(on ? '已關閉定期扣款：不再自動記帳，也不預留剩餘可用' : '已開啟定期扣款：關閉期間錯過的不補記');
  };

  return (
    <section class="panel">
      <button class="setting-row" onClick={toggle}>
        <span>自動記帳</span>
        <span class="muted">{on ? '開啟' : '關閉'} ›</span>
      </button>
      <p class="muted small">
        固定金額的每月訂閱。每月扣款日自動記一筆支出；新的一期開始時，剩餘可用先預留本期還沒扣的（比照預算）。
        App 沒開的日子，下次打開會補記，日期是原本的扣款日，不會重複。當月沒有那一天（例如 31 號）就在月底扣。
      </p>
      {!on && list.length > 0 && <p class="muted small">目前關閉：不自動記帳、不動帳戶、不預留。重新打開時，關閉期間錯過的月份不會補記。</p>}
      {list.length > 0 && (
        <p class="muted small">每月合計 {money(monthly)}{on && reserved > 0 ? `，本期還預留 ${money(reserved)}` : ''}</p>
      )}
      {list.map((r) => {
        const problem = recurringProblem(d, r);
        return (
          <div class="list-row" key={r.id}>
            <button class="row-main" onClick={() => setEdit(r)}>
              <span>{r.name}　{money(r.amount)}</span>
              <span class={`muted small${problem ? ' warn' : ''}`}>
                {problem ?? `每月 ${r.day} 號 · ${accountName(d, r.accountId)}${on ? ` · 下次 ${md(nextChargeDate(r))}` : ''}`}
              </span>
            </button>
          </div>
        );
      })}
      <button class="add-row" onClick={() => setEdit('new')}><Icon name="plus" size={16} /> 新增定期扣款</button>
      {edit && <RecurringForm existing={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

function RecurringForm({ existing, onClose }: { existing: Recurring | null; onClose: () => void }) {
  const d = useAppState().data;
  const cats = categoriesOf(d, 'expense');
  const [name, setName] = useState(existing?.name ?? '');
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const [day, setDay] = useState(existing ? String(existing.day) : '');
  const [cat, setCat] = useState(existing?.categoryId && cats.some((c) => c.id === existing.categoryId) ? existing.categoryId : cats[0]?.id ?? '');
  const [acc, setAcc] = useState<string | null>(() => {
    if (existing && d.accounts.some((a) => a.id === existing.accountId)) return existing.accountId;
    return bankAccounts(d)[0]?.id ?? null;
  });
  const [picking, setPicking] = useState(false);
  const accKind = d.accounts.find((a) => a.id === acc)?.kind;

  const input = (): RecurringInput => ({ name, amount: Number(amount), day: Number(day), categoryId: cat, accountId: acc ?? '' });
  const save = () => {
    try {
      if (existing) {
        updateData((x) => updateRecurring(x, existing.id, input()));
        showToast('已更新（已記的不會變）');
      } else {
        updateData((x) => addRecurring(x, input()).data);
        showToast('已新增定期扣款');
      }
      onClose();
    } catch (e) {
      showToast(e instanceof RecurringError ? e.message : '儲存失敗');
    }
  };
  const del = async () => {
    if (!existing) return;
    if (!(await confirmDanger(`刪除「${existing.name}」？`, '之後不會再自動扣款；已經記下的支出會保留。'))) return;
    updateData((x) => removeRecurring(x, existing.id));
    showToast('已刪除定期扣款');
    onClose();
  };

  return (
    <>
      <Sheet title={existing ? '修改定期扣款' : '新增定期扣款'} onClose={onClose}>
        <label class="field">
          <span>名稱</span>
          <input value={name} placeholder="例：Spotify" onInput={(e) => setName(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span>每月金額</span>
          <input value={amount} inputMode="numeric" onInput={(e) => setAmount(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span>每月幾號扣（1～31）</span>
          <input value={day} inputMode="numeric" onInput={(e) => setDay(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span>分類</span>
          <select value={cat} onChange={(e) => setCat(e.currentTarget.value)}>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
        </label>
        <div class="field">
          <span>預設扣款帳戶</span>
          <button class="pill-btn" onClick={() => setPicking(true)}>{acc ? accountName(d, acc) : '選擇帳戶'} <Icon name="chevron-down" size={14} /></button>
        </div>
        {accKind && accKind !== 'bank' && <p class="muted small">小帳戶扣款：只記在小帳戶，不算主帳支出，也不預留剩餘可用。</p>}
        <p class="muted small">臨時要換帳戶：等那筆自動記下來後，點進那筆自己改。</p>
        <div class="dialog-btns">
          {existing ? <button class="btn danger" onClick={del}>刪除</button> : <button class="btn secondary" onClick={onClose}>取消</button>}
          <button class="btn" onClick={save}>儲存</button>
        </div>
      </Sheet>
      {picking && <AccountPicker title="預設扣款帳戶" value={acc} onPick={(id) => id && setAcc(id)} onClose={() => setPicking(false)} />}
    </>
  );
}
