import { Icon } from '../components/Icon';
// 待辦頁的「報帳」「我先付」分頁：追蹤公司／朋友還欠多少錢。（第四批起從報帳頁搬進待辦頁）
// 2.0：我先付沿用報帳同一套（reimbursable＋reimburseKind='advance'），只有文字與顏色不同。

export type ClaimKind = 'reimb' | 'advance';

const TXT = {
  reimb: { pending: '待報帳', done: '已報帳', pendingTotal: '待報帳總額', doneTotal: '已收回總額', emptyPending: '沒有待報帳的紀錄', emptyDone: '還沒有已報帳的紀錄', pickHint: '點選要報帳的紀錄（可多筆）', revertHint: '按錯了？點一筆可整批退回待報帳', act: '已報帳', revert: '退回待報帳', title: '報帳紀錄' },
  advance: { pending: '待收回', done: '已收回', pendingTotal: '先付待收回', doneTotal: '已收回總額', emptyPending: '沒有待收回的款項', emptyDone: '還沒有已收回的款項', pickHint: '點選朋友還了的款項（可多筆）', revertHint: '按錯了？點一筆可整批退回待收回', act: '已收回', revert: '退回待收回', title: '先付紀錄' },
} as const;
import { useEffect, useState } from 'preact/hooks';
import { useAppState, getState, updateData, showToast, PAGES } from '../store';
import { useBackLayer } from '../backNav';
import { markReimbursed, defaultReimburseAccount, OpError } from '../data/ops';
import type { Transaction } from '../data/types';
import { accountName, categoryOf } from '../selectors';
import { TxList } from '../components/TxList';
import { BottomBar } from '../components/BottomBar';
import { Sheet } from '../components/Sheet';
import { AccountPicker } from '../components/AccountPicker';
import { askRevertBatch, openTx } from '../actions';
import { money, hm } from '../format';
import { displayExpr } from '../calcExpr';

/** onBar：多選且有選取時，通知待辦頁把底部切換列換成批次操作列 */
export function ReimburseTab({ onBar, kind = 'reimb' }: { onBar?: (on: boolean) => void; kind?: ClaimKind }) {
  const T = TXT[kind];
  const isKind = (t: Transaction) => (t.reimburseKind === 'advance') === (kind === 'advance');
  const s = useAppState();
  const d = s.data;
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const [multi, setMulti] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  // 多選模式中按返回：結束多選
  useBackLayer(s.page === PAGES.indexOf('待辦') && s.todoTab === kind && multi, () => {
    setMulti(false);
    setSel([]);
  });
  /** 要報帳確認的紀錄（null＝沒開確認視窗） */
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  /** 點一筆時跳出的詳細卡片 */
  const [detail, setDetail] = useState<Transaction | null>(null);

  const pending = d.transactions.filter((t) => t.reimbursable && isKind(t) && t.reimburseStatus === 'pending');
  const done = d.transactions.filter((t) => t.reimbursable && isKind(t) && t.reimburseStatus === 'done');
  const pendingTotal = pending.reduce((a, t) => a + t.amount, 0);
  const doneTotal = done.reduce((a, t) => a + t.amount, 0);
  // 選取中的紀錄若已不存在（例如被刪除）就自動略過
  const selected = sel.filter((id) => pending.some((t) => t.id === id));
  const selTotal = pending.filter((t) => selected.includes(t.id)).reduce((a, t) => a + t.amount, 0);

  const onTapPending = (t: Transaction) => {
    if (multi) setSel((x) => (x.includes(t.id) ? x.filter((i) => i !== t.id) : [...x, t.id]));
    else setDetail(t);
  };
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
    <div class={`todo-tab ${kind}`}>
      <div class="todo-total">
        <div class="amt-label">{tab === 'pending' ? T.pendingTotal : T.doneTotal}</div>
        <div class={`amt-mid ${kind}-color`}>{money(tab === 'pending' ? pendingTotal : doneTotal)}</div>
      </div>

      {tab === 'pending' ? (
        <>
          <div class="todo-list">
          <TxList
            data={d}
            txs={pending}
            onTap={onTapPending}
            selected={multi ? new Set(selected) : undefined}
            empty={T.emptyPending}
            onLongPress={(t) => {
              // 長按＝進入多選，並勾起這一筆
              setMulti(true);
              setSel((x) => (multi ? (x.includes(t.id) ? x : [...x, t.id]) : [t.id]));
            }}
          />
          </div>
          <div class="reimb-tools">
            <span class="muted">{multi ? T.pickHint : '點一筆看詳細；長按可多選'}</span>
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
          <div class="todo-list"><TxList data={d} txs={done} onTap={setDetail} empty={T.emptyDone} /></div>
          <div class="reimb-tools"><span class="muted">{T.revertHint}</span></div>
        </>
      )}

      <div class="seg todo-sub">
        <button class={tab === 'pending' ? `on ${kind}` : ''} onClick={() => switchTab('pending')}>{T.pending}</button>
        <button class={tab === 'done' ? `on ${kind}` : ''} onClick={() => switchTab('done')}>{T.done}</button>
      </div>

      {showBar && (
        <BottomBar>
          <div class="action-bar">
            <span>
              已選 {selected.length} 筆 <b class={`${kind}-color`}>{money(selTotal)}</b>
            </span>
            <button class={`btn ${kind}-btn`} onClick={() => setConfirmIds(selected)}>{T.act}</button>
          </div>
        </BottomBar>
      )}

      {detail && (
        <TxDetail
          kind={kind}
          t={d.transactions.find((x) => x.id === detail.id) ?? detail}
          onClose={() => setDetail(null)}
          onReimburse={() => {
            setConfirmIds([detail.id]);
            setDetail(null);
          }}
          onRevert={() => {
            const b = detail.reimburseBatchId;
            setDetail(null);
            if (b) askRevertBatch(b);
          }}
        />
      )}

      {confirmIds && (
        <ReimburseConfirm
          kind={kind}
          ids={confirmIds}
          total={sumOf(confirmIds)}
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

/** 點一筆時跳出的詳細卡片（參考 PK 舊 App 的做法） */
function TxDetail({ kind, t, onClose, onReimburse, onRevert }: { kind: ClaimKind; t: Transaction; onClose: () => void; onReimburse: () => void; onRevert: () => void }) {
  const d = useAppState().data;
  const c = categoryOf(d, t.categoryId);
  const when = new Date(t.occurredAt);
  const isDone = t.reimburseStatus === 'done';
  const T = TXT[kind];
  return (
    <Sheet title={T.title} onClose={onClose}>
      <div class="detail-head">
        <span class="tx-icon"><Icon name={c?.icon ?? '？'} size={20} /></span>
        <span class="grow detail-name">{c?.name ?? '（已刪除分類）'}</span>
        <span class="amt-mid expense">-{money(t.amount)}</span>
      </div>
      <div class="kv"><span>日期</span><span>{when.getFullYear()}/{when.getMonth() + 1}/{when.getDate()}</span></div>
      <div class="kv"><span>時間</span><span>{hm(when)}</span></div>
      <div class="kv"><span>扣款帳戶</span><span>{accountName(d, t.accountId)}</span></div>
      <div class="kv"><span>狀態</span><span class={`${kind}-color`}>{isDone ? T.done : T.pending}</span></div>
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
          <Icon name="pencil" size={16} /> 編輯
        </button>
        {isDone ? (
          <button class="btn danger" onClick={onRevert}>{T.revert}</button>
        ) : (
          <button class={`btn ${kind}-btn`} onClick={onReimburse}>{T.act}</button>
        )}
      </div>
    </Sheet>
  );
}

function ReimburseConfirm({ kind, ids, total, onClose, onDone }: { kind: ClaimKind; ids: string[]; total: number; onClose: () => void; onDone: () => void }) {
  const d = useAppState().data;
  const [acc, setAcc] = useState<string | null>(() =>
    kind === 'advance'
      ? getState().data.transactions.find((t) => t.id === ids[0])?.accountId ?? null
      : defaultReimburseAccount(getState().data, ids),
  );
  const [picking, setPicking] = useState(false);
  const usedDefault = kind === 'reimb' && !!d.settings.defaultReimburseAccountId && acc === d.settings.defaultReimburseAccountId;

  const confirm = () => {
    if (!acc) return;
    try {
      updateData((x) => markReimbursed(x, ids, acc));
      showToast(`${kind === 'advance' ? '已收回' : '已報帳'} ${ids.length} 筆，${money(total)} 已存入${accountName(getState().data, acc)}`);
      onDone();
    } catch (e) {
      showToast(e instanceof OpError ? e.message : '結案失敗');
    }
  };

  return (
    <>
      <Sheet title="確定已收到這筆錢嗎？" onClose={onClose}>
        <div class="confirm-sum">
          <div class="muted">共 {ids.length} 筆，合計</div>
          <div class={`amt-big ${kind}-color`}>{money(total)}</div>
        </div>
        <div class="field">
          <span>錢進了哪個帳戶{usedDefault ? '（預設報帳帳戶）' : ''}</span>
          <button class="pill-btn" onClick={() => setPicking(true)}>{acc ? accountName(d, acc) : '選擇帳戶'} <Icon name="chevron-down" size={14} /></button>
        </div>
        {kind === 'advance' && acc && d.accounts.find((a) => a.id === acc)?.kind !== 'bank' && (
          <div class="muted small">這筆會留在小帳戶，不會算進主帳支出</div>
        )}
        <div class="dialog-btns">
          <button class="btn secondary" onClick={onClose}>取消</button>
          <button class={`btn ${kind}-btn`} disabled={!acc} onClick={confirm}>確認已收到</button>
        </div>
      </Sheet>
      {picking && <AccountPicker title="錢進了哪個帳戶" value={acc} onPick={setAcc} onClose={() => setPicking(false)} />}
    </>
  );
}
