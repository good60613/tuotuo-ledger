import { useState } from 'preact/hooks';
import { useAppState, setState, openOverlay, showToast } from '../store';
import { allBalances, spendableTotal, totals, monthKey, dayKey } from '../data/calc';
import { accountsOfKind, bankAccounts, accountName } from '../selectors';
import { KIND_LABEL, type Account, type AccountKind } from '../data/types';
import { AccountCard } from '../components/AccountCard';
import { Balls } from '../components/Balls';
import type { DropTarget } from '../gestures/cardDrag';
import { money, mdLabel, weekday } from '../format';

export function HomePage() {
  const s = useAppState();
  const d = s.data;
  const bal = allBalances(d);
  const now = new Date();
  const m = totals(d.transactions, { month: monthKey(now) });
  const t = totals(d.transactions, { day: dayKey(now) });
  const [lifted, setLifted] = useState<Account | null>(null);
  const [hover, setHover] = useState<DropTarget | null>(null);

  const ballFirst = (kind: string) => accountsOfKind(d, kind as AccountKind)[0];

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

  const onTap = (acc: Account) => openOverlay({ kind: 'entry', mode: 'expense', accountId: acc.id });

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
        {lifted ? (
          <>
            <div class="drop-zone zone-expense" data-drop="expense">
              <span class="zone-icon">－</span>支出
            </div>
            <div class="drop-zone zone-income" data-drop="income">
              <span class="zone-icon">＋</span>收入
            </div>
          </>
        ) : (
          <div class="home-title">
            <span>{mdLabel(now)}</span>
            <span class="muted">{weekday(now)}</span>
          </div>
        )}
      </header>

      <div class={`drag-hint${lifted ? ' show' : ''}`}>{hint || ' '}</div>

      <div class="cards">
        {bankAccounts(d).map((a) => (
          <AccountCard
            key={a.id}
            account={a}
            balance={bal.get(a.id) ?? 0}
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
        {bankAccounts(d).length === 0 && <div class="empty">還沒有一般帳戶，請到「設定」新增</div>}
      </div>

      <Balls data={d} droppable />

      <div class="amounts">
        <div class="amt-l1">
          <div class="amt-label">剩餘可用</div>
          <div class="amt-big">{money(spendableTotal(d))}</div>
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
