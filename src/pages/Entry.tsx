// 記帳頁（支出／收入）與轉帳輸入，共用同一個畫面。
import { CatIcon } from '../components/CatIcon';
import { useRef, useState } from 'preact/hooks';
import { getState, updateData, closeOverlay, showToast, confirmDanger, type Overlay } from '../store';
import { addTransaction, updateTransaction, deleteTransaction, isLocked, OpError, type TxInput } from '../data/ops';
import { roundAmount } from '../data/calc';
import { pressKey, evaluate, hasOperator, displayExpr, numberToExpr, type CalcKey } from '../calcExpr';
import { accountName, categoryOf } from '../selectors';
import { sortedCategories, suggestedNotes } from '../data/notes';
import { Calculator } from '../components/Calculator';
import { AccountPicker } from '../components/AccountPicker';
import { CategoryForm, TagManager } from '../components/Editors';
import { useAppState } from '../store';
import { toLocalInput, fromLocalInput } from '../format';

type Mode = 'expense' | 'income' | 'transfer';
type EntryOverlay = Extract<Overlay, { kind: 'entry' }>;

export function EntryPage({ o }: { o: EntryOverlay }) {
  const s = useAppState();
  const d = s.data;
  const editing = o.txId ? d.transactions.find((t) => t.id === o.txId) : undefined;
  const locked = editing ? isLocked(editing) : false;

  const [mode, setMode] = useState<Mode>((editing?.type as Mode) ?? o.mode);
  const [accountId, setAccountId] = useState<string | null>(editing?.accountId ?? o.accountId);
  const [toAccountId, setToAccountId] = useState<string | null>(editing?.toAccountId ?? o.toAccountId ?? null);
  const [catId, setCatId] = useState<string | null>(editing?.categoryId ?? null);
  const [expr, setExpr] = useState(editing ? numberToExpr(editing.amount) : '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [when, setWhen] = useState(editing ? toLocalInput(editing.occurredAt) : toLocalInput(new Date().toISOString()));
  const [reimb, setReimb] = useState(editing?.reimbursable ?? false);
  const [sheet, setSheet] = useState<null | 'account' | 'from' | 'to' | 'newCat' | 'tags'>(null);
  const saving = useRef(false);

  const isTransfer = mode === 'transfer';
  // 分類格：自動排序關閉時完全照設定裡的順序；開啟時依最近 90 天使用次數
  const cats = isTransfer ? [] : sortedCategories(d, mode);
  const cat = categoryOf(d, catId ?? undefined);
  const value = evaluate(expr);
  const amount = value === null ? 0 : roundAmount(value);
  const pending = hasOperator(expr);

  const valid =
    amount > 0 &&
    !!accountId &&
    (isTransfer ? !!toAccountId && toAccountId !== accountId : !!cat && cat.type === mode);

  const switchMode = (m: Mode) => {
    if (locked || m === mode) return;
    setMode(m);
    if (m !== 'transfer') {
      // 分類各自獨立，換模式要重選
      if (cat && cat.type !== m) setCatId(null);
      if (m === 'income') setReimb(false);
    }
  };

  const onKey = (k: CalcKey) => {
    if (locked) {
      showToast('這筆已報帳，要改金額請先在報帳頁退回待報帳');
      return;
    }
    setExpr((e) => pressKey(e, k));
  };

  const onOk = () => {
    if (pending) {
      const v = evaluate(expr);
      if (v === null) showToast('無法計算（不能除以 0）');
      else setExpr(numberToExpr(v));
      return;
    }
    if (!valid || saving.current) return;
    saving.current = true;
    const input: TxInput = {
      type: mode,
      amount,
      accountId: accountId!,
      toAccountId: isTransfer ? toAccountId! : undefined,
      categoryId: isTransfer ? undefined : catId!,
      note: note.trim(),
      occurredAt: fromLocalInput(when),
      reimbursable: mode === 'expense' && reimb,
    };
    try {
      if (editing) {
        const next = updateTransaction(getState().data, editing.id, input);
        updateData(() => next);
        closeOverlay();
        showToast('已更新');
      } else {
        const r = addTransaction(getState().data, input);
        updateData(() => r.data);
        closeOverlay();
        showToast(isTransfer ? '已轉帳一筆' : '已記一筆', () => {
          updateData((x) => deleteTransaction(x, r.id));
          showToast('已復原');
        });
      }
    } catch (e) {
      saving.current = false;
      showToast(e instanceof OpError ? e.message : '存檔失敗');
    }
  };

  const onDelete = async () => {
    if (!editing) return;
    if (locked) {
      showToast('這筆已報帳，請先在報帳頁退回待報帳再刪除');
      return;
    }
    if (!(await confirmDanger('刪除這筆紀錄？', '刪除後無法復原。'))) return;
    updateData((x) => deleteTransaction(x, editing.id));
    closeOverlay();
    showToast('已刪除');
  };

  // 備註 5 格：釘選在前，其餘用最近使用的補滿；選了分類就看該分類
  const tags = suggestedNotes(d, isTransfer ? null : catId);

  return (
    <div class="entry">
      <div class="entry-top">
        <button class="icon-btn" onClick={closeOverlay} aria-label="返回">✕</button>
        <div class="seg">
          <button class={mode === 'expense' ? 'on expense' : ''} onClick={() => switchMode('expense')} disabled={locked}>支出</button>
          <button class={mode === 'income' ? 'on income' : ''} onClick={() => switchMode('income')} disabled={locked}>收入</button>
        </div>
        <button class={`seg-small${mode === 'transfer' ? ' on' : ''}`} onClick={() => switchMode('transfer')} disabled={locked}>轉帳</button>
        {editing && <button class="icon-btn danger" onClick={onDelete} aria-label="刪除">🗑</button>}
      </div>

      {locked && <div class="notice">這筆已報帳，只能改分類、備註、日期。要改金額或帳戶請先在報帳頁退回。</div>}

      {isTransfer ? (
        <div class="transfer-box">
          <button class="xfer-acc" onClick={() => setSheet('from')}>
            <span class="muted">從</span>
            <b>{accountId ? accountName(d, accountId) : '選擇帳戶'}</b>
          </button>
          <button
            class="icon-btn swap"
            aria-label="對調"
            onClick={() => {
              setAccountId(toAccountId);
              setToAccountId(accountId);
            }}
          >
            ⇄
          </button>
          <button class="xfer-acc" onClick={() => setSheet('to')}>
            <span class="muted">到</span>
            <b>{toAccountId ? accountName(d, toAccountId) : '選擇帳戶'}</b>
          </button>
          {accountId && toAccountId && accountId === toAccountId && <div class="error-line">來源和目的不能相同</div>}
        </div>
      ) : (
        <div class="cat-grid" data-no-swipe>
          {cats.map((c) => (
            <button key={c.id} class={`cat${c.id === catId ? ' on ' + mode : ''}`} onClick={() => setCatId(c.id)}>
              <CatIcon icon={c.icon} color={c.color} />
              <span class="cat-name">{c.name}</span>
            </button>
          ))}
          <button class="cat add" onClick={() => setSheet('newCat')}>
            <span class="cat-icon">＋</span>
            <span class="cat-name">新增分類</span>
          </button>
        </div>
      )}

      <div class="amount-row">
        <div class={`amount-left ${mode}`}>
          <span class="amount-icon">{isTransfer ? '⇄' : cat?.icon ?? '？'}</span>
          <span class="amount-cur">TWD</span>
          <span class="amount-val">{displayExpr(expr)}</span>
        </div>
        <input
          class="note-input"
          value={note}
          maxLength={40}
          placeholder="備註"
          onInput={(e) => setNote(e.currentTarget.value)}
        />
      </div>

      <div class="tags" data-no-swipe>
        {tags.map((t) => (
          <button key={t} class={`tag${note === t ? ' on' : ''}`} onClick={() => setNote(t)}>{t}</button>
        ))}
        <button class="tag more" onClick={() => setSheet('tags')}>更多…</button>
      </div>

      <div class={`date-row${isTransfer ? ' transfer' : ''}`}>
        <label class="date-cell">
          <input type="datetime-local" value={when} onInput={(e) => e.currentTarget.value && setWhen(e.currentTarget.value)} />
        </label>
        {!isTransfer && (
          <button class="acc-cell" onClick={() => !locked && setSheet('account')} disabled={locked}>
            {accountId ? accountName(d, accountId) : '選帳戶'}
          </button>
        )}
        {!isTransfer && (
          <button
            class={`reimb-cell${reimb ? ' on' : ''}`}
            disabled={mode !== 'expense' || locked}
            onClick={() => setReimb((r) => !r)}
            aria-pressed={reimb}
          >
            <span class="switch" />報帳
          </button>
        )}
      </div>

      <Calculator
        onKey={onKey}
        onOk={onOk}
        okLabel={pending ? '＝' : 'OK'}
        okDisabled={pending ? expr === '' : !valid}
      />

      {sheet === 'account' && <AccountPicker title="選擇帳戶" value={accountId} onPick={setAccountId} onClose={() => setSheet(null)} />}
      {sheet === 'from' && <AccountPicker title="從哪個帳戶" value={accountId} onPick={setAccountId} onClose={() => setSheet(null)} />}
      {sheet === 'to' && <AccountPicker title="轉到哪個帳戶" value={toAccountId} onPick={setToAccountId} onClose={() => setSheet(null)} />}
      {sheet === 'newCat' && !isTransfer && (
        <CategoryForm type={mode} onClose={() => setSheet(null)} onSaved={(id) => setCatId(id)} />
      )}
      {sheet === 'tags' && <TagManager onClose={() => setSheet(null)} />}
    </div>
  );
}
