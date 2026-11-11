import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useAppState, setState, openOverlay, showToast, goPage, TODO_PAGE, PAGES } from '../store';
import { allBalances, spendableTotal, totals, periodKey, dayKey, pendingBudgetByAccount, pendingBudgetTotal, pendingOwedTotal, recurringReserved } from '../data/calc';
import { overdueCount } from '../data/budget';
import { bankAccounts, accountName } from '../selectors';
import { ballDropTarget } from '../data/ops';
import { KIND_LABEL, type Account, type AccountKind } from '../data/types';
import { AccountCard } from '../components/AccountCard';
import { Balls } from '../components/Balls';
import { SideNotes, type SideNote } from '../components/SideNotes';
import type { DropTarget } from '../gestures/cardDrag';
import { money, mdLabel, weekday } from '../format';
import { txView } from '../components/TxList';
import { openTx } from '../actions';
import { HOME, HOME_SUM, BOTTOM_BAR } from '../config';
import { Icon } from '../components/Icon';
import type { Transaction } from '../data/types';

/** 最近紀錄：依發生時間由新到舊 */
const recentTxs = (txs: Transaction[], n: number) =>
  [...txs].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt)).slice(0, n);

export function HomePage() {
  const s = useAppState();
  const d = s.data;
  const bal = allBalances(d);
  const budgetBy = pendingBudgetByAccount(d);
  const budgetSum = pendingBudgetTotal(d);
  const overdue = overdueCount(d);
  const owedSum = pendingOwedTotal(d);
  const now = new Date();
  const m = totals(d, { period: periodKey(now, d.settings.settleDay) });
  const t = totals(d, { day: dayKey(now) });
  const [lifted, setLifted] = useState<Account | null>(null);
  const [hover, setHover] = useState<DropTarget | null>(null);

  const ballFirst = (kind: string) => ballDropTarget(d, kind as AccountKind);
  const banks = bankAccounts(d);

  // ---- 版面：卡片區最多 3 排，超過在卡片區內捲動；最近紀錄依剩餘空間決定筆數 ----
  const cardsRef = useRef<HTMLDivElement>(null);
  const recentRef = useRef<HTMLDivElement>(null);
  const liftedRef = useRef(false);
  liftedRef.current = !!lifted;
  const [cardsMax, setCardsMax] = useState<number | null>(null);
  const [recentN, setRecentN] = useState(0);
  const scrollable = banks.length > HOME.maxCardRows * 2;
  useLayoutEffect(() => {
    const measure = () => {
      const first = cardsRef.current?.querySelector('.card') as HTMLElement | null;
      setCardsMax(scrollable && first ? first.offsetHeight * HOME.maxCardRows + HOME.cardGapPx * (HOME.maxCardRows - 1) : null);
      const box = recentRef.current;
      // 拿起時中間區換成放置區，高度會變，這時不重算最近紀錄筆數
      if (box && !liftedRef.current) setRecentN(Math.max(0, Math.min(HOME.recentCount, Math.floor((box.clientHeight - BOTTOM_BAR.navInsetPx - HOME.recentHeadPx - HOME.recentPadPx) / HOME.recentRowPx))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (recentRef.current) ro.observe(recentRef.current);
    if (cardsRef.current) ro.observe(cardsRef.current);
    return () => ro.disconnect();
  }, [banks.length, scrollable]);
  const recent = recentTxs(d.transactions, recentN);

  const hint = (() => {
    if (!lifted) return '';
    if (!hover) return '放到空白處 ＝ 取消';
    switch (hover.kind) {
      case 'expense':
        return `放開 ＝ 記一筆支出（${lifted.name}）`;
      case 'income':
        return `放開 ＝ 記一筆收入（${lifted.name}）`;
      case 'account':
        return hover.id === lifted.id ? '放回原位 ＝ 取消' : `放開 ＝ 轉帳 ${lifted.name} → ${accountName(d, hover.id)}`;
      case 'ball': {
        const a = ballFirst(hover.ballKind);
        return a ? `放開 ＝ 轉帳 ${lifted.name} → ${a.name}` : `還沒有「${KIND_LABEL[hover.ballKind as AccountKind]}」帳戶`;
      }
    }
  })();

  // 點一下卡片：進明細頁並切到該帳戶
  const onTap = (acc: Account) => {
    setState({ detail: { accountId: acc.id, categoryId: null, day: null, period: null } });
    goPage(PAGES.indexOf('明細'));
  };

  const onDrop = (acc: Account, target: DropTarget) => {
    if (target.kind === 'expense' || target.kind === 'income') {
      openOverlay({ kind: 'entry', mode: target.kind, accountId: acc.id });
    } else if (target.kind === 'account') {
      openOverlay({ kind: 'entry', mode: 'transfer', accountId: acc.id, toAccountId: target.id });
    } else {
      const to = ballFirst(target.ballKind);
      if (!to) {
        showToast(`還沒有「${KIND_LABEL[target.ballKind as AccountKind]}」帳戶，請到設定新增`);
        return;
      }
      openOverlay({ kind: 'entry', mode: 'transfer', accountId: acc.id, toAccountId: to.id });
    }
  };

  // 剩餘可用右側小字欄：預算、朋友付（同樣式、同位置；開關關掉時未還的朋友付仍顯示）
  const sideItems: SideNote[] = [];
  if (budgetSum > 0) {
    sideItems.push({
      key: 'budget',
      label: '預算',
      amount: budgetSum,
      tone: 'budget',
      extra: overdue > 0 ? `（${overdue} 筆逾期）` : undefined,
      extraWarn: true,
      onClick: () => {
        setState({ todoTab: 'budget' });
        goPage(TODO_PAGE);
      },
    });
  }
  // 定期扣款：本期還沒扣、已預留的（比照預算）；點了進設定看清單
  const recurSum = recurringReserved(d);
  if (recurSum > 0) {
    sideItems.push({
      key: 'recurring',
      label: '定期扣款',
      amount: recurSum,
      tone: 'budget',
      onClick: () => goPage(PAGES.indexOf('設定')),
    });
  }
  if (owedSum > 0) {
    sideItems.push({
      key: 'owed',
      label: '先欠',
      amount: owedSum,
      tone: 'owed',
      onClick: () => {
        setState({ todoTab: 'owed' });
        goPage(TODO_PAGE);
      },
    });
  }

  const sumVars = {
    '--amt-budget': `${HOME.amount.budgetPx}px`,
    '--amt-k': '1',
    '--sum-gap': `${HOME_SUM.gapPx}px`,
    '--sum-big': `${HOME.sum.bigPx}px`,
    '--sum-label': `${HOME.sum.labelPx}px`,
    '--sum-row': `${HOME.sum.rowPx}px`,
  } as Record<string, string>;
  // 本月、今日：支出（紅）與收入（綠）；數字都用上面已算好的 m、t
  const pair = (x: { expense: number; income: number }) => (
    <div class="sum-vals">
      <span class="expense">-{money(x.expense)}</span>
      <span class="income">+{money(x.income)}</span>
    </div>
  );

  return (
    <div class={`home${lifted ? ' lifting' : ''}`}>
      <header class="home-head">
        <div class="home-title">拖拖記帳</div>
        <div class="home-date muted">
          {mdLabel(now)} {weekday(now)}
        </div>
      </header>

      {/* 剩餘可用大卡（毛玻璃） */}
      <div class="home-sum glass" style={sumVars}>
        <div class="sum-top">
          <div class="sum-main">
            <div class="sum-label">剩餘可用</div>
            <div class="sum-big">{money(spendableTotal(d))}</div>
          </div>
          {sideItems.length > 0 && <div class="amt-divider" />}
          <SideNotes items={sideItems} />
        </div>
        <div class="sum-rows">
          <div class="sum-col">
            <span class="sum-label">本月</span>
            {pair(m)}
          </div>
          <div class="sum-col">
            <span class="sum-label">今日</span>
            {pair(t)}
          </div>
        </div>
      </div>

      <div
        ref={cardsRef}
        class={`cards${scrollable ? ' scrollable' : ''}`}
        style={cardsMax ? { maxHeight: `${cardsMax}px` } : undefined}
      >
        {banks.map((a) => (
          <AccountCard
            key={a.id}
            account={a}
            balance={bal.get(a.id) ?? 0}
            budget={budgetBy.get(a.id) ?? 0}
            onTap={onTap}
            onLift={(acc) => {
              setLifted(acc);
              setHover(null);
              setState({ dragging: true });
            }}
            onHover={setHover}
            onDrop={onDrop}
            onEnd={() => {
              setLifted(null);
              setHover(null);
              setState({ dragging: false });
            }}
          />
        ))}
        {banks.length === 0 && <div class="empty">還沒有一般帳戶，請到「設定」新增</div>}
      </div>

      <Balls data={d} droppable />

      {/* 最近紀錄：實心卡，貼在導覽列上方、填滿剩下的高度；拿起卡片時換成「支出／收入」兩個放置區 */}
      <div class="home-recent" ref={recentRef} style={{ minHeight: `${HOME.dropZoneMinPx + HOME.dragHintPx}px` }}>
        {lifted ? (
          <>
          <div class="drag-hint show" style={{ height: `${HOME.dragHintPx}px`, lineHeight: `${HOME.dragHintPx}px` }}>{hint}</div>
          <div class="home-zones">
            <div class="drop-zone zone-expense" data-drop="expense">
              <span class="zone-icon"><Icon name="minus" size={22} /></span>支出
            </div>
            <div class="drop-zone zone-income" data-drop="income">
              <span class="zone-icon"><Icon name="plus" size={22} /></span>收入
            </div>
          </div>
          </>
        ) : (
          <div class="recent-card" style={{ '--recent-head': `${HOME.recentHeadPx}px`, '--recent-pad': `${HOME.recentPadPx}px` } as Record<string, string>}>
            <div class="recent-head">
              <b>最近紀錄</b>
              {recent.length > 0 && <span class="muted small">最近 {recent.length} 筆</span>}
            </div>
            <div class="recent-list">
              {recent.map((x) => {
                const v = txView(d, x);
                const title = x.note && x.type !== 'reimburse_in' ? x.note : v.title;
                const sub = [v.catName, v.acc?.name].filter(Boolean).join('・');
                return (
                  <button key={x.id} class="recent-row" onClick={() => openTx(x)}>
                    <span class={`recent-icon tx-icon ${v.cls}`} style={v.bg ? { background: v.bg, color: v.fg } : undefined}><Icon name={v.icon} size={20} /></span>
                    <span class="recent-mid">
                      <span class="recent-title">{title}</span>
                      <span class="recent-sub">{sub}</span>
                    </span>
                    <span class={`tx-amt ${v.cls}`}>{v.amt}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
