// 待辦頁的「借我」分頁（2.0 第一批）：別人先幫我付的錢，還錢時選從哪個帳戶付（任何帳戶都可以）。
// 操作比照報帳分頁：點一筆看詳細、長按多選、整批還款；已還的可以退回未還。
import { useEffect, useState } from 'preact/hooks';
import { useAppState, getState, updateData, showToast, ask, PAGES } from '../store';
import { useBackLayer } from '../backNav';
import { markOwedPaid, revertOwedPaid, pendingOwed, paidOwed, OwedError } from '../data/owed';
import type { Transaction } from '../data/types';
import { accountName, categoryOf, bankAccounts } from '../selectors';
import { TxList } from '../components/TxList';
import { BottomBar } from '../components/BottomBar';
import { Sheet } from '../components/Sheet';
import { AccountPicker } from '../components/AccountPicker';
import { openTx } from '../actions';
import { money, hm } from '../format';
import { displayExpr } from '../calcExpr';

export function OwedTab({ onBar }: { onBar?: (on: boolean) => void }) {
  const s = useAppState();
  const d = s.data;
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const [multi, setMulti] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  useBackLayer(s.page === PAGES.indexOf('待辦') && s.todoTab === 'owed' && multi, () => {
    setMulti(false);
    setSel([]);
  });
  const [payIds, setPayIds] = useState<string[] | null>(null);
  const [detail, setDetail] = useState<Transaction | null>(null);

  const pending = pendingOwed(d);
  const done = paidOwed(d);
  const pendingTotal = pending.reduce((a, t) => a + t.amount, 0);
  const doneTotal = done.reduce((a, t) => a + t.amount, 0);
  const selected = sel.filter((id) => pending.some((t) => t.id === id));
  const selTotal = pending.filter((t) => selected.includes(t.id)).reduce((a, t) => a + t.amount, 0);
  const sumOf = (ids: string[]) => d.transactions.filter((t) => ids.includes(t.id)).reduce((a, t) => a + t.amount, 0);

  const showBar = tab === 'pending' && multi && selected.length > 0;
  useEffect(() => {
    onBar?.(showBar);
    return () => onBar?.(false);
  }, [showBar]);

  const switchTab = (t: 'pending' | 'done') => {
    setTab(t);
    setSel([]);
    setMulti(false);
  };

  return (
    <div class="todo-tab owed">
      <div class="todo-total">
        <div class="amt-label">{tab === 'pending' ? '借我未還' : '已還總額'}</div>
        <div class="amt-mid owed-color">{money(tab === 'pending' ? pendingTotal : doneTotal)}</div>
      </div>

      {tab === 'pending' ? (
        <>
          <div class="todo-list">
            <TxList
              data={d}
              txs={pending}
              onTap={(t) => (multi ? setSel((x) => (x.includes(t.id) ? x.filter((i) => i !== t.id) : [...x, t.id])) : setDetail(t))}
              selected={multi ? new Set(selected) : undefined}
              empty="沒有要還的借我 🎉"
              onLongPress={(t) => {
                setMulti(true);
                setSel((x) => (multi ? (x.includes(t.id) ? x : [...x, t.id]) : [t.id]));
              }}
            />
          </div>
          <div class="reimb-tools">
            <span class="muted">{multi ? '點選這次要還的借我（可多筆）' : '點一筆看詳細；長按可多選'}</span>
            <button
              class={`pill-btn small${multi ? ' on' : ''}`}
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
          <div class="todo-list"><TxList data={d} txs={done} onTap={setDetail} empty="還沒有已還的借我" /></div>
          <div class="reimb-tools"><span class="muted">按錯了？點一筆可退回未還</span></div>
        </>
      )}

      <div class="seg todo-sub">
        <button class={tab === 'pending' ? 'on owed' : ''} onClick={() => switchTab('pending')}>未還</button>
        <button class={tab === 'done' ? 'on owed' : ''} onClick={() => switchTab('done')}>已還</button>
      </div>

      {showBar && (
        <BottomBar>
          <div class="action-bar">
            <span>已選 {selected.length} 筆 <b class="owed-color">{money(selTotal)}</b></span>
            <button class="btn owed-btn" onClick={() => setPayIds(selected)}>還錢</button>
          </div>
        </BottomBar>
      )}

      {detail && (
        <OwedDetail
          t={d.transactions.find((x) => x.id === detail.id) ?? detail}
          onClose={() => setDetail(null)}
          onPay={() => {
            setPayIds([detail.id]);
            setDetail(null);
          }}
          onRevert={() => {
            const id = detail.id;
            setDetail(null);
            void askRevertOwed(id);
          }}
        />
      )}

      {payIds && (
        <OwedPay
          ids={payIds}
          total={sumOf(payIds)}
          onClose={() => setPayIds(null)}
          onDone={() => {
            setPayIds(null);
            setSel([]);
            setMulti(false);
          }}
        />
      )}
    </div>
  );
}

/** 退回未還（要確認） */
async function askRevertOwed(owedId: string) {
  const d = getState().data;
  const o = d.transactions.find((t) => t.id === owedId);
  const r = o?.owedPaidTxId ? d.transactions.find((t) => t.id === o.owedPaidTxId) : undefined;
  if (!o || !r) return;
  const v = await ask(
    '退回未還？',
    `退回後，${accountName(d, r.accountId)} 會加回 ${money(r.amount)}，這筆借我回到「未還」，剩餘可用不變。`,
    [
      { label: '取消', value: 'no', style: 'secondary' },
      { label: '退回', value: 'yes', style: 'danger' },
    ],
  );
  if (v !== 'yes') return;
  try {
    updateData((x) => revertOwedPaid(x, owedId));
    showToast('已退回未還');
  } catch (e) {
    showToast(e instanceof OwedError ? e.message : '退回失敗');
  }
}

function OwedDetail({ t, onClose, onPay, onRevert }: { t: Transaction; onClose: () => void; onPay: () => void; onRevert: () => void }) {
  const d = useAppState().data;
  const c = categoryOf(d, t.categoryId);
  const when = new Date(t.occurredAt);
  const isDone = t.owedStatus === 'paid';
  const repay = isDone ? d.transactions.find((x) => x.id === t.owedPaidTxId) : undefined;
  return (
    <Sheet title="借我紀錄" onClose={onClose}>
      <div class="detail-head">
        <span class="tx-icon">{c?.icon ?? '？'}</span>
        <span class="grow detail-name">{c?.name ?? '（已刪除分類）'}</span>
        <span class="amt-mid expense">-{money(t.amount)}</span>
      </div>
      <div class="kv"><span>日期</span><span>{when.getFullYear()}/{when.getMonth() + 1}/{when.getDate()}</span></div>
      <div class="kv"><span>時間</span><span>{hm(when)}</span></div>
      <div class="kv"><span>狀態</span><span class="owed-color">{isDone ? '已還' : '未還（別人先付）'}</span></div>
      {repay && <div class="kv"><span>還款帳戶</span><span>{accountName(d, repay.accountId)}</span></div>}
      {t.calcExpr && <div class="kv"><span>算式</span><span>{displayExpr(t.calcExpr)}</span></div>}
      {t.note && <div class="kv-note">{t.note}</div>}
      <div class="dialog-btns">
        <button
          class="btn secondary"
          onClick={() => {
            onClose();
            openTx(t);
          }}
        >
          ✏️ 編輯
        </button>
        {isDone ? (
          <button class="btn danger" onClick={onRevert}>退回未還</button>
        ) : (
          <button class="btn owed-btn" onClick={onPay}>還錢</button>
        )}
      </div>
    </Sheet>
  );
}

function OwedPay({ ids, total, onClose, onDone }: { ids: string[]; total: number; onClose: () => void; onDone: () => void }) {
  const d = useAppState().data;
  const [acc, setAcc] = useState<string | null>(() => {
    const x = getState().data;
    const last = x.settings.lastUsedAccountId;
    if (last && x.accounts.some((a) => a.id === last)) return last;
    return bankAccounts(x)[0]?.id ?? null;
  });
  const [picking, setPicking] = useState(false);
  const kind = d.accounts.find((a) => a.id === acc)?.kind;

  const confirm = () => {
    if (!acc) return;
    try {
      updateData((x) => markOwedPaid(x, ids, acc));
      showToast(`已還 ${ids.length} 筆，${accountName(getState().data, acc)} 付出 ${money(total)}`);
      onDone();
    } catch (e) {
      showToast(e instanceof OwedError ? e.message : '還款失敗');
    }
  };

  return (
    <>
      <Sheet title="確定已經還錢了嗎？" onClose={onClose}>
        <div class="confirm-sum">
          <div class="muted">共 {ids.length} 筆，合計</div>
          <div class="amt-big owed-color">{money(total)}</div>
        </div>
        <div class="field">
          <span>從哪個帳戶付</span>
          <button class="pill-btn" onClick={() => setPicking(true)}>{acc ? accountName(d, acc) : '選擇帳戶'} ▾</button>
        </div>
        {(kind === 'easycard' || kind === 'ewallet') && (
          <div class="muted small">小提醒：儲值時已經算過一次支出，這筆飯錢在本月支出會多算一次。</div>
        )}
        <div class="muted small">還錢不算支出（記借我時已經算過）。</div>
        <div class="dialog-btns">
          <button class="btn secondary" onClick={onClose}>取消</button>
          <button class="btn owed-btn" disabled={!acc} onClick={confirm}>確認已還</button>
        </div>
      </Sheet>
      {picking && <AccountPicker title="從哪個帳戶付" value={acc} onPick={setAcc} onClose={() => setPicking(false)} />}
    </>
  );
}
