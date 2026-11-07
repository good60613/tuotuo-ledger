// 統計頁（左一）：看全貌。點分類或日期 → 跳到明細頁並篩選好。
import { useState } from 'preact/hooks';
import { useAppState, setState, goPage, PAGES } from '../store';
import { PeriodBar } from '../components/PeriodBar';
import { totals, periodKey, categoryBreakdown, dailySeries, dayKey, periodDays, type CategorySum } from '../data/calc';
import { categoryDisplay } from '../selectors';
import type { AppData } from '../data/types';
import { Donut, LineChart, BarChart, PALETTE } from '../components/Charts';
import { money } from '../format';

const DETAIL = PAGES.indexOf('明細');
const MONTH_ZH = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

export function StatsPage() {
  const s = useAppState();
  const d = s.data;
  // 篩選的帳戶若已被刪除，就當作「全部」
  const acc = d.accounts.some((a) => a.id === s.statsAccountId) ? s.statsAccountId : null;
  const now = new Date();
  const sd = d.settings.settleDay;
  const current = periodKey(now, sd);
  const month = s.statsPeriod ?? current;
  const days = periodDays(month, sd);
  const todayIdx = days.indexOf(dayKey(now)); // 不在這一期＝-1
  const m = totals(d, { period: month, accountId: acc });
  const series = dailySeries(d, month, acc);
  const [lineShow, setLineShow] = useState<'both' | 'expense' | 'income'>('both');
  const [barShow, setBarShow] = useState<'expense' | 'income'>('expense');

  const jump = (p: { categoryId?: string; day?: string }) => {
    setState({ detail: { accountId: acc, categoryId: p.categoryId ?? null, day: p.day ?? null, period: s.statsPeriod } });
    goPage(DETAIL, true); // 淡入淡出，不用滑動
  };

  return (
    <div class="page-pad stats">
      <div class="stats-head">
        <span class="page-title">
          {MONTH_ZH[Number(month.split('-')[1]) - 1]}月統計
          <span class="today-note">今天 {now.getMonth() + 1}/{now.getDate()}</span>
        </span>
        <button class="pill-btn small" disabled={month === current} onClick={() => setState({ statsPeriod: null })}>本月</button>
      </div>

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
        accountId={acc}
        onAccount={(id) => setState({ statsAccountId: id })}
        period={month}
        onPeriod={(p) => setState({ statsPeriod: p })}
      />

      <CategorySection title="支出分類" data={d} list={categoryBreakdown(d, 'expense', month, acc)} total={m.expense} onPick={(id) => jump({ categoryId: id })} />
      <CategorySection title="收入分類" data={d} list={categoryBreakdown(d, 'income', month, acc)} total={m.income} onPick={(id) => jump({ categoryId: id })} />

      <section class="panel">
        <h3>日曆</h3>
        <MonthCalendar days={days} today={dayKey(now)} series={series} onPick={(day) => jump({ day })} />
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
        <LineChart series={series} labels={days.map((k) => String(Number(k.slice(8))))} show={lineShow} upto={todayIdx >= 0 ? todayIdx + 1 : month < current ? series.length : 0} />
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
        <BarChart labels={days.map((k) => String(Number(k.slice(8))))} values={series.map((x) => x[barShow])} color={barShow === 'expense' ? '#d64545' : '#1f9d6b'} />
      </section>

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
        <div class="empty-list small">這一期沒有{title.slice(0, 2)}</div>
      ) : (
        <>
          <div class="pie-row">
            <Donut parts={parts} center={money(total)} />
            <div class="legend">
              {top.map((x, i) => (
                <div key={x.categoryId} class="legend-row">
                  <span class="dot" style={{ background: PALETTE[i] }} />
                  <span class="grow">{categoryDisplay(data, x.categoryId).name}</span>
                  <span class="pct">{Math.round(x.ratio * 100)}%</span>
                  <span class="amt-light">{money(x.amount)}</span>
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
            const c = categoryDisplay(data, x.categoryId);
            return (
              <button key={x.categoryId} class="bar-row" onClick={() => onPick(x.categoryId)}>
                <span class="bar-icon">{c.icon}</span>
                <span class="bar-main">
                  <span class="bar-top">
                    <span>{c.name}</span>
                    <span><span class="pct">{Math.round(x.ratio * 100)}%</span> <span class="amt-light">{money(x.amount)}</span></span>
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

function MonthCalendar({ days, today, series, onPick }: { days: string[]; today: string; series: { income: number; expense: number }[]; onPick: (day: string) => void }) {
  const first = new Date(days[0] + 'T00:00').getDay();
  const cells: (number | null)[] = [...Array(first).fill(null), ...days.map((_, i) => i)];
  return (
    <div class="cal">
      {['日', '一', '二', '三', '四', '五', '六'].map((w) => <div key={w} class="cal-w">{w}</div>)}
      {cells.map((dd, i) => {
        if (dd === null) return <div key={'e' + i} />;
        const t = series[dd];
        const net = t.income - t.expense;
        const key = days[dd];
        return (
          <button key={key} class={`cal-d${key === today ? ' today' : ''}`} onClick={() => onPick(key)}>
            <span class="cal-n">{Number(key.slice(8))}</span>
            {(t.income || t.expense) ? (
              <span class={`cal-v ${net >= 0 ? 'income' : 'expense'}`}>{net >= 0 ? '+' : '-'}{Math.abs(net).toLocaleString('en-US')}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
