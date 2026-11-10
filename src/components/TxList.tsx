// 時間軸明細列表：明細頁、待辦頁共用。
import { catBg } from './CatIcon';
import type { AppData, Transaction } from '../data/types';
import { statEffect, kindLookup, dayKey } from '../data/calc';
import { accountName, categoryOf, KIND_ICON } from '../selectors';
import { money, mdLabel, weekday, hm } from '../format';
import { GESTURE } from '../config';
import { vibrate } from '../gestures/haptics';
import { blockClicks } from '../gestures/guard';
import { displayExpr } from '../calcExpr';

interface Props {
  data: AppData;
  txs: Transaction[];
  onTap: (t: Transaction) => void;
  /** 多選模式 */
  selected?: Set<string>;
  empty?: string;
  /** 長按一筆（待辦頁用來進入多選） */
  onLongPress?: (t: Transaction) => void;
}

/** 長按判斷：時間與移動門檻沿用 config.ts 的手勢設定 */
// 狀態放在外面：長按觸發後畫面會重畫，放在函式裡會被重設（同時只會有一根手指在按）
let lpTimer: ReturnType<typeof setTimeout> | undefined;
let lpX0 = 0, lpY0 = 0;
let lpFired = false;

function longPressHandlers(t: Transaction, cb?: (t: Transaction) => void) {
  if (!cb) return {};
  const cancel = () => clearTimeout(lpTimer);
  return {
    onPointerDown: (e: PointerEvent) => {
      lpX0 = e.clientX;
      lpY0 = e.clientY;
      lpFired = false;
      cancel();
      lpTimer = setTimeout(() => {
        lpFired = true;
        vibrate(GESTURE.liftVibrateMs);
        cb(t);
      }, GESTURE.longPressMs);
    },
    onPointerMove: (e: PointerEvent) => {
      if (Math.hypot(e.clientX - lpX0, e.clientY - lpY0) > GESTURE.moveTolerancePx) cancel();
    },
    onPointerUp: () => {
      cancel();
      // 長按後放開手指的那一下，不要再算成點擊
      if (lpFired) blockClicks(GESTURE.afterDropCooldownMs);
      lpFired = false;
    },
    onPointerCancel: cancel,
    onPointerLeave: cancel,
  };
}

export function TxList({ data, txs, onTap, selected, empty, onLongPress }: Props) {
  const sorted = [...txs].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  if (sorted.length === 0) return <div class="empty-list">{empty ?? '沒有紀錄'}</div>;

  const kindOf = kindLookup(data.accounts);
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
          const e = statEffect(t, kindOf);
          if (!e) continue;
          if (e.type === 'income') inc += e.amount;
          else exp += e.amount;
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
                  <TxCard data={data} t={t} onTap={onTap} selected={selected?.has(t.id)} selectable={!!selected} onLongPress={onLongPress} />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** 沒有分類的小帳戶紀錄（配息、費用、利息）的顯示 */
const SOURCE_LABEL: Record<string, [string, string]> = {
  'invest-dividend': ['💵', '配息'],
  'invest-fee': ['🧾', '費用'],
  'saving-interest': ['🪙', '利息'],
};

export function TxCard({ data, t, onTap, selected, selectable, onLongPress }: { data: AppData; t: Transaction; onTap: (t: Transaction) => void; selected?: boolean; selectable: boolean; onLongPress?: (t: Transaction) => void }) {
  const d = new Date(t.occurredAt);
  const acc = data.accounts.find((a) => a.id === (t.type === 'reimburse_in' ? t.toAccountId : t.accountId));
  let icon = '？', title = '', amt = '', cls = '';
  let bg: string | undefined;
  if (t.type === 'transfer') {
    icon = '⇄';
    title = `${accountName(data, t.accountId)} ⇄ ${accountName(data, t.toAccountId)}`;
    amt = money(t.amount);
    cls = 'transfer';
  } else if (t.type === 'reimburse_in') {
    icon = '↩';
    title = `${t.reimburseKind === 'advance' ? '我先付收回' : '報帳入帳'} → ${accountName(data, t.toAccountId)}`;
    amt = '+' + money(t.amount);
    cls = 'reimb-in';
  } else if (t.type === 'owed_repay') {
    // 還朋友錢：從帳戶扣款；用一般帳戶還算支出（補強批）
    icon = '↪';
    title = '還朋友錢';
    amt = '-' + money(t.amount);
    cls = acc?.kind === 'bank' ? 'expense' : 'transfer';
  } else if (t.type === 'adjust') {
    icon = '⚖';
    title = '校正';
    amt = (t.adjustDir === 'down' ? '-' : '+') + money(t.amount);
    cls = 'transfer';
  } else if (t.type === 'valuation') {
    icon = '📈';
    title = '更新市值';
    amt = money(t.amount);
    cls = 'transfer';
  } else if (!t.categoryId && t.source && SOURCE_LABEL[t.source]) {
    icon = SOURCE_LABEL[t.source][0];
    title = SOURCE_LABEL[t.source][1];
    amt = (t.type === 'expense' ? '-' : '+') + money(t.amount);
    cls = t.type;
  } else {
    const c = categoryOf(data, t.categoryId);
    icon = c?.icon ?? '？';
    if (c) bg = catBg(c.color);
    title = c?.name ?? '（已刪除分類）';
    amt = (t.type === 'expense' || t.type === 'owed' ? '-' : '+') + money(t.amount);
    // 朋友付記帳當天不算支出（還錢那天才算），用灰色
    cls = t.type === 'owed' ? 'transfer' : t.type;
  }
  // 報帳／預算標示：未結案＝彩色外框＋「報」「預」；結案＝拿掉外框，留淺色「已報」「已付」。色弱靠小字辨識
  let flag: { cls: string; text: string } | null = null;
  let frame = '';
  // 我先付、朋友付比照：未結案「墊」「借」＋外框；結案淺色「已收」「已還」
  if (t.reimbursable && t.reimburseKind === 'advance') {
    if (t.reimburseStatus === 'done') flag = { cls: 'done', text: '已收' };
    else {
      flag = { cls: 'advance', text: '我付' };
      frame = ' tag-advance';
    }
  } else if (t.type === 'owed') {
    if (t.owedStatus === 'paid') flag = { cls: 'done', text: '已還' };
    else {
      flag = { cls: 'owed', text: '友付' };
      frame = ' tag-owed';
    }
  } else if (t.reimbursable) {
    if (t.reimburseStatus === 'done') flag = { cls: 'done', text: '已報' };
    else {
      flag = { cls: 'reimb', text: '報' };
      frame = ' tag-reimb';
    }
  } else if (t.budget) {
    if (t.budgetStatus === 'paid') flag = { cls: 'done', text: '已付' };
    else {
      flag = { cls: 'budget', text: '預' };
      frame = ' tag-budget';
    }
  }
  return (
    <button class={`tx-card${frame}${selected ? ' selected' : ''}`} onClick={() => onTap(t)} {...longPressHandlers(t, onLongPress)}>
      {selectable && <span class={`check${selected ? ' on' : ''}`}>{selected ? '✓' : ''}</span>}
      <span class={`tx-icon ${cls}`} style={bg ? { background: bg } : undefined}>{icon}</span>
      <span class="tx-mid">
        <span class="tx-title">
          {title}
          {t.note && t.type !== 'reimburse_in' && <span class="tx-note"> · {t.note}</span>}
        </span>
        <span class="tx-sub">
          {hm(d)}
          {t.type !== 'transfer' && acc && <> · {KIND_ICON[acc.kind]} {acc.name}</>}
          {t.type === 'adjust' && <span class="badge calib">不計收支</span>}
          {t.type === 'owed' && <> · 別人先付</>}
          {t.calcExpr && <span class="tx-expr"> · {displayExpr(t.calcExpr)}</span>}
          {flag && <span class={`tx-flag ${flag.cls}`}>{flag.text}</span>}
        </span>
      </span>
      <span class={`tx-amt ${cls}`}>{amt}</span>
    </button>
  );
}
