import { Icon } from '../components/Icon';
// 待辦頁的「預算」分頁（第四批第 3、4 段）：操作比照報帳分頁——可多選、整批按「已支付」。
// 已支付：當天新增一筆真正的支出（金額可改成實際付款金額），帳戶扣款、預算消掉。
import { useEffect, useState } from 'preact/hooks';
import { useAppState, getState, updateData, showToast, ask, PAGES } from '../store';
import { useBackLayer } from '../backNav';
import { markBudgetPaid, revertBudgetPaid, isOverdueBudget, pendingBudgets, paidBudgets, BudgetError } from '../data/budget';
import type { Transaction } from '../data/types';
import { accountName, categoryOf } from '../selectors';
import { TxList } from '../components/TxList';
import { BottomBar } from '../components/BottomBar';
import { Sheet } from '../components/Sheet';
import { openTx } from '../actions';
import { money, hm } from '../format';

/** onBar：多選且有選取時，通知待辦頁把底部切換列換成批次操作列 */
export function BudgetTab({ onBar }: { onBar?: (on: boolean) => void }) {
  const s = useAppState();
  const d = s.data;
  const [tab, setTab] = useState<'pending' | 'paid'>('pending');
  const [multi, setMulti] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  useBackLayer(s.page === PAGES.indexOf('待辦') && s.todoTab === 'budget' && multi, () => {
    setMulti(false);
    setSel([]);
  });
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  const [detail, setDetail] = useState<Transaction | null>(null);

  const pending = pendingBudgets(d);
  const paid = paidBudgets(d);
  const now = new Date();
  const overdue = pending.filter((t) => isOverdueBudget(t, d.settings.settleDay, now)).length;
  const pendingTotal = pending.reduce((a, t) => a + t.amount, 0);
  const paidTotal = paid.reduce((a, t) => a + paidAmount(d.transactions, t), 0);
  const selected = sel.filter((id) => pending.some((t) => t.id === id));
  const selTotal = pending.filter((t) => selected.includes(t.id)).reduce((a, t) => a + t.amount, 0);

  const onTapPending = (t: Transaction) => {
    if (multi) setSel((x) => (x.includes(t.id) ? x.filter((i) => i !== t.id) : [...x, t.id]));
    else setDetail(t);
  };
  const showBar = tab === 'pending' && multi && selected.length > 0;
  useEffect(() => {
    onBar?.(showBar);
    return () => onBar?.(false);
  }, [showBar]);

  const switchTab = (t: 'pending' | 'paid') => {
    setTab(t);
    setSel([]);
    setMulti(false);
  };

  return (
    <div class="todo-tab budget">
      <div class="todo-total">
        <div class="amt-label">{tab === 'pending' ? '未付預算總額' : '已付總額'}</div>
        <div class="amt-mid budget-color">{money(tab === 'pending' ? pendingTotal : paidTotal)}</div>
      </div>

      {tab === 'pending' ? (
        <>
          {overdue > 0 && <div class="notice">有 {overdue} 筆預算已過結算期還沒付，請確認是否已付款。</div>}
          <div class="todo-list">
          <TxList
            data={d}
            txs={pending}
            onTap={onTapPending}
            selected={multi ? new Set(selected) : undefined}
            empty="沒有未付的預算"
            onLongPress={(t) => {
              setMulti(true);
              setSel((x) => (multi ? (x.includes(t.id) ? x : [...x, t.id]) : [t.id]));
            }}
          />
          </div>
          <div class="reimb-tools">
            <span class="muted">{multi ? '點選要付款的預算（可多筆）' : '點一筆看詳細；長按可多選'}</span>
            <button
              class={`pill-btn small budget${multi ? ' on' : ''}`}
              onClick={() => {
                setMulti((m) => !m);
                setSel([]);
              }}
            >
              {multi ? '結束多選' : '多選'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div class="todo-list"><TxList data={d} txs={paid} onTap={setDetail} empty="還沒有已付的預算" /></div>
          <div class="reimb-tools"><span class="muted">按錯了？點一筆可退回未付</span></div>
        </>
      )}

      <div class="seg todo-sub">
        <button class={tab === 'pending' ? 'on budget' : ''} onClick={() => switchTab('pending')}>未付</button>
        <button class={tab === 'paid' ? 'on budget' : ''} onClick={() => switchTab('paid')}>已付</button>
      </div>

      {showBar && (
        <BottomBar>
          <div class="action-bar">
            <span>
              已選 {selected.length} 筆 <b class="budget-color">{money(selTotal)}</b>
            </span>
            <button class="btn budget-btn" onClick={() => setConfirmIds(selected)}>已支付</button>
          </div>
        </BottomBar>
      )}

      {detail && (
        <BudgetDetail
          t={d.transactions.find((x) => x.id === detail.id) ?? detail}
          onClose={() => setDetail(null)}
          onPay={() => {
            setConfirmIds([detail.id]);
            setDetail(null);
          }}
          onRevert={() => {
            const id = detail.id;
            setDetail(null);
            void askRevertBudget(id);
          }}
        />
      )}

      {confirmIds && (
        <PayConfirm
          ids={confirmIds}
          onClose={() => setConfirmIds(null)}
          onDone={() => {
            setConfirmIds(null);
            setSel([]);
            setMulti(false);
          }}
        />
      )}
    </div>
  );
}

/** 已付預算的實際付款金額 */
function paidAmount(txs: Transaction[], b: Transaction): number {
  return txs.find((t) => t.id === b.budgetPaidTxId)?.amount ?? 0;
}

const ymd = (d: Date) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;

function BudgetDetail({ t, onClose, onPay, onRevert }: { t: Transaction; onClose: () => void; onPay: () => void; onRevert: () => void }) {
  const d = useAppState().data;
  const c = categoryOf(d, t.categoryId);
  const when = new Date(t.occurredAt);
  const isPaid = t.budgetStatus === 'paid';
  const pay = isPaid ? d.transactions.find((x) => x.id === t.budgetPaidTxId) : undefined;
  const overdue = !isPaid && isOverdueBudget(t, d.settings.settleDay, new Date());
  return (
    <Sheet title="預算紀錄" onClose={onClose}>
      <div class="detail-head">
        <span class="tx-icon"><Icon name={c?.icon ?? '？'} size={20} /></span>
        <span class="grow detail-name">{c?.name ?? '（已刪除分類）'}</span>
        <span class="amt-mid budget-color">{money(t.amount)}</span>
      </div>
      <div class="kv"><span>日期</span><span>{ymd(when)}</span></div>
      <div class="kv"><span>時間</span><span>{hm(when)}</span></div>
      <div class="kv"><span>帳戶</span><span>{accountName(d, t.accountId)}</span></div>
      <div class="kv">
        <span>狀態</span>
        <span class="budget-color">{isPaid ? '已付' : overdue ? '未付（已過結算期）' : '未付'}</span>
      </div>
      {pay && <div class="kv"><span>實際付款</span><span>{money(pay.amount)}（{ymd(new Date(pay.occurredAt))}）</span></div>}
      {t.note && <div class="kv-note">{t.note}</div>}
      <div class="dialog-btns">
        <button
          class="btn secondary"
          onClick={() => {
            onClose();
            openTx(t);
          }}
        >
          <Icon name="pencil" size={16} /> 編輯
        </button>
        {isPaid ? (
          <button class="btn danger" onClick={onRevert}>退回未付</button>
        ) : (
          <button class="btn budget-btn" onClick={onPay}>已支付</button>
        )}
      </div>
    </Sheet>
  );
}

/** 已支付確認：每一筆可以改成實際付款金額（預設＝預算金額），付款日＝今天 */
function PayConfirm({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: () => void }) {
  const d = useAppState().data;
  const items = ids.map((id) => d.transactions.find((t) => t.id === id)).filter((t): t is Transaction => !!t);
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((t) => [t.id, String(t.amount)])),
  );
  const parsed = items.map((t) => ({ id: t.id, amount: Math.round(Number(amounts[t.id])) }));
  const valid = parsed.every((p) => Number.isFinite(p.amount) && p.amount > 0);
  const total = valid ? parsed.reduce((a, p) => a + p.amount, 0) : 0;

  const confirm = () => {
    if (!valid) return;
    try {
      updateData((x) => markBudgetPaid(x, parsed));
      showToast(`已支付 ${parsed.length} 筆，共 ${money(total)}，已從帳戶扣款`);
      onDone();
    } catch (e) {
      showToast(e instanceof BudgetError ? e.message : '付款失敗');
    }
  };

  return (
    <Sheet title="確定已經付款了嗎？" onClose={onClose}>
      <div class="muted">付款日是今天。實際金額跟預算不同時，直接改金額，帳戶會照實際金額扣款。</div>
      <div class="pay-list">
        {items.map((t) => {
          const c = categoryOf(d, t.categoryId);
          return (
            <label class="pay-row" key={t.id}>
              <span class="grow">
                {c?.name ?? '（已刪除分類）'}
                {t.note ? `・${t.note}` : ''}
                <span class="muted small">　{accountName(d, t.accountId)}・預算 {money(t.amount)}</span>
              </span>
              <input
                class="pay-input"
                inputMode="numeric"
                value={amounts[t.id]}
                onInput={(e) => {
                  const v = e.currentTarget.value.replace(/[^\d]/g, '');
                  setAmounts((a) => ({ ...a, [t.id]: v }));
                }}
              />
            </label>
          );
        })}
      </div>
      <div class="confirm-sum">
        <div class="muted">共 {items.length} 筆，實際付款合計</div>
        <div class="amt-big budget-color">{valid ? money(total) : '—'}</div>
      </div>
      <div class="dialog-btns">
        <button class="btn secondary" onClick={onClose}>取消</button>
        <button class="btn budget-btn" disabled={!valid} onClick={confirm}>確認已支付</button>
      </div>
    </Sheet>
  );
}

/** 退回未付（要確認）：付款那筆支出刪掉，錢加回帳戶 */
async function askRevertBudget(budgetId: string) {
  const d = getState().data;
  const b = d.transactions.find((t) => t.id === budgetId);
  if (!b) return;
  const amt = paidAmount(d.transactions, b);
  const v = await ask(
    '退回未付？',
    `付款那筆 ${money(amt)} 的支出會刪掉，${accountName(d, b.accountId)} 加回 ${money(amt)}，這筆預算回到「未付」。`,
    [
      { label: '取消', value: 'no', style: 'secondary' },
      { label: '退回未付', value: 'yes', style: 'danger' },
    ],
  );
  if (v !== 'yes') return;
  try {
    updateData((x) => revertBudgetPaid(x, budgetId));
    showToast('已退回未付');
  } catch (e) {
    showToast(e instanceof BudgetError ? e.message : '退回失敗');
  }
}
