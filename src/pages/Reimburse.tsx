// 報帳頁（左二）：追蹤公司還欠多少錢。
import { useState } from 'preact/hooks';
import { useAppState, getState, updateData, showToast } from '../store';
import { markReimbursed, defaultReimburseAccount, OpError } from '../data/ops';
import type { Transaction } from '../data/types';
import { accountName, categoryOf } from '../selectors';
import { TxList } from '../components/TxList';
import { Sheet } from '../components/Sheet';
import { AccountPicker } from '../components/AccountPicker';
import { askRevertBatch, openTx } from '../actions';
import { money, hm } from '../format';

export function ReimbursePage() {
  const s = useAppState();
  const d = s.data;
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const [multi, setMulti] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  /** 要報帳確認的紀錄（null＝沒開確認視窗） */
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  /** 點一筆時跳出的詳細卡片 */
  const [detail, setDetail] = useState<Transaction | null>(null);

  const pending = d.transactions.filter((t) => t.reimbursable && t.reimburseStatus === 'pending');
  const done = d.transactions.filter((t) => t.reimbursable && t.reimburseStatus === 'done');
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

  const switchTab = (t: 'pending' | 'done') => {
    setTab(t);
    setSel([]);
    setMulti(false);
  };

  return (
    <div class="page-pad reimb">
      <div class="reimb-head">
        <div class="seg">
          <button class={tab === 'pending' ? 'on reimb' : ''} onClick={() => switchTab('pending')}>待報帳</button>
          <button class={tab === 'done' ? 'on reimb' : ''} onClick={() => switchTab('done')}>已報帳</button>
        </div>
        <div class="reimb-total">
          <div class="amt-label">{tab === 'pending' ? '待報帳總額' : '已收回總額'}</div>
          <div class="amt-mid reimb-color">{money(tab === 'pending' ? pendingTotal : doneTotal)}</div>
        </div>
      </div>

      {tab === 'pending' ? (
        <>
          <div class="reimb-tools">
            <span class="muted">{multi ? '點選要報帳的紀錄（可多筆）' : '點一筆看詳細；長按可多選'}</span>
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
          <TxList
            data={d}
            txs={pending}
            onTap={onTapPending}
            selected={multi ? new Set(selected) : undefined}
            empty="沒有待報帳的紀錄 🎉"
            onLongPress={(t) => {
              // 長按＝進入多選，並勾起這一筆
              setMulti(true);
              setSel((x) => (multi ? (x.includes(t.id) ? x : [...x, t.id]) : [t.id]));
            }}
          />
        </>
      ) : (
        <>
          <div class="reimb-tools"><span class="muted">按錯了？點一筆可整批退回待報帳</span></div>
          <TxList data={d} txs={done} onTap={setDetail} empty="還沒有已報帳的紀錄" />
        </>
      )}

      {tab === 'pending' && multi && selected.length > 0 && (
        <div class="action-bar">
          <span>
            已選 {selected.length} 筆 <b class="reimb-color">{money(selTotal)}</b>
          </span>
          <button class="btn reimb-btn" onClick={() => setConfirmIds(selected)}>已報帳</button>
        </div>
      )}

      {detail && (
        <TxDetail
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
function TxDetail({ t, onClose, onReimburse, onRevert }: { t: Transaction; onClose: () => void; onReimburse: () => void; onRevert: () => void }) {
  const d = useAppState().data;
  const c = categoryOf(d, t.categoryId);
  const when = new Date(t.occurredAt);
  const isDone = t.reimburseStatus === 'done';
  return (
    <Sheet title="報帳紀錄" onClose={onClose}>
      <div class="detail-head">
        <span class="tx-icon">{c?.icon ?? '？'}</span>
        <span class="grow detail-name">{c?.name ?? '（已刪除分類）'}</span>
        <span class="amt-mid expense">-{money(t.amount)}</span>
      </div>
      <div class="kv"><span>日期</span><span>{when.getFullYear()}/{when.getMonth() + 1}/{when.getDate()}</span></div>
      <div class="kv"><span>時間</span><span>{hm(when)}</span></div>
      <div class="kv"><span>扣款帳戶</span><span>{accountName(d, t.accountId)}</span></div>
      <div class="kv"><span>狀態</span><span class="reimb-color">{isDone ? '已報帳' : '待報帳'}</span></div>
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
          <button class="btn danger" onClick={onRevert}>退回待報帳</button>
        ) : (
          <button class="btn reimb-btn" onClick={onReimburse}>已報帳</button>
        )}
      </div>
    </Sheet>
  );
}

function ReimburseConfirm({ ids, total, onClose, onDone }: { ids: string[]; total: number; onClose: () => void; onDone: () => void }) {
  const d = useAppState().data;
  const [acc, setAcc] = useState<string | null>(() => defaultReimburseAccount(getState().data, ids));
  const [picking, setPicking] = useState(false);
  const usedDefault = !!d.settings.defaultReimburseAccountId && acc === d.settings.defaultReimburseAccountId;

  const confirm = () => {
    if (!acc) return;
    try {
      updateData((x) => markReimbursed(x, ids, acc));
      showToast(`已報帳 ${ids.length} 筆，${money(total)} 已存入${accountName(getState().data, acc)}`);
      onDone();
    } catch (e) {
      showToast(e instanceof OpError ? e.message : '報帳失敗');
    }
  };

  return (
    <>
      <Sheet title="確定已收到這筆錢嗎？" onClose={onClose}>
        <div class="confirm-sum">
          <div class="muted">共 {ids.length} 筆，合計</div>
          <div class="amt-big reimb-color">{money(total)}</div>
        </div>
        <div class="field">
          <span>錢退回哪個帳戶{usedDefault ? '（預設報帳帳戶）' : ''}</span>
          <button class="pill-btn" onClick={() => setPicking(true)}>{acc ? accountName(d, acc) : '選擇帳戶'} ▾</button>
        </div>
        <div class="dialog-btns">
          <button class="btn secondary" onClick={onClose}>取消</button>
          <button class="btn reimb-btn" disabled={!acc} onClick={confirm}>確認已收到</button>
        </div>
      </Sheet>
      {picking && <AccountPicker title="錢退回哪個帳戶" value={acc} onPick={setAcc} onClose={() => setPicking(false)} />}
    </>
  );
}
