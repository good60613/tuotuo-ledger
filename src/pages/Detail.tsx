import { Icon } from '../components/Icon';
// 明細頁（右一）：時間軸列出每一筆。2.2：頂部浮動小條、底部篩選膠囊列（帳戶｜日期｜分類｜類型｜🔍）
import { useAppState } from '../store';
import { totals, periodKey, dayKey, touchesAccount, statEffect, kindLookup, inMainLedger } from '../data/calc';
import { Balls } from '../components/Balls';
import { TxList } from '../components/TxList';
import { BottomBar } from '../components/BottomBar';
import { CollapseHead } from '../components/CollapseHead';
import { FilterBar } from '../components/FilterBar';
import { matchSearch, matchType } from '../detailFilter';
import { openTx, quickEntry } from '../actions';
import { money } from '../format';
import { prevBalances } from '../data/prevBalance';
import { prevBalanceOn } from '../features';

export function DetailPage() {
  const s = useAppState();
  const d = s.data;
  // 篩選的帳戶若已被刪除，就當作「全部」
  const f = d.accounts.some((a) => a.id === s.detail.accountId) ? s.detail : { ...s.detail, accountId: null };
  const sd = d.settings.settleDay;
  const period = f.period ?? periodKey(new Date(), sd);
  const m = totals(d, { period, accountId: f.accountId });
  const kindOf = kindLookup(d.accounts);
  // 搜尋的範圍是全部月份，不受日期膠囊限制
  const q = (f.q ?? '').trim();

  const txs = d.transactions.filter(
    (t) =>
      (q ? matchSearch(d, t, q) : periodKey(t.occurredAt, sd) === period && (!f.day || dayKey(t.occurredAt) === f.day)) &&
      // 「全部帳戶」＝主帳：有碰到一般帳戶的紀錄（儲值同時出現在主帳和小帳戶子畫面）
      (f.accountId ? touchesAccount(t, f.accountId) : inMainLedger(t, kindOf)) &&
      (!f.categoryId || statEffect(t, kindOf)?.categoryId === f.categoryId) &&
      (!f.kind || matchType(t, f.kind)),
  );

  return (
    <div class="page-pad detail has-bar">
      <CollapseHead expense={m.expense} income={m.income} />
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

      <Balls data={d} />

      <TxList data={d} txs={txs} onTap={openTx} prevBal={prevBalanceOn(d.settings) ? prevBalances(d) : null} empty={q ? '找不到符合的紀錄' : '這個條件下沒有紀錄'} />

      <button class="fab" onClick={() => quickEntry(f.accountId)} aria-label="快速記帳"><Icon name="plus" size={28} /></button>

      <BottomBar>
        <FilterBar f={f} period={period} />
      </BottomBar>
    </div>
  );
}
