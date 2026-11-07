// 統計頁（左一）：看全貌。點分類或日期 → 跳到明細頁並篩選好。
import { useState } from 'preact/hooks';
import { useAppState, setState, goPage, PAGES } from '../store';
import { totals, monthKey, categoryBreakdown, dailySeries, dayKey, type CategorySum } from '../data/calc';
import { accountName, categoryOf } from '../selectors';
import type { AppData } from '../data/types';
import { AccountPicker } from '../components/AccountPicker';
import { Donut, LineChart, BarChart, PALETTE } from '../components/Charts';
import { money } from '../format';

const DETAIL = PAGES.indexOf('明細');

export function StatsPage() {
  const s = useAppState();
  const d = s.data;
  const acc = s.statsAccountId;
  const now = new Date();
  const month = monthKey(now);
  const m = totals(d.transactions, { month, accountId: acc });
  const series = dailySeries(d.transactions, month, acc);
  const [picking, setPicking] = useState(false);
  const [lineShow, setLineShow] = useState<'both' | 'expense' | 'income'>('both');
  const [barShow, setBarShow] = useState<'expense' | 'income'>('expense');

  const jump = (p: { categoryId?: string; day?: string }) => {
    setState({ detail: { accountId: acc, categoryId: p.categoryId ?? null, day: p.day ?? null } });
    goPage(DETAIL);
  };

  return (
    <div class="page-pad stats">
      <div class="stats-head">
        <span class="page-title">{now.getMonth() + 1} 月統計</span>
        {/* 月度切換之後再做，先保留位置 */}
        <span class="month-switch-slot muted" title="月份切換之後再做">本月</span>
      </div>

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
          📚 {acc ? accountName(d, acc) : '全部帳戶'} ▾
        </button>
      </div>

      <CategorySection title="支出分類" data={d} list={categoryBreakdown(d.transactions, 'expense', month, acc)} total={m.expense} onPick={(id) => jump({ categoryId: id })} />
      <CategorySection title="收入分類" data={d} list={categoryBreakdown(d.transactions, 'income', month, acc)} total={m.income} onPick={(id) => jump({ categoryId: id })} />

      <section class="panel">
        <h3>日曆</h3>
        <MonthCalendar now={now} series={series} onPick={(day) => jump({ day })} />
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>收支曲線</h3>
          <div class="mini-seg">
            {(['both', 'expense', 'income'] as const).map((k) => (
              <button key={k} class={lineShow === k ? 'on' : ''} onClick={() => setLineShow(k)}>
                {k === 'both' ? '全部' : k === 'expense' ? '支出' : '收入'}
              </button>
            ))}
          </div>
        </div>
        {/* 只畫到今天，未來的日子不畫 */}
        <LineChart series={series} show={lineShow} upto={now.getDate()} />
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>每日{barShow === 'expense' ? '支出' : '收入'}</h3>
          <div class="mini-seg">
            {(['expense', 'income'] as const).map((k) => (
              <button key={k} class={barShow === k ? 'on' : ''} onClick={() => setBarShow(k)}>
                {k === 'expense' ? '支出' : '收入'}
              </button>
            ))}
          </div>
        </div>
        <BarChart values={series.map((x) => x[barShow])} color={barShow === 'expense' ? '#d64545' : '#1f9d6b'} />
      </section>

      {picking && (
        <AccountPicker
          title="切換帳戶"
          allowAll
          value={acc}
          onPick={(id) => setState({ statsAccountId: id })}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

function CategorySection({ title, data, list, total, onPick }: { title: string; data: AppData; list: CategorySum[]; total: number; onPick: (id: string) => void }) {
  const top = list.slice(0, 5);
  const rest = list.slice(5).reduce((s, x) => s + x.amount, 0);
  const parts = [...top.map((x, i) => ({ value: x.amount, color: PALETTE[i] })), ...(rest > 0 ? [{ value: rest, color: PALETTE[5] }] : [])];
  return (
    <section class="panel">
      <h3>{title}</h3>
      {list.length === 0 ? (
        <div class="empty-list small">本月沒有{title.slice(0, 2)}</div>
      ) : (
        <>
          <div class="pie-row">
            <Donut parts={parts} center={money(total)} />
            <div class="legend">
              {top.map((x, i) => (
                <div key={x.categoryId} class="legend-row">
                  <span class="dot" style={{ background: PALETTE[i] }} />
                  <span class="grow">{categoryOf(data, x.categoryId)?.name ?? '（已刪除）'}</span>
                  <span>{Math.round(x.ratio * 100)}%</span>
                </div>
              ))}
              {rest > 0 && (
                <div class="legend-row muted">
                  <span class="dot" style={{ background: PALETTE[5] }} />
                  <span class="grow">其餘</span>
                  <span>{Math.round((rest / total) * 100)}%</span>
                </div>
              )}
            </div>
          </div>
          {list.map((x) => {
            const c = categoryOf(data, x.categoryId);
            return (
              <button key={x.categoryId} class="bar-row" onClick={() => onPick(x.categoryId)}>
                <span class="bar-icon">{c?.icon ?? '？'}</span>
                <span class="bar-main">
                  <span class="bar-top">
                    <span>{c?.name ?? '（已刪除）'}</span>
                    <span>{money(x.amount)} <span class="muted">{Math.round(x.ratio * 100)}%</span></span>
                  </span>
                  <span class="bar-track"><span class="bar-fill" style={{ width: `${Math.max(2, x.ratio * 100)}%` }} /></span>
                </span>
                <span class="chev">›</span>
              </button>
            );
          })}
        </>
      )}
    </section>
  );
}

function MonthCalendar({ now, series, onPick }: { now: Date; series: { income: number; expense: number }[]; onPick: (day: string) => void }) {
  const y = now.getFullYear(), mo = now.getMonth();
  const first = new Date(y, mo, 1).getDay();
  const todayKey = dayKey(now);
  const cells: (number | null)[] = [...Array(first).fill(null), ...series.map((_, i) => i + 1)];
  return (
    <div class="cal">
      {['日', '一', '二', '三', '四', '五', '六'].map((w) => <div key={w} class="cal-w">{w}</div>)}
      {cells.map((dd, i) => {
        if (dd === null) return <div key={'e' + i} />;
        const t = series[dd - 1];
        const net = t.income - t.expense;
        const key = dayKey(new Date(y, mo, dd));
        return (
          <button key={key} class={`cal-d${key === todayKey ? ' today' : ''}`} onClick={() => onPick(key)}>
            <span class="cal-n">{dd}</span>
            {(t.income || t.expense) ? (
              <span class={`cal-v ${net >= 0 ? 'income' : 'expense'}`}>{net >= 0 ? '+' : '-'}{Math.abs(net).toLocaleString('en-US')}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
