import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useAppState, setState, openOverlay, showToast, goPage, TODO_PAGE, PAGES } from '../store';
import { allBalances, spendableTotal, totals, periodKey, dayKey, pendingBudgetByAccount, pendingBudgetTotal, pendingOwedTotal } from '../data/calc';
import { overdueCount } from '../data/budget';
import { bankAccounts, accountName } from '../selectors';
import { ballDropTarget } from '../data/ops';
import { KIND_LABEL, type Account, type AccountKind } from '../data/types';
import { AccountCard } from '../components/AccountCard';
import { Balls } from '../components/Balls';
import { SideNotes, type SideNote } from '../components/SideNotes';
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
      if (box && !liftedRef.current) setRecentN(Math.max(0, Math.min(HOME.recentCount, Math.floor((box.clientHeight + HOME.recentGapPx) / HOME.recentRowPx))));
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

  // 剩餘可用右側小字欄：預算、借我（同樣式、同位置；開關關掉時未還的借我仍顯示）
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
  if (owedSum > 0) {
    sideItems.push({
      key: 'owed',
      label: '借我',
      amount: owedSum,
      tone: 'owed',
      onClick: () => {
        setState({ todoTab: 'owed' });
        goPage(TODO_PAGE);
      },
    });
  }

  const A = HOME.amount;
  const amtVars = {
    '--amt-today': `${A.todayPx}px`,
    '--amt-month': `${A.monthPx}px`,
    '--amt-left': `${A.leftPx}px`,
    '--amt-label': `${A.labelPx}px`,
    '--amt-budget': `${A.budgetPx}px`,
    '--amt-colgap': `${A.colGapPx}px`,
    '--amt-rowgap': `${A.rowGapMinPx}px`,
    '--amt-short': String(A.shortScale),
  } as Record<string, string>;
  // 最近紀錄區高度固定（拿起卡片換成放置區時也不變），卡片才不會在手指下移動
  const recentH = Math.max(HOME.recentCount * HOME.recentRowPx - HOME.recentGapPx, HOME.dropZoneMinPx);

  return (
    <div class={`home${lifted ? ' lifting' : ''}`}>
      <header class="home-head">
        <div class="home-title">
          <span>{mdLabel(now)}</span>
          <span class="muted">{weekday(now)}</span>
        </div>
      </header>

      {/* 金額區：倒三角，由上往下 今日 → 本月 → 剩餘可用（最大，最靠近卡片） */}
      <div class="amounts" style={amtVars}>
        <div class="amt-row amt-today">
          <div>
            <div class="amt-label">今日收入</div>
            <div class="amt-num income">{money(t.income)}</div>
          </div>
          <div>
            <div class="amt-label">今日支出</div>
            <div class="amt-num expense">{money(t.expense)}</div>
          </div>
        </div>
        <div class="amt-row amt-month">
          <div>
            <div class="amt-label">本月收入</div>
            <div class="amt-num income">{money(m.income)}</div>
          </div>
          <div>
            <div class="amt-label">本月支出</div>
            <div class="amt-num expense">{money(m.expense)}</div>
          </div>
        </div>
        <div class="amt-left">
          <div class="amt-main">
            <div class="amt-label">剩餘可用</div>
            <div class="amt-big">{money(spendableTotal(d))}</div>
          </div>
          {sideItems.length > 0 && <div class="amt-divider" />}
          <SideNotes items={sideItems} />
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

      {/* 最近紀錄：貼在最下面、緊靠導覽列；拿起卡片時換成「支出／收入」兩個放置區（往下拖一小段就到） */}
      <div class="home-recent" ref={recentRef} style={{ height: `${recentH}px`, minHeight: `${HOME.dropZoneMinPx + HOME.dragHintPx}px` }}>
        {lifted ? (
          <>
          <div class="drag-hint show" style={{ height: `${HOME.dragHintPx}px`, lineHeight: `${HOME.dragHintPx}px` }}>{hint}</div>
          <div class="home-zones">
            <div class="drop-zone zone-expense" data-drop="expense">
              <span class="zone-icon">－</span>支出
            </div>
            <div class="drop-zone zone-income" data-drop="income">
              <span class="zone-icon">＋</span>收入
            </div>
          </div>
          </>
        ) : (
          recent.length > 0 && (
            <div class="home-recent-list" style={{ gap: `${HOME.recentGapPx}px` }}>
              {recent.map((t) => (
                <TxCard key={t.id} data={d} t={t} onTap={openTx} selectable={false} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
