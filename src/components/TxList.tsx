// 時間軸明細列表：明細頁、報帳頁共用。
import type { AppData, Transaction } from '../data/types';
import { countsInStats, dayKey } from '../data/calc';
import { accountName, categoryOf, KIND_ICON } from '../selectors';
import { money, mdLabel, weekday, hm } from '../format';

interface Props {
  data: AppData;
  txs: Transaction[];
  onTap: (t: Transaction) => void;
  /** 多選模式 */
  selected?: Set<string>;
  empty?: string;
}

export function TxList({ data, txs, onTap, selected, empty }: Props) {
  const sorted = [...txs].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  if (sorted.length === 0) return <div class="empty-list">{empty ?? '沒有紀錄'}</div>;

  const groups: { day: string; items: Transaction[] }[] = [];
  for (const t of sorted) {
    const k = dayKey(t.occurredAt);
    if (groups.length === 0 || groups[groups.length - 1].day !== k) groups.push({ day: k, items: [] });
    groups[groups.length - 1].items.push(t);
  }

  return (
    <div class="timeline">
      {groups.map((g) => {
        const date = new Date(g.items[0].occurredAt);
        let inc = 0, exp = 0;
        for (const t of g.items) {
          if (!countsInStats(t)) continue;
          if (t.type === 'income') inc += t.amount;
          else exp += t.amount;
        }
        let lastHour = -1;
        return (
          <div class="day" key={g.day} data-day={g.day}>
            <div class="day-head">
              <span class="day-date">{mdLabel(date)} <span class="muted">{weekday(date)}</span></span>
              <span class="day-sum">
                {inc > 0 && <span class="income">收 {money(inc)}</span>}
                {exp > 0 && <span class="expense">支 {money(exp)}</span>}
              </span>
            </div>
            {g.items.map((t) => {
              const d = new Date(t.occurredAt);
              const h = d.getHours();
              const mark = h !== lastHour;
              lastHour = h;
              return (
                <div class="tl-row" key={t.id}>
                  <div class="tl-axis">
                    {mark && <span class="tl-hour">{String(h).padStart(2, '0')}:00</span>}
                    <span class="tl-dot" />
                  </div>
                  <TxCard data={data} t={t} onTap={onTap} selected={selected?.has(t.id)} selectable={!!selected} />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function TxCard({ data, t, onTap, selected, selectable }: { data: AppData; t: Transaction; onTap: (t: Transaction) => void; selected?: boolean; selectable: boolean }) {
  const d = new Date(t.occurredAt);
  const acc = data.accounts.find((a) => a.id === (t.type === 'reimburse_in' ? t.toAccountId : t.accountId));
  let icon = '？', title = '', amt = '', cls = '';
  if (t.type === 'transfer') {
    icon = '⇄';
    title = `${accountName(data, t.accountId)} ⇄ ${accountName(data, t.toAccountId)}`;
    amt = money(t.amount);
    cls = 'transfer';
  } else if (t.type === 'reimburse_in') {
    icon = '↩';
    title = `報帳入帳 → ${accountName(data, t.toAccountId)}`;
    amt = '+' + money(t.amount);
    cls = 'reimb-in';
  } else {
    const c = categoryOf(data, t.categoryId);
    icon = c?.icon ?? '？';
    title = c?.name ?? '（已刪除分類）';
    amt = (t.type === 'expense' ? '-' : '+') + money(t.amount);
    cls = t.type;
  }
  return (
    <button class={`tx-card${selected ? ' selected' : ''}`} onClick={() => onTap(t)}>
      {selectable && <span class={`check${selected ? ' on' : ''}`}>{selected ? '✓' : ''}</span>}
      <span class={`tx-icon ${cls}`}>{icon}</span>
      <span class="tx-mid">
        <span class="tx-title">
          {title}
          {t.note && t.type !== 'reimburse_in' && <span class="tx-note"> · {t.note}</span>}
        </span>
        <span class="tx-sub">
          {hm(d)}
          {t.type !== 'transfer' && acc && <> · {KIND_ICON[acc.kind]} {acc.name}</>}
          {t.reimbursable && (
            <span class={`badge ${t.reimburseStatus === 'done' ? 'done' : 'pending'}`}>
              {t.reimburseStatus === 'done' ? '已報帳' : '待報帳'}
            </span>
          )}
        </span>
      </span>
      <span class={`tx-amt ${cls}`}>{amt}</span>
    </button>
  );
}
