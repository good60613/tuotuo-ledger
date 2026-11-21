import { Icon } from './Icon';
// 明細頁與統計頁共用的頂列：左邊「全部帳戶」佔 1/4，右邊是結算期切換（3/4）。
import { useState } from 'preact/hooks';
import { useAppState } from '../store';
import { Sheet } from './Sheet';
import { AccountPicker } from './AccountPicker';
import { periodKey, shiftPeriod } from '../data/calc';
import { accountName } from '../selectors';

export function periodLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${y} 年 ${Number(m)} 月`;
}

interface Props {
  accountId?: string | null;
  onAccount?: (id: string | null) => void;
  /** 小帳戶子畫面不需要帳戶按鈕 */
  hideAccount?: boolean;
  /** 目前顯示的期別（已解析，不是 null） */
  period: string;
  /** null＝回到目前這一期 */
  onPeriod: (p: string | null) => void;
}

export function PeriodBar({ accountId = null, onAccount, hideAccount, period, onPeriod }: Props) {
  const d = useAppState().data;
  const [pickAcc, setPickAcc] = useState(false);
  const [pickPeriod, setPickPeriod] = useState(false);
  const current = periodKey(new Date(), d.settings.settleDay);
  const go = (p: string) => onPeriod(p === current ? null : p);

  // 可選的期別：從最早一筆紀錄所在的期別，到目前這一期
  const first = d.transactions.reduce((m, t) => (t.occurredAt < m ? t.occurredAt : m), new Date().toISOString());
  const earliest = periodKey(first, d.settings.settleDay);
  const list: string[] = [];
  for (let p = current; p >= earliest && list.length < 60; p = shiftPeriod(p, -1)) list.push(p);

  return (
    <div class="acct-period">
      {!hideAccount && (
        <button class="pill-btn" onClick={() => setPickAcc(true)}>
          {accountId ? accountName(d, accountId) : '全部帳戶'} <Icon name="chevron-down" size={14} />
        </button>
      )}
      <div class="period-switch">
        <button class="arrow" onClick={() => go(shiftPeriod(period, -1))} aria-label="上一期"><Icon name="chevron-left" size={18} /></button>
        <button class="label" onClick={() => setPickPeriod(true)}>{periodLabel(period)}</button>
        <button class="arrow" disabled={period >= current} onClick={() => go(shiftPeriod(period, 1))} aria-label="下一期"><Icon name="chevron-right" size={18} /></button>
      </div>

      {pickAcc && (
        <AccountPicker title="切換帳戶" allowAll mainOnly value={accountId} onPick={(id) => onAccount?.(id)} onClose={() => setPickAcc(false)} />
      )}
      {pickPeriod && (
        <Sheet title="選擇月份" onClose={() => setPickPeriod(false)}>
          {list.map((p) => (
            <button
              key={p}
              class={`pick-row${p === period ? ' selected' : ''}`}
              onClick={() => {
                go(p);
                setPickPeriod(false);
              }}
            >
              <span class="pick-name">{periodLabel(p)}</span>
            </button>
          ))}
        </Sheet>
      )}
    </div>
  );
}
