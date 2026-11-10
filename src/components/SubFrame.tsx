import { Icon } from './Icon';
// 小帳戶子畫面的共用框架：最上面總額、中間各自的內容、最下面該小帳戶的時間軸（按結算期，附月份切換）、「記一筆」按鈕。
import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useAppState, closeOverlay } from '../store';
import { periodKey } from '../data/calc';
import { PeriodBar } from './PeriodBar';
import { TxList } from './TxList';
import { openTx } from '../actions';
import { SUB_FAB } from '../config';

interface Props {
  title: string;
  /** 總額（已格式化） */
  total: string;
  /** 總額下面的小字（例如投資的本金與損益） */
  subLine?: ComponentChildren;
  /** 右上角按鈕（校正、更新市值） */
  topRight?: ComponentChildren;
  /** 時間軸要顯示哪些帳戶的紀錄 */
  accountIds: string[];
  /** 總額與時間軸之間的內容（卡片列、目標列） */
  children?: ComponentChildren;
  onAdd: () => void;
}

export function SubFrame({ title, total, subLine, topRight, accountIds, children, onAdd }: Props) {
  const d = useAppState().data;
  const sd = d.settings.settleDay;
  const [period, setPeriod] = useState<string | null>(null);
  const cur = period ?? periodKey(new Date(), sd);
  const ids = new Set(accountIds);
  const txs = d.transactions.filter(
    (t) => periodKey(t.occurredAt, sd) === cur && (ids.has(t.accountId) || (!!t.toAccountId && ids.has(t.toAccountId))),
  );

  return (
    <div class="sub-screen" style={{ '--sub-fab-right': `${SUB_FAB.rightPx}px`, '--sub-fab-bottom': `${SUB_FAB.bottomPx}px` }}>
      <div class="sub-top">
        <button class="icon-btn" onClick={closeOverlay} aria-label="返回"><Icon name="chevron-left" /></button>
        <span class="sub-title">{title}</span>
        <span class="sub-top-right">{topRight}</span>
      </div>
      <div class="sub-body">
        <div class="sub-total">{total}</div>
        {subLine && <div class="sub-line">{subLine}</div>}
        {children}
        <PeriodBar hideAccount period={cur} onPeriod={setPeriod} />
        <TxList data={d} txs={txs} onTap={openTx} empty="這一期沒有紀錄" />
      </div>
      <button class="fab" onClick={onAdd} aria-label="記一筆"><Icon name="plus" size={28} /></button>
    </div>
  );
}
