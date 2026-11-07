// 明細頁（右一）：時間軸列出每一筆
import { useState } from 'preact/hooks';
import { useAppState, setState, showToast } from '../store';
import { totals, monthKey, dayKey, touchesAccount } from '../data/calc';
import { accountName, categoryOf } from '../selectors';
import { Balls } from '../components/Balls';
import { TxList } from '../components/TxList';
import { AccountPicker } from '../components/AccountPicker';
import { openTx, quickEntry } from '../actions';
import { money, mdLabel } from '../format';

export function DetailPage() {
  const s = useAppState();
  const d = s.data;
  const f = s.detail;
  const [picking, setPicking] = useState(false);
  const now = new Date();
  const m = totals(d.transactions, { month: monthKey(now), accountId: f.accountId });

  const txs = d.transactions.filter(
    (t) =>
      (!f.accountId || touchesAccount(t, f.accountId)) &&
      (!f.categoryId || t.categoryId === f.categoryId) &&
      (!f.day || dayKey(t.occurredAt) === f.day),
  );

  const setFilter = (p: Partial<typeof f>) => setState((st) => ({ detail: { ...st.detail, ...p } }));

  return (
    <div class="page-pad detail">
      <div class="month-sum">
        <div>
          <div class="amt-label">本月支出</div>
          <div class="amt-mid expense">{money(m.expense)}</div>
        </div>
        <div>
          <div class="amt-label">本月收入</div>
          <div class="amt-mid income">{money(m.income)}</div>
        </div>
      </div>

      <div class="two-btns">
        <button class="pill-btn" onClick={() => setPicking(true)}>
          📚 {f.accountId ? accountName(d, f.accountId) : '全部帳戶'} ▾
        </button>
        <button class="pill-btn muted" onClick={() => showToast('「預算」按鈕的功能之後再決定')}>預算</button>
      </div>

      <Balls data={d} />

      {(f.categoryId || f.day) && (
        <div class="filter-chips">
          {f.categoryId && (
            <button class="chip" onClick={() => setFilter({ categoryId: null })}>
              分類：{categoryOf(d, f.categoryId)?.name ?? '?'} ✕
            </button>
          )}
          {f.day && (
            <button class="chip" onClick={() => setFilter({ day: null })}>
              日期：{mdLabel(new Date(f.day + 'T00:00'))} ✕
            </button>
          )}
        </div>
      )}

      <TxList data={d} txs={txs} onTap={openTx} empty="這個條件下沒有紀錄" />

      <button class="fab" onClick={() => quickEntry(f.accountId)} aria-label="快速記帳">＋</button>

      {picking && (
        <AccountPicker
          title="切換帳戶"
          allowAll
          value={f.accountId}
          onPick={(id) => setFilter({ accountId: id })}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
