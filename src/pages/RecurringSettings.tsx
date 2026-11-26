import { Icon } from '../components/Icon';
// 設定 → 定期扣款（2.0 補強批）：固定金額的每月訂閱。規則見 data/recurring.ts。
import { useState } from 'preact/hooks';
import { useAppState, updateData, showToast, confirmDanger } from '../store';
import { addRecurring, updateRecurring, removeRecurring, setRecurringEnabled, recurringProblem, nextChargeDate, scheduleLabel, CANCEL_VIA_LABEL, RecurringError, type RecurringInput } from '../data/recurring';
import { freqOf, recurringPeriodTotal, recurringReserved } from '../data/calc';
import { recurringOn } from '../features';
import type { CancelVia, Recurring, RecurringFreq } from '../data/types';
import { accountName, bankAccounts, categoriesOf } from '../selectors';
import { Sheet } from '../components/Sheet';
import { AccountPicker } from '../components/AccountPicker';
import { money } from '../format';

const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
const FREQ_LABEL: Record<RecurringFreq, string> = { week: '每週', month: '每月', year: '每年' };

export function RecurringPanel() {
  const d = useAppState().data;
  const on = recurringOn(d.settings);
  const [edit, setEdit] = useState<Recurring | 'new' | null>(null);
  const list = [...d.recurring].sort((a, b) => a.order - b.order);
  const reserved = recurringReserved(d);
  const periodTotal = recurringPeriodTotal(d);

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
        固定金額的週期性訂閱，可選每週／每月／每年。新的一期開始時，剩餘可用會先預留這期要扣的錢；扣款日過完，隔天自動記一筆支出（記在扣款日 23:59）。
      </p>
      {!on && list.length > 0 && <p class="muted small">目前關閉：不自動記帳、不動帳戶、不預留。重新打開時，關閉期間錯過的不會補記。</p>}
      {list.length > 0 && (
        <p class="muted small">本月合計 {money(periodTotal)}{on && reserved > 0 ? `，還預留 ${money(reserved)}` : ''}</p>
      )}
      {list.map((r) => {
        const problem = recurringProblem(d, r);
        const cancel = [r.cancelVia && `取消：${CANCEL_VIA_LABEL[r.cancelVia]}`, r.cancelNote].filter(Boolean).join('｜');
        return (
          <div class="list-row" key={r.id}>
            <button class="row-main" onClick={() => setEdit(r)}>
              <span>{r.name}　{money(r.amount)}</span>
              <span class={`muted small${problem ? ' warn' : ''}`}>
                {problem ?? `${scheduleLabel(r)} · ${accountName(d, r.accountId)}${on ? ` · 下次 ${md(nextChargeDate(r))}` : ''}`}
              </span>
              {cancel && <span class="muted small recur-cancel">{cancel}</span>}
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
  const [freq, setFreq] = useState<RecurringFreq>(existing ? freqOf(existing) : 'month');
  const [day, setDay] = useState(existing && freqOf(existing) !== 'week' ? String(existing.day) : '');
  const [weekday, setWeekday] = useState<number | undefined>(existing?.weekday);
  const [monthOfYear, setMonthOfYear] = useState(existing?.monthOfYear ?? new Date().getMonth() + 1);
  const [cancelVia, setCancelVia] = useState<CancelVia | ''>(existing?.cancelVia ?? '');
  const [cancelNote, setCancelNote] = useState(existing?.cancelNote ?? '');
  const [cat, setCat] = useState(existing?.categoryId && cats.some((c) => c.id === existing.categoryId) ? existing.categoryId : cats[0]?.id ?? '');
  const [acc, setAcc] = useState<string | null>(() => {
    if (existing && d.accounts.some((a) => a.id === existing.accountId)) return existing.accountId;
    return bankAccounts(d)[0]?.id ?? null;
  });
  const [picking, setPicking] = useState(false);
  const accKind = d.accounts.find((a) => a.id === acc)?.kind;

  const input = (): RecurringInput => ({
    name,
    amount: Number(amount),
    freq,
    weekday: freq === 'week' ? weekday : undefined,
    monthOfYear: freq === 'year' ? monthOfYear : undefined,
    day: freq === 'week' ? 1 : Number(day),
    categoryId: cat,
    accountId: acc ?? '',
    cancelVia: cancelVia || undefined,
    cancelNote,
  });
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
        <div class="field">
          <span>扣款週期</span>
          <div class="seg recur-seg">
            {(['week', 'month', 'year'] as const).map((f) => (
              <button key={f} class={freq === f ? 'on budget' : ''} onClick={() => setFreq(f)}>{FREQ_LABEL[f]}</button>
            ))}
          </div>
        </div>
        <label class="field">
          <span>{FREQ_LABEL[freq]}金額</span>
          <input value={amount} inputMode="numeric" onInput={(e) => setAmount(e.currentTarget.value)} />
        </label>
        {freq === 'week' && (
          <div class="field">
            <span>星期幾扣</span>
            <div class="seg recur-seg recur-weekdays">
              {[1, 2, 3, 4, 5, 6, 0].map((w) => (
                <button key={w} class={weekday === w ? 'on budget' : ''} onClick={() => setWeekday(w)}>{'日一二三四五六'[w]}</button>
              ))}
            </div>
          </div>
        )}
        {freq === 'month' && (
          <label class="field">
            <span>每月幾號扣（1～31）</span>
            <input value={day} inputMode="numeric" onInput={(e) => setDay(e.currentTarget.value)} />
          </label>
        )}
        {freq === 'year' && (
          <div class="field">
            <span>每年幾月幾號扣</span>
            <div class="recur-ymd">
              <select value={monthOfYear} onChange={(e) => setMonthOfYear(Number(e.currentTarget.value))}>
                {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1} 月</option>)}
              </select>
              <input value={day} inputMode="numeric" placeholder="幾號" onInput={(e) => setDay(e.currentTarget.value)} />
            </div>
          </div>
        )}
        <label class="field">
          <span>分類</span>
          <select value={cat} onChange={(e) => setCat(e.currentTarget.value)}>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div class="field">
          <span>預設扣款帳戶</span>
          <button class="pill-btn" onClick={() => setPicking(true)}>{acc ? accountName(d, acc) : '選擇帳戶'} <Icon name="chevron-down" size={14} /></button>
        </div>
        {accKind && accKind !== 'bank' && <p class="muted small">小帳戶扣款：只記在小帳戶，不算主帳支出，也不預留剩餘可用。</p>}
        <p class="muted small">臨時要換帳戶：等那筆自動記下來後，點進那筆自己改。</p>
        <label class="field">
          <span>在哪取消</span>
          <select value={cancelVia} onChange={(e) => setCancelVia(e.currentTarget.value as CancelVia | '')}>
            <option value="">不填</option>
            {(Object.keys(CANCEL_VIA_LABEL) as CancelVia[]).map((k) => <option key={k} value={k}>{CANCEL_VIA_LABEL[k]}</option>)}
          </select>
        </label>
        <label class="field">
          <span>其他備註</span>
          <input value={cancelNote} maxLength={500} placeholder="例：取消網址" onInput={(e) => setCancelNote(e.currentTarget.value)} />
        </label>
        <div class="dialog-btns">
          {existing ? <button class="btn danger" onClick={del}>刪除</button> : <button class="btn secondary" onClick={onClose}>取消</button>}
          <button class="btn" onClick={save}>儲存</button>
        </div>
      </Sheet>
      {picking && <AccountPicker title="預設扣款帳戶" value={acc} onPick={(id) => id && setAcc(id)} onClose={() => setPicking(false)} />}
    </>
  );
}
