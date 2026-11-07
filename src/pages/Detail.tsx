// 明細頁（右一）：時間軸列出每一筆
import { useAppState, setState } from '../store';
import { totals, periodKey, dayKey, touchesAccount, statEffect, kindLookup, inMainLedger } from '../data/calc';
import { categoryDisplay } from '../selectors';
import { Balls } from '../components/Balls';
import { TxList } from '../components/TxList';
import { PeriodBar } from '../components/PeriodBar';
import { openTx, quickEntry } from '../actions';
import { money, mdLabel } from '../format';

export function DetailPage() {
  const s = useAppState();
  const d = s.data;
  // 篩選的帳戶若已被刪除，就當作「全部」
  const f = d.accounts.some((a) => a.id === s.detail.accountId) ? s.detail : { ...s.detail, accountId: null };
  const sd = d.settings.settleDay;
  const period = f.period ?? periodKey(new Date(), sd);
  const m = totals(d, { period, accountId: f.accountId });
  const kindOf = kindLookup(d.accounts);

  const txs = d.transactions.filter(
    (t) =>
      periodKey(t.occurredAt, sd) === period &&
      // 「全部帳戶」＝主帳：有碰到一般帳戶的紀錄（儲值同時出現在主帳和小帳戶子畫面）
      (f.accountId ? touchesAccount(t, f.accountId) : inMainLedger(t, kindOf)) &&
      (!f.categoryId || statEffect(t, kindOf)?.categoryId === f.categoryId) &&
      (!f.day || dayKey(t.occurredAt) === f.day),
  );

  const setFilter = (p: Partial<typeof f>) => setState((st) => ({ detail: { ...st.detail, ...p } }));

  return (
    <div class="page-pad detail">
      <div class="month-sum">
        <div>
          <div class="amt-label">本期支出</div>
          <div class="amt-mid expense">{money(m.expense)}</div>
        </div>
        <div>
          <div class="amt-label">本期收入</div>
          <div class="amt-mid income">{money(m.income)}</div>
        </div>
      </div>

      <PeriodBar
        accountId={f.accountId}
        onAccount={(id) => setFilter({ accountId: id })}
        period={period}
        onPeriod={(p) => setFilter({ period: p })}
      />

      <Balls data={d} />

      {(f.categoryId || f.day) && (
        <div class="filter-chips">
          {f.categoryId && (
            <button class="chip" onClick={() => setFilter({ categoryId: null })}>
              分類：{categoryDisplay(d, f.categoryId).name} ✕
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

    </div>
  );
}
