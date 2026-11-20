import { useLayoutEffect, useEffect, useRef, useState } from 'preact/hooks';
import { useAppState, setState, openOverlay, showToast, goPage, TODO_PAGE, PAGES, pageIndex, getState, updateData } from '../store';
import { allBalances, spendableTotal, totals, periodKey, dayKey, pendingBudgetByAccount, pendingBudgetTotal, pendingOwedTotal, recurringReserved } from '../data/calc';
import { overdueCount } from '../data/budget';
import { bankAccounts, accountName } from '../selectors';
import { ballDropTarget, OpError } from '../data/ops';
import { canReassign, reassignAccount, restoreTxs, shownAccountId } from '../data/reassign';
import { KIND_LABEL, type Account, type AccountKind } from '../data/types';
import { AccountCard } from '../components/AccountCard';
import { Balls } from '../components/Balls';
import { SideNotes, type SideNote } from '../components/SideNotes';
import type { DropTarget } from '../gestures/cardDrag';
import { money, mdLabel, weekday } from '../format';
import { TxCard } from '../components/TxList';
import { openTx, quickEntry } from '../actions';
import { pickQuote } from '../quotes';
import logo from '../assets/logo.png';
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
  /** 2.4：拿起的是小帳戶球（只能放到紀錄上）；lifted 是那顆球的預設帳戶（可能沒有） */
  const [liftBall, setLiftBall] = useState<string | null>(null);
  const [hover, setHover] = useState<DropTarget | null>(null);
  const lifting = !!lifted || !!liftBall;
  const liftName = lifted?.name ?? (liftBall ? KIND_LABEL[liftBall as AccountKind] : '');

  // 2.4 拖拖小語：每次回到首頁（換頁回來、關掉記帳頁等畫面回來）換一句
  const onHome = s.page === pageIndex('首頁') && s.overlays.length === 0;
  const [quote, setQuote] = useState(() => pickQuote(d));
  useEffect(() => {
    if (onHome) setQuote(pickQuote(getState().data));
  }, [onHome]);

  const ballFirst = (kind: string) => ballDropTarget(d, kind as AccountKind);
  const banks = bankAccounts(d);

  // ---- 版面：卡片區最多 3 排，超過在卡片區內捲動；最近紀錄依剩餘空間決定筆數 ----
  const cardsRef = useRef<HTMLDivElement>(null);
  const recentRef = useRef<HTMLDivElement>(null);
  const liftedRef = useRef(false);
  liftedRef.current = lifting;
  const [cardsMax, setCardsMax] = useState<number | null>(null);
  const [recentN, setRecentN] = useState(0);
  const scrollable = banks.length > HOME.maxCardRows * 2;
  useLayoutEffect(() => {
    const measure = () => {
      const first = cardsRef.current?.querySelector('.card') as HTMLElement | null;
      setCardsMax(scrollable && first ? first.offsetHeight * HOME.maxCardRows + HOME.cardGapPx * (HOME.maxCardRows - 1) : null);
      const box = recentRef.current;
      // 拿起時中間區換成放置區，高度會變，這時不重算最近紀錄筆數
      // 2.4：扣掉最底下小語列的高度；用 floor 只放得下的整列，最後一列不會被外框切到
      if (box && !liftedRef.current) setRecentN(Math.max(0, Math.min(HOME.recentCount, Math.floor((box.clientHeight - BOTTOM_BAR.navInsetPx - HOME.recentHeadPx - HOME.recentPadPx - HOME.quoteRowPx) / HOME.recentRowPx))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (recentRef.current) ro.observe(recentRef.current);
    if (cardsRef.current) ro.observe(cardsRef.current);
    return () => ro.disconnect();
  }, [banks.length, scrollable]);
  const recent = recentTxs(d.transactions, recentN);

  // 拿起時：支出／收入放置區縮成一排放上面（球不能記帳，就不出現），下面紀錄少放幾筆，空出位置
  const liftRows = liftBall ? recent.length : Math.max(0, recent.length - Math.ceil(Math.max(0, HOME.liftZonePx - HOME.quoteRowPx) / HOME.recentRowPx));

  const hint = (() => {
    if (!lifting) return '';
    if (!hover) return liftBall ? '拖到紀錄上 ＝ 改成這個帳戶；空白處 ＝ 取消' : '放到空白處 ＝ 取消';
    if (hover.kind === 'tx') {
      const tx = d.transactions.find((x) => x.id === hover.id);
      if (!lifted) return `還沒有「${liftName}」帳戶`;
      if (tx && shownAccountId(d, tx) === lifted.id) return '已經是這個帳戶';
      return `放開 ＝ 這筆改成 ${lifted.name}`;
    }
    if (!lifted) return '';
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
    goPage(pageIndex('明細'));
  };

  /** 2.4：改那筆的帳戶。不跳確認，提示條給〔復原〕；同一個帳戶不做事 */
  const reassign = (acc: Account | null, txId: string, kindLabel: string) => {
    if (!acc) {
      showToast(`還沒有「${kindLabel}」帳戶，請到設定新增`);
      return;
    }
    try {
      const r = reassignAccount(getState().data, txId, acc.id);
      if (!r) return;
      updateData(() => r.data);
      showToast(`已改成 ${acc.name}`, () => {
        updateData((x) => restoreTxs(x, r.olds));
        showToast('已復原');
      });
    } catch (e) {
      showToast(e instanceof OpError ? e.message : '改帳戶失敗');
    }
  };

  const ballDrag = {
    onLift: (kind: string) => {
      setLiftBall(kind);
      setLifted(ballFirst(kind) ?? null);
      setHover(null);
      setState({ dragging: true });
    },
    onHover: setHover,
    onDrop: (kind: string, target: DropTarget) => {
      if (target.kind === 'tx') reassign(ballFirst(kind) ?? null, target.id, KIND_LABEL[kind as AccountKind]);
    },
    onEnd: () => {
      setLiftBall(null);
      setLifted(null);
      setHover(null);
      setState({ dragging: false });
    },
  };

  const onDrop = (acc: Account, target: DropTarget) => {
    if (target.kind === 'tx') {
      reassign(acc, target.id, '');
    } else if (target.kind === 'expense' || target.kind === 'income') {
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

      <Balls data={d} droppable drag={ballDrag} />

      {/* 最近紀錄：實心卡，貼在導覽列上方、填滿剩下的高度。
          2.4：每列用明細頁的紀錄列；拿起帳戶卡時上方出現一排「支出／收入」放置區，下面的紀錄可當放置目標（改帳戶） */}
      <div class="home-recent" ref={recentRef} style={{ minHeight: `${HOME.dropZoneMinPx + HOME.dragHintPx}px` }}>
        <div
          class="recent-card"
          style={{
            '--recent-head': `${HOME.recentHeadPx}px`,
            '--recent-pad': `${HOME.recentPadPx}px`,
            '--recent-row': `${HOME.recentRowPx}px`,
            '--quote-row': `${HOME.quoteRowPx}px`,
            '--lift-zone': `${HOME.liftZonePx}px`,
          } as Record<string, string>}
        >
          {lifting ? (
            <div class="recent-head drag-hint show">{hint}</div>
          ) : (
            <div class="recent-head">
              <b>最近紀錄</b>
              {recent.length > 0 && <span class="muted small">最近 {recent.length} 筆</span>}
            </div>
          )}
          {lifting && !liftBall && (
            <div class="home-zones lift">
              <div class="drop-zone zone-expense" data-drop="expense">
                <span class="zone-icon"><Icon name="minus" size={20} /></span>支出
              </div>
              <div class="drop-zone zone-income" data-drop="income">
                <span class="zone-icon"><Icon name="plus" size={20} /></span>收入
              </div>
            </div>
          )}
          <div class="recent-list">
            {(lifting ? recent.slice(0, liftRows) : recent).map((x) => (
              <div key={x.id} class={`recent-slot${canReassign(x) ? '' : ' no-drop'}`} data-drop={canReassign(x) ? `tx:${x.id}` : undefined}>
                <TxCard data={d} t={x} onTap={openTx} selectable={false} withDay />
              </div>
            ))}
            {recent.length === 0 && <div class="recent-empty muted small">還沒有紀錄</div>}
          </div>
          {!lifting && (
            <div class="quote-row">
              <button class="quote-quick" onClick={() => quickEntry(null)}>
                <Icon name="plus" size={16} /> 快速記一筆
              </button>
              <img class="quote-logo" src={logo} alt="" />
              <span class="quote-text">{quote}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
