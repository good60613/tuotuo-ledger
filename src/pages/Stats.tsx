import { Icon } from '../components/Icon';
// 統計頁（左一）：看全貌。點分類或日期 → 跳到明細頁並篩選好。
// 2.2：統計一律算全部一般帳戶（篩帳戶到明細看）；底部「年｜‹ 月 ›｜自訂」；頂部浮動小條。
import { catBg } from '../components/CatIcon';
import { useState } from 'preact/hooks';
import { useAppState, setState, goPage, pageIndex } from '../store';
import { BottomBar } from '../components/BottomBar';
import { CollapseHead } from '../components/CollapseHead';
import { Sheet } from '../components/Sheet';
import {
  totals, periodKey, categoryBreakdown, dailySeries, dayKey, periodDays, shiftPeriod,
  scopeTotals, scopeBreakdown, scopeSeries, type CategorySum, type StatScope, type Totals,
} from '../data/calc';
import { categoryDisplay } from '../selectors';
import { budgetPeriodSummary } from '../data/budget';
import type { AppData } from '../data/types';
import { Donut, LineChart, BarChart, PALETTE } from '../components/Charts';
import { money } from '../format';
import { STATS_RANGE } from '../config';
import { loggedDays, currentStreak, streakCheer } from '../data/streak';
import { STREAK_COIN_SRC } from '../coins';

const MONTH_ZH = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const md = (k: string) => `${Number(k.slice(5, 7))}/${Number(k.slice(8))}`;

export function StatsPage() {
  const s = useAppState();
  const d = s.data;
  const now = new Date();
  const sd = d.settings.settleDay;
  const current = periodKey(now, sd);
  const curYear = Number(current.slice(0, 4));
  const month = s.statsPeriod ?? current;
  const mode = s.statsMode === 'custom' && !s.statsCustom ? 'month' : s.statsMode;
  const year = s.statsYear ?? curYear;
  const [lineShow, setLineShow] = useState<'both' | 'expense' | 'income'>('both');
  const [barShow, setBarShow] = useState<'expense' | 'income'>('expense');
  const [pickCustom, setPickCustom] = useState(false);
  // 3.1 打卡：有記帳的日子＋連續天數（一律算到今天，跟正在看哪個月無關）
  const logged = loggedDays(d);
  const streak = currentStreak(logged, now);
  const cheer = streakCheer(streak);

  // ---- 依檢視整理要畫的資料（計算規則全部沿用現有：statEffect） ----
  let scope: StatScope;
  let m: Totals;
  let exp: CategorySum[], inc: CategorySum[];
  let series: Totals[];
  let labels: string[];
  let upto: number;
  let perDay = true;
  let title: string;
  let sumLabel: string;
  let bud: { paid: number; remaining: number; count: number } | null;
  if (mode === 'month') {
    scope = { kind: 'period', key: month };
    const days = periodDays(month, sd);
    const todayIdx = days.indexOf(dayKey(now)); // 不在這一期＝-1
    m = totals(d, { period: month });
    exp = categoryBreakdown(d, 'expense', month, null);
    inc = categoryBreakdown(d, 'income', month, null);
    series = dailySeries(d, month, null);
    labels = days.map((k) => String(Number(k.slice(8))));
    upto = todayIdx >= 0 ? todayIdx + 1 : month < current ? series.length : 0;
    title = `${MONTH_ZH[Number(month.split('-')[1]) - 1]}月統計`;
    sumLabel = '本期';
    bud = budgetPeriodSummary(d, month);
  } else {
    scope = mode === 'year' ? { kind: 'year', year } : { kind: 'custom', ...s.statsCustom! };
    m = scopeTotals(d, scope);
    exp = scopeBreakdown(d, 'expense', scope);
    inc = scopeBreakdown(d, 'income', scope);
    const r = scopeSeries(d, scope, STATS_RANGE.dailyMaxDays);
    series = r.series;
    perDay = r.by === 'day';
    labels = r.keys.map((k) => (perDay ? String(Number(k.slice(8))) : String(Number(k.slice(5, 7)))));
    upto = perDay ? r.keys.filter((k) => k <= dayKey(now)).length : r.keys.filter((k) => k <= current).length;
    if (mode === 'year') {
      title = `${year} 年統計`;
      sumLabel = '全年';
      // 預算以結算期為單位記，年＝十二期相加，和月檢視同一套規則
      bud = { paid: 0, remaining: 0, count: 0 };
      for (let i = 1; i <= 12; i++) {
        const b = budgetPeriodSummary(d, `${year}-${String(i).padStart(2, '0')}`);
        bud.paid += b.paid;
        bud.remaining += b.remaining;
        bud.count += b.count;
      }
    } else {
      title = '自訂統計';
      sumLabel = '區間';
      // 自訂區間可能只切到某一期的一部分，預算（按期記）無法正確拆分 → 不顯示
      bud = null;
    }
  }

  const jump = (p: { categoryId?: string; day?: string }) => {
    // 年、自訂跳到明細時，明細一次只看一期：帶範圍最後一期（不超過本期）
    let period: string | null = s.statsPeriod;
    if (scope.kind === 'year') period = `${year}-12` < current ? `${year}-12` : null;
    if (scope.kind === 'custom') {
      const last = periodKey(scope.to + 'T00:00', sd);
      period = last < current ? last : null;
    }
    setState({ detail: { accountId: null, categoryId: p.categoryId ?? null, day: p.day ?? null, period } });
    goPage(pageIndex('明細'), true); // 淡入淡出，不用滑動
  };

  // ---- 底部：年｜‹ 月 ›｜自訂 ----
  const toMonth = () => setState({ statsMode: 'month', statsPeriod: null });
  let mid: string, prev: (() => void) | null = null, next: (() => void) | null = null;
  if (mode === 'month') {
    mid = `${month.slice(0, 4)} 年 ${Number(month.slice(5))} 月`;
    prev = () => setState({ statsPeriod: shiftPeriod(month, -1) });
    if (month < current) next = () => setState({ statsPeriod: shiftPeriod(month, 1) === current ? null : shiftPeriod(month, 1) });
  } else if (mode === 'year') {
    mid = `${year} 年`;
    prev = () => setState({ statsYear: year - 1 });
    if (year < curYear) next = () => setState({ statsYear: year + 1 === curYear ? null : year + 1 });
  } else {
    mid = `${md(s.statsCustom!.from)}～${md(s.statsCustom!.to)}`;
  }

  return (
    <div class="page-pad stats has-bar">
      <CollapseHead expense={m.expense} income={m.income} label={sumLabel} />
      <div class="stats-head">
        <span class="page-title">
          {title}
          <span class="today-note">{mode === 'custom' ? `${s.statsCustom!.from.replace(/-/g, '/')}～${md(s.statsCustom!.to)}` : `今天 ${now.getMonth() + 1}/${now.getDate()}`}</span>
        </span>
      </div>

      <div class="month-sum">
        <div>
          <div class="amt-label">{sumLabel}支出</div>
          <div class="amt-mid expense">{money(m.expense)}</div>
        </div>
        <div>
          <div class="amt-label">{sumLabel}收入</div>
          <div class="amt-mid income">{money(m.income)}</div>
        </div>
      </div>
      {bud && bud.count > 0 && (
        <div class="stats-budget">
          {sumLabel}預算：已付 <b>{money(bud.paid)}</b>／還剩 <b>{money(bud.remaining)}</b>
        </div>
      )}

      {mode === 'month' && (
        <section class="panel">
          <div class="cal-head">
            <h3>日曆</h3>
            <div class="streak">
              <span class="streak-text">
                {streak.days > 0 && <span class="streak-n">連續記帳 <b>{streak.days}</b> 天</span>}
                <span class="streak-cheer">{cheer.text}</span>
              </span>
              <img class="streak-coin" src={STREAK_COIN_SRC[cheer.coin]} alt="" />
            </div>
          </div>
          <MonthCalendar days={periodDays(month, sd)} today={dayKey(now)} series={series} logged={logged} onPick={(day) => jump({ day })} />
        </section>
      )}

      <CategorySection title="支出分類" data={d} list={exp} total={m.expense} onPick={(id) => jump({ categoryId: id })} />
      <CategorySection title="收入分類" data={d} list={inc} total={m.income} onPick={(id) => jump({ categoryId: id })} />

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
        {/* 只畫到今天（本期），未來的不畫 */}
        <LineChart series={series} labels={labels} show={lineShow} upto={upto} />
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>{perDay ? '每日' : '每月'}{barShow === 'expense' ? '支出' : '收入'}</h3>
          <div class="mini-seg">
            {(['expense', 'income'] as const).map((k) => (
              <button key={k} class={barShow === k ? 'on' : ''} onClick={() => setBarShow(k)}>
                {k === 'expense' ? '支出' : '收入'}
              </button>
            ))}
          </div>
        </div>
        <BarChart labels={labels} values={series.map((x) => x[barShow])} color={barShow === 'expense' ? 'var(--expense)' : 'var(--income)'} />
      </section>

      <BottomBar class="stats-bar">
        <button class={`pill-btn small${mode === 'year' ? ' on' : ''}`} onClick={() => (mode === 'year' ? toMonth() : setState({ statsMode: 'year', statsYear: Number(month.slice(0, 4)) === curYear ? null : Number(month.slice(0, 4)) }))}>年</button>
        <div class="period-switch">
          <button class="arrow" disabled={!prev} onClick={() => prev?.()} aria-label="上一個"><Icon name="chevron-left" size={18} /></button>
          {/* 點中間：回到本期的月檢視 */}
          <button class="label" onClick={toMonth}>{mid}</button>
          <button class="arrow" disabled={!next} onClick={() => next?.()} aria-label="下一個"><Icon name="chevron-right" size={18} /></button>
        </div>
        <button class={`pill-btn small${mode === 'custom' ? ' on' : ''}`} onClick={() => setPickCustom(true)}>自訂</button>
      </BottomBar>

      {pickCustom && (
        <CustomRangeSheet
          initial={s.statsCustom ?? { from: periodDays(current, sd)[0], to: dayKey(now) }}
          onApply={(r) => setState({ statsMode: 'custom', statsCustom: r })}
          onClose={() => setPickCustom(false)}
        />
      )}
    </div>
  );
}

/** 自訂區間：選開始日與結束日（兩天都含）；選反了自動對調 */
function CustomRangeSheet({ initial, onApply, onClose }: { initial: { from: string; to: string }; onApply: (r: { from: string; to: string }) => void; onClose: () => void }) {
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const ok = !!from && !!to;
  return (
    <Sheet title="自訂區間" onClose={onClose}>
      <label class="field">
        <span>開始日</span>
        <input type="date" value={from} onInput={(e) => setFrom((e.target as HTMLInputElement).value)} />
      </label>
      <label class="field">
        <span>結束日</span>
        <input type="date" value={to} onInput={(e) => setTo((e.target as HTMLInputElement).value)} />
      </label>
      <button
        class="btn primary block"
        disabled={!ok}
        onClick={() => {
          onApply(from <= to ? { from, to } : { from: to, to: from });
          onClose();
        }}
      >
        套用
      </button>
    </Sheet>
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
                  <span class="amt-light">{money(x.amount)}</span>
                  <span class="pct">{Math.round(x.ratio * 100)}%</span>
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
                <span class="bar-icon cat-bg" style={c.color ? { background: catBg(c.color) } : undefined}><Icon name={c.icon} size={20} /></span>
                <span class="bar-main">
                  <span class="bar-top">
                    <span>{c.name}</span>
                    <span><span class="amt-light">{money(x.amount)}</span> <span class="pct">{Math.round(x.ratio * 100)}%</span></span>
                  </span>
                  <span class="bar-track"><span class="bar-fill" style={{ width: `${Math.max(2, x.ratio * 100)}%` }} /></span>
                </span>
                <span class="chev"><Icon name="chevron-right" size={16} /></span>
              </button>
            );
          })}
        </>
      )}
    </section>
  );
}

function MonthCalendar({ days, today, series, logged, onPick }: { days: string[]; today: string; series: { income: number; expense: number }[]; logged: Set<string>; onPick: (day: string) => void }) {
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
            <span class={`cal-n${logged.has(key) ? ' stamp' : ''}`}>{Number(key.slice(8))}</span>
            {(t.income || t.expense) ? (
              <span class={`cal-v ${net >= 0 ? 'income' : 'expense'}`}>{net >= 0 ? '+' : '-'}{Math.abs(net).toLocaleString('en-US')}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
