import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useAppState, setState, openOverlay, showToast, goPage, TODO_PAGE, PAGES } from '../store';
import { allBalances, spendableTotal, totals, periodKey, dayKey, pendingBudgetByAccount, pendingBudgetTotal } from '../data/calc';
import { overdueCount } from '../data/budget';
import { bankAccounts, accountName } from '../selectors';
import { ballDropTarget } from '../data/ops';
import { KIND_LABEL, type Account, type AccountKind } from '../data/types';
import { AccountCard } from '../components/AccountCard';
import { Balls } from '../components/Balls';
import type { DropTarget } from '../gestures/cardDrag';
import { money, mdLabel, weekday } from '../format';
import { TxCard } from '../components/TxList';
import { openTx } from '../actions';
import { HOME } from '../config';
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
      if (box && !liftedRef.current) setRecentN(Math.max(0, Math.min(HOME.recentMax, Math.floor(box.clientHeight / HOME.recentRowPx))));
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

  return (
    <div class={`home${lifted ? ' lifting' : ''}`}>
      <header class="home-head">
        <div class="home-title">
          <span>{mdLabel(now)}</span>
          <span class="muted">{weekday(now)}</span>
        </div>
      </header>

      <div class={`drag-hint${lifted ? ' show' : ''}`}>{hint || ' '}</div>

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

      {/* 最近紀錄：這一格吃掉剩下的高度；拿起卡片時換成「支出／收入」兩個放置區 */}
      <div class="home-recent" ref={recentRef} style={lifted ? { minHeight: `${HOME.dropZoneMinPx}px` } : undefined}>
        {lifted ? (
          <div class="home-zones">
            <div class="drop-zone zone-expense" data-drop="expense">
              <span class="zone-icon">－</span>支出
            </div>
            <div class="drop-zone zone-income" data-drop="income">
              <span class="zone-icon">＋</span>收入
            </div>
          </div>
        ) : (
          recent.length > 0 && (
            <div class="home-recent-list">
              {recent.map((t) => (
                <TxCard key={t.id} data={d} t={t} onTap={openTx} selectable={false} />
              ))}
            </div>
          )
        )}
      </div>

      <div class="amounts">
        <div class="amt-l1">
          <div class="amt-label">剩餘可用</div>
          <div class="amt-big">{money(spendableTotal(d))}</div>
          {budgetSum > 0 && (
            <button
              class="amt-budget"
              onClick={() => {
                setState({ todoTab: 'budget' });
                goPage(TODO_PAGE);
              }}
            >
              已圈預算 <b>{money(budgetSum)}</b>
              {overdue > 0 && <span class="overdue">（{overdue} 筆逾期）</span>}
            </button>
          )}
        </div>
        <div class="amt-l2">
          <div>
            <div class="amt-label">本月收入</div>
            <div class="amt-mid income">{money(m.income)}</div>
          </div>
          <div>
            <div class="amt-label">本月支出</div>
            <div class="amt-mid expense">{money(m.expense)}</div>
          </div>
        </div>
        <div class="amt-l3">
          <span>今日收入 <b class="income">{money(t.income)}</b></span>
          <span>今日支出 <b class="expense">{money(t.expense)}</b></span>
        </div>
      </div>
    </div>
  );
}
