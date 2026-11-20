// 記帳頁（支出／收入）與轉帳輸入，共用同一個畫面。內含「拖拖計算機」：把標記膠囊拖到數字上拆帳。
import { CatIcon } from '../components/CatIcon';
import { Icon } from '../components/Icon';
import { CAPSULE_ICONS, UI_ICONS } from '../icons';
import { useEffect, useRef, useState } from 'preact/hooks';
import { getState, updateData, closeOverlay, showToast, showHoldToast, confirmDanger, type Overlay } from '../store';
import { deleteMany, restoreDeleted } from '../data/txMove';
import { addTransaction, addTransactions, updateTransaction, deleteTransaction, isLocked, isBudgetPayment, isPaidBudget, uid, OpError, type TxInput } from '../data/ops';
import { revertBudgetPaid, restoreBudgetPaid } from '../data/budget';
import { roundAmount } from '../data/calc';
import { pressKey, evaluate, hasOperator, numberToExpr, type CalcKey } from '../calcExpr';
import { accountName, categoryOf } from '../selectors';
import { sortedCategories, suggestedNotes } from '../data/notes';
import { Calculator } from '../components/Calculator';
import { AccountPicker } from '../components/AccountPicker';
import { toastRich } from '../toastInfo';
import { CategoryForm, TagManager } from '../components/Editors';
import { useAppState } from '../store';
import { ENTRY_ROW, DRAG_MARK, GESTURE } from '../config';
import { toLocalInput, fromLocalInput, money } from '../format';
import { advanceOwedOn } from '../features';
import { blockClicks } from '../gestures/guard';
import { useNoteKeyboard } from '../noteKeyboard';
import {
  parseTerms, canMark, reconcileMarks, splitPlan, splitInputs, previewText, MARK_LABEL,
  type Mark, type Marks,
} from '../splitCalc';
import type { Transaction } from '../data/types';

/** 日期格顯示：今天＝「今天」；今年 11/09；非今年 2025/12/31（不顯示時間） */
function whenLabel(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T/.exec(v);
  if (!m) return v;
  const now = new Date();
  if (Number(m[1]) === now.getFullYear() && Number(m[2]) === now.getMonth() + 1 && Number(m[3]) === now.getDate()) return '今天';
  if (Number(m[1]) === now.getFullYear()) return `${m[2]}/${m[3]}`;
  return `${m[1]}/${m[2]}/${m[3]}`;
}

/** 數字加千分位（保留尾端還沒打完的小數點） */
function fmtNum(s: string): string {
  const [i, d] = s.split('.');
  const n = Number(i).toLocaleString('en-US');
  return d !== undefined ? `${n}.${d}` : n;
}

/** 存檔前去掉末尾未完成的運算子或小數點 */
const cleanExpr = (e: string) => e.replace(/[+−×÷.]+$/, '');

/** 從舊紀錄判斷目前的標記 */
function recordMark(t: Transaction): Mark | null {
  if (t.type === 'owed') return 'owed';
  if (t.reimbursable && t.reimburseKind === 'advance') return 'advance';
  if (t.reimbursable) return 'reimb';
  if (t.budget) return 'budget';
  return null;
}

const CHIP_ICON: Record<Mark, string> = {
  advance: CAPSULE_ICONS['我先付'],
  owed: CAPSULE_ICONS['朋友付'],
  budget: CAPSULE_ICONS['預算'],
  reimb: CAPSULE_ICONS['報帳'],
};

type Mode = 'expense' | 'income' | 'transfer';
type EntryOverlay = Extract<Overlay, { kind: 'entry' }>;

interface DragView {
  mark: Mark;
  x: number;
  y: number;
  hover: number | null;
}

export function EntryPage({ o }: { o: EntryOverlay }) {
  const s = useAppState();
  const d = s.data;
  const editing = o.txId ? d.transactions.find((t) => t.id === o.txId) : undefined;
  const locked = editing ? isLocked(editing) : false;
  const isPay = editing ? isBudgetPayment(editing) : false;
  // 2.3：已付款的預算可以直接編輯。編輯它＝改實際付款那一筆，所以畫面上的金額、帳戶、日期、算式都從付款那筆帶出來
  const paidB = editing ? isPaidBudget(editing) : false;
  const payRec = paidB ? d.transactions.find((t) => t.id === editing!.budgetPaidTxId) : undefined;
  const src = payRec ?? editing;
  // 來自預算的兩列（預算那列、付款那列）：類型、標記不能改，要改請先退回未付
  const fromBudget = paidB || isPay;
  const budgetId = paidB ? editing?.id : editing?.budgetOfId;

  const initMode: Mode = editing ? (editing.type === 'owed' ? 'expense' : (editing.type as Mode)) : o.mode;
  const [mode, setMode] = useState<Mode>(initMode);
  const [accountId, setAccountId] = useState<string | null>(src ? src.accountId || null : o.accountId);
  const [toAccountId, setToAccountId] = useState<string | null>(editing?.toAccountId ?? o.toAccountId ?? null);
  // 新記帳：預設選分類格左上第一個
  const [catId, setCatId] = useState<string | null>(
    editing ? editing.categoryId ?? null : initMode !== 'transfer' ? sortedCategories(d, initMode)[0]?.id ?? null : null,
  );
  const [expr, setExpr] = useState(() => {
    if (!src) return '';
    const ce = src.calcExpr;
    // 算式只在「整筆金額＝算式結果」時沿用；拆帳出來的一部分只顯示自己的金額
    if (ce && src.calcTerm === undefined && evaluate(ce) !== null && roundAmount(evaluate(ce)!) === src.amount) return ce;
    return numberToExpr(src.amount);
  });
  const [note, setNote] = useState(editing?.note ?? '');
  const [when, setWhen] = useState(src ? toLocalInput(src.occurredAt) : toLocalInput(new Date().toISOString()));
  const [marks, setMarks] = useState<Marks>({});
  const [sel, setSel] = useState<number | null>(null);
  /** 2.5：先點膠囊（還沒打數字時）＝選好標記，之後打的數字（沒有自己標記的）都套用它 */
  const [pickMark, setPickMark] = useState<Mark | null>(null);
  const [editMark, setEditMark] = useState<Mark | null>(editing ? recordMark(editing) : null);
  const [noteFocus, setNoteFocus] = useState(false);
  // 2.3.1：備註輸入時，系統鍵盤取代計算機鍵盤（分類區、輸入列的行為見 noteKeyboard.ts）
  const noteRef = useRef<HTMLInputElement>(null);
  const kb = useNoteKeyboard(noteRef);
  const [drag, setDrag] = useState<DragView | null>(null);
  const [sheet, setSheet] = useState<null | 'account' | 'from' | 'to' | 'newCat' | 'tags'>(null);
  const saving = useRef(false);
  const exprRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mark: Mark; sx: number; sy: number;
    /** 已按住夠久、拿起了（之後才可以拖） */
    armed: boolean;
    active: boolean; hover: number | null; bad: boolean;
    timer: ReturnType<typeof setTimeout> | undefined;
  } | null>(null);
  const dragEndAt = useRef(0);
  const markRowRef = useRef<HTMLDivElement>(null);
  // 拿起後擋掉膠囊列的左右捲動（要用非被動監聽，preventDefault 才有效）
  useEffect(() => {
    const el = markRowRef.current;
    if (!el) return;
    const stop = (e: TouchEvent) => {
      if (dragRef.current?.armed && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
  }, [mode === 'transfer']);

  const isTransfer = mode === 'transfer';
  const cats = isTransfer ? [] : sortedCategories(d, mode);
  const cat = categoryOf(d, catId ?? undefined);
  const value = evaluate(expr);
  const amount = value === null ? 0 : roundAmount(value);
  const pending = hasOperator(expr);
  const terms = parseTerms(expr);
  const clean = cleanExpr(expr);
  const marksOn = !editing && mode === 'expense';
  const bankOnly = (id: string | null) => !id || d.accounts.find((a) => a.id === id)?.kind === 'bank';

  // 2.5：先點的膠囊套到每個可掛標記、還沒有自己標記的數字上（實際存檔、預覽、顯示都用這份）
  const effMarks: Marks = marksOn && pickMark
    ? ({ ...Object.fromEntries(terms.filter((t) => canMark(t) && !marks[t.index]).map((t) => [t.index, pickMark])), ...marks } as Marks)
    : marks;

  // 新記帳的拆帳計畫
  const plan = marksOn || mode === 'income' ? splitPlan(clean, marksOn ? effMarks : {}) : null;
  const needAccount = plan && plan.ok ? plan.general > 0 || plan.parts.some((p) => p.mark !== 'owed') : true;

  let valid: boolean;
  if (isTransfer) valid = amount > 0 && !!accountId && !!toAccountId && toAccountId !== accountId;
  else if (editing) valid = amount > 0 && !!cat && cat.type === mode;
  else valid = !!cat && cat.type === mode && !!plan && plan.ok && (!needAccount || !!accountId);

  const switchMode = (m: Mode) => {
    if (locked || m === mode) return;
    setMode(m);
    setMarks({});
    setSel(null);
    setPickMark(null);
    if (m !== 'expense') setEditMark(null);
    if (m !== 'transfer') {
      // 分類各自獨立，換模式要選新模式的第一個（編輯舊紀錄則只在型別不符時重選）
      if (!editing || (cat && cat.type !== m)) setCatId(sortedCategories(d, m)[0]?.id ?? null);
    }
  };

  const lockedText = (act: string) => {
    if (fromBudget) return '這筆來自預算，要改類型請先退回未付';
    if (editing?.type === 'owed') return `這筆先欠已還，${act}請先在待辦頁退回未還`;
    if (editing?.reimburseKind === 'advance') return `這筆先付已收回，${act}請先在待辦頁退回`;
    return `這筆已報帳，${act}請先在待辦頁退回待報帳`;
  };
  const lockedHint = () => showToast(fromBudget ? lockedText('') : lockedText('不能再改標記，要改'));

  // 換帳戶：已掛預算卻換到非一般帳戶 → 自動取消預算並提示
  const pickAccount = (id: string | null) => {
    setAccountId(id);
    if (bankOnly(id) || paidB) return;
    if (pickMark === 'budget') {
      setPickMark(null);
      showToast('預算只能掛在一般帳戶，已取消預算');
    }
    if (editMark === 'budget') {
      setEditMark(null);
      showToast('預算只能掛在一般帳戶，已取消預算');
    } else if (Object.values(marks).includes('budget')) {
      setMarks((m) => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== 'budget')) as Marks);
      showToast('預算只能掛在一般帳戶，已取消預算');
    }
  };

  /** 把標記掛到第 i 個數字；toggle＝同一標記再掛就取消 */
  const applyMark = (i: number, m: Mark, toggle: boolean) => {
    const t = terms[i];
    if (!canMark(t)) return showToast('乘除裡的數字不能掛標記');
    if (m === 'budget' && !bankOnly(accountId)) return showToast('預算只能掛在一般帳戶');
    if (toggle && marks[i] === m) {
      setMarks((x) => {
        const n = { ...x };
        delete n[i];
        return n;
      });
    } else {
      setMarks((x) => ({ ...x, [i]: m }));
    }
    setSel(null);
  };

  const onTermTap = (i: number) => {
    if (!marksOn) return;
    // 2.5：先點了膠囊、再點某個數字＝只把標記掛在這個數字上
    if (pickMark && !marks[i]) {
      if (!canMark(terms[i])) return showToast('乘除裡的數字不能掛標記');
      setMarks((x) => ({ ...x, [i]: pickMark }));
      setPickMark(null);
      setSel(null);
      return;
    }
    const m = marks[i];
    if (m) {
      setMarks((x) => {
        const n = { ...x };
        delete n[i];
        return n;
      });
      showToast(`已取消${MARK_LABEL[m]}`);
      return;
    }
    if (!canMark(terms[i])) return showToast('乘除裡的數字不能掛標記');
    setSel(sel === i ? null : i);
  };

  const onChipTap = (m: Mark) => {
    if (performance.now() - dragEndAt.current < 400) return;
    if (editing) {
      if (locked || fromBudget) return lockedHint();
      if (editMark === m) return setEditMark(null);
      if (m === 'budget' && !bankOnly(accountId)) return showToast('預算只能掛在一般帳戶');
      setEditMark(m);
      return;
    }
    if (!marksOn) return;
    if (sel !== null) return applyMark(sel, m, true);
    if (pickMark === m) return setPickMark(null);
    if (terms.length === 1) return applyMark(0, m, true);
    // 2.5：還沒打數字就點膠囊＝先選好標記（亮起來），打完數字按 OK 就套用
    if (terms.length === 0) {
      if (m === 'budget' && !bankOnly(accountId)) return showToast('預算只能掛在一般帳戶');
      setPickMark(m);
      return;
    }
    showToast('把膠囊拖到數字上，或先點膠囊／數字都可以');
  };

  // ---- 拖曳標記膠囊 ----
  const hitTest = (x: number, y: number): { hover: number | null; bad: boolean } => {
    const nodes = exprRef.current?.querySelectorAll<HTMLElement>('[data-term]');
    let best = -1;
    let bestDist = Infinity;
    nodes?.forEach((n) => {
      const r = n.getBoundingClientRect();
      const pad = DRAG_MARK.dropPadPx;
      if (x < r.left - pad || x > r.right + pad || y < r.top - pad || y > r.bottom + pad) return;
      const dist = Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2);
      if (dist < bestDist) {
        bestDist = dist;
        best = Number(n.dataset.term);
      }
    });
    if (best < 0) return { hover: null, bad: false };
    return canMark(terms[best]) ? { hover: best, bad: false } : { hover: null, bad: true };
  };

  // 補強批：按住 DRAG_MARK.holdMs 才拿起；還沒拿起就移動＝捲動膠囊列（交給瀏覽器）
  const onChipDown = (e: PointerEvent, m: Mark) => {
    if (!marksOn) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    clearTimeout(dragRef.current?.timer);
    const el = e.currentTarget as HTMLElement;
    const pid = e.pointerId;
    const r: NonNullable<typeof dragRef.current> = { mark: m, sx: e.clientX, sy: e.clientY, armed: false, active: false, hover: null, bad: false, timer: undefined };
    r.timer = setTimeout(() => {
      if (dragRef.current !== r) return;
      r.armed = true;
      try {
        el.setPointerCapture(pid);
      } catch { /* 手指已離開 */ }
      if (DRAG_MARK.liftVibrateMs > 0) navigator.vibrate?.(DRAG_MARK.liftVibrateMs);
      setDrag({ mark: r.mark, x: r.sx, y: r.sy, hover: null });
    }, DRAG_MARK.holdMs);
    dragRef.current = r;
  };
  const onChipMove = (e: PointerEvent) => {
    const r = dragRef.current;
    if (!r) return;
    const moved = Math.hypot(e.clientX - r.sx, e.clientY - r.sy);
    if (!r.armed) {
      // 還沒拿起就移動：當成捲動，放棄這次拖曳
      if (moved >= DRAG_MARK.startMovePx) {
        clearTimeout(r.timer);
        dragRef.current = null;
      }
      return;
    }
    if (!r.active) {
      if (moved < DRAG_MARK.startMovePx) return;
      r.active = true;
    }
    const h = hitTest(e.clientX, e.clientY);
    if (h.hover !== r.hover && h.hover !== null && GESTURE.hoverVibrateMs > 0) navigator.vibrate?.(GESTURE.hoverVibrateMs);
    r.hover = h.hover;
    r.bad = h.bad;
    setDrag({ mark: r.mark, x: e.clientX, y: e.clientY, hover: h.hover });
  };
  const onChipUp = () => {
    const r = dragRef.current;
    clearTimeout(r?.timer);
    dragRef.current = null;
    setDrag(null);
    if (!r?.active) return;
    dragEndAt.current = performance.now();
    blockClicks(GESTURE.afterDropCooldownMs);
    if (r.hover !== null) applyMark(r.hover, r.mark, false);
    else if (r.bad) showToast('乘除裡的數字不能掛標記');
  };
  const onChipCancel = () => {
    clearTimeout(dragRef.current?.timer);
    dragRef.current = null;
    setDrag(null);
  };

  const onKey = (k: CalcKey) => {
    if (locked) {
      showToast(lockedText('要改金額'));
      return;
    }
    const next = pressKey(expr, k);
    if (marksOn) {
      const nm = reconcileMarks(expr, next, marks);
      if (nm !== marks) {
        setMarks(nm);
        showToast('算式改了，被改到的標記已取消');
      }
      if (sel !== null) {
        const a = terms[sel];
        const b = parseTerms(next)[sel];
        if (!a || !b || a.text !== b.text || !canMark(b)) setSel(null);
      }
    }
    setExpr(next);
  };

  const onOk = () => {
    if (!valid || value === null || saving.current) return;
    const ce = hasOperator(clean) ? clean : undefined;
    if (editing) {
      if (!isTransfer && editMark !== 'owed' && !accountId) return showToast('請選帳戶');
      let input: TxInput;
      if (isTransfer) {
        input = { type: 'transfer', amount, accountId: accountId!, toAccountId: toAccountId!, note: note.trim(), occurredAt: fromLocalInput(when) };
      } else if (mode === 'income') {
        input = { type: 'income', amount, accountId: accountId!, categoryId: catId!, note: note.trim(), occurredAt: fromLocalInput(when), calcExpr: ce };
      } else if (editMark === 'owed') {
        input = { type: 'owed', amount, accountId: '', categoryId: catId!, note: note.trim(), occurredAt: fromLocalInput(when), calcExpr: ce };
      } else {
        input = {
          type: 'expense',
          amount,
          accountId: accountId!,
          categoryId: catId!,
          note: note.trim(),
          occurredAt: fromLocalInput(when),
          reimbursable: editMark === 'advance' || editMark === 'reimb',
          reimburseKind: editMark === 'advance' ? 'advance' : undefined,
          budget: editMark === 'budget',
          calcExpr: ce,
        };
      }
      saving.current = true;
      try {
        const next = updateTransaction(getState().data, editing.id, input);
        updateData(() => next);
        closeOverlay();
        showToast('已更新');
      } catch (e) {
        saving.current = false;
        showToast(e instanceof OpError ? e.message : '存檔失敗');
      }
      return;
    }
    if (isTransfer) {
      saving.current = true;
      try {
        const r = addTransaction(getState().data, {
          type: 'transfer',
          amount,
          accountId: accountId!,
          toAccountId: toAccountId!,
          note: note.trim(),
          occurredAt: fromLocalInput(when),
        });
        updateData(() => r.data);
        closeOverlay();
        showHoldToast('已轉帳一筆', () => holdDelete([r.id]), toastRich('已轉帳', r.data, r.data.transactions.filter((t) => t.id === r.id)));
      } catch (e) {
        saving.current = false;
        showToast(e instanceof OpError ? e.message : '存檔失敗');
      }
      return;
    }
    const p = splitPlan(clean, marksOn ? effMarks : {});
    if (!p.ok) return showToast(p.error);
    let inputs: TxInput[];
    try {
      inputs = splitInputs(p, {
        type: mode,
        accountId,
        categoryId: catId!,
        note: note.trim(),
        occurredAt: fromLocalInput(when),
        expr: clean,
        splitId: uid('s'),
      });
    } catch (e) {
      return showToast(e instanceof Error ? e.message : '存檔失敗');
    }
    saving.current = true;
    try {
      const r = addTransactions(getState().data, inputs);
      updateData(() => r.data);
      closeOverlay();
      showHoldToast(r.ids.length === 1 ? '已記一筆' : `已記 ${r.ids.length} 筆`, () => holdDelete(r.ids), toastRich('已記', r.data, r.data.transactions.filter((t) => r.ids.includes(t.id))));
    } catch (e) {
      saving.current = false;
      showToast(e instanceof OpError ? e.message : '存檔失敗');
    }
  };

  /** 2.5：提示條〔長按刪除〕按滿：刪掉剛記的那幾筆，再給「已刪除｜復原」（普通點一下就救回來） */
  const holdDelete = (ids: string[]) => {
    const r = deleteMany(getState().data, ids);
    if (r.deleted.length === 0) return showToast(r.skipped[0]?.reason ?? '找不到這筆紀錄');
    updateData(() => r.data);
    showToast('已刪除', () => {
      updateData((x) => restoreDeleted(x, r.deleted));
      showToast('已復原');
    });
  };

  /** 退回未付（2.3）：不再跳確認框，直接退回、關掉編輯畫面，用新提示給〔復原〕 */
  const onRevertBudget = () => {
    if (!budgetId || saving.current) return;
    const before = getState().data;
    const b = before.transactions.find((t) => t.id === budgetId);
    const pay = b ? before.transactions.find((t) => t.id === b.budgetPaidTxId) : undefined;
    if (!b || !pay) return showToast('找不到這筆預算的付款紀錄');
    saving.current = true;
    try {
      updateData((x) => revertBudgetPaid(x, budgetId));
    } catch (e) {
      saving.current = false;
      return showToast(e instanceof Error ? e.message : '退回失敗');
    }
    closeOverlay();
    showToast('已退回未付', () => {
      updateData((x) => restoreBudgetPaid(x, budgetId, pay));
      showToast('已復原');
    });
  };

  const onDelete = async () => {
    if (!editing) return;
    if (fromBudget) {
      showToast('這筆來自預算，請先退回未付再刪除');
      return;
    }
    if (locked) {
      showToast(lockedText('要刪除'));
      return;
    }
    if (!(await confirmDanger('刪除這筆紀錄？', '刪除後無法復原。'))) return;
    updateData((x) => deleteTransaction(x, editing.id));
    closeOverlay();
    showToast('已刪除');
  };

  // 備註 5 格：釘選在前，其餘用最近使用的補滿；選了分類就看該分類
  const tags = suggestedNotes(d, isTransfer ? null : catId);

  // ---- 版面 ----
  const row = noteFocus
    ? [ENTRY_ROW.exprNoteFocus, ENTRY_ROW.noteFocus]
    : pending
      ? [ENTRY_ROW.exprCalc, ENTRY_ROW.noteCalc]
      : [ENTRY_ROW.exprSolo, ENTRY_ROW.noteSolo];

  const renderExpr = () => {
    if (expr === '') return <span class="expr-empty">0</span>;
    const out = [];
    let pos = 0;
    for (const t of terms) {
      if (t.start > pos) out.push(<span class="op" key={`o${t.index}`}>{expr.slice(pos, t.start)}</span>);
      const m = marksOn ? effMarks[t.index] : undefined;
      const cls = [
        'term',
        m ? `marked mk-${m}` : '',
        sel === t.index ? 'sel' : '',
        drag && canMark(t) ? 'hint' : '',
        drag && drag.hover === t.index ? 'hover' : '',
      ].filter(Boolean).join(' ');
      out.push(
        <span key={`t${t.index}`} data-term={t.index} class={cls} onClick={() => onTermTap(t.index)}>
          {fmtNum(expr.slice(t.start, t.end))}
          {m && <i class="term-tag">{MARK_LABEL[m]}</i>}
        </span>,
      );
      pos = t.end;
    }
    if (pos < expr.length) out.push(<span class="op" key="oend">{expr.slice(pos)}</span>);
    return out;
  };

  // 上排膠囊
  const showAO = advanceOwedOn(d.settings);
  const chipMarks: Mark[] = [];
  if (mode === 'expense') {
    if (showAO || editMark === 'advance') chipMarks.push('advance');
    if (showAO || editMark === 'owed') chipMarks.push('owed');
    chipMarks.push('budget', 'reimb');
  }
  const activeOf = (m: Mark) => (editing ? editMark === m : pickMark === m || Object.values(effMarks).includes(m));

  const previewLine = marksOn && Object.keys(effMarks).length > 0 && plan
    ? plan.ok
      ? { text: previewText(plan, cat?.name ?? '一般', money), err: false }
      : { text: plan.error, err: true }
    : null;

  return (
    <div class="entry">
      <div class="entry-top">
        <button class="icon-btn" onClick={closeOverlay} aria-label="返回"><Icon name={UI_ICONS['關閉']} /></button>
        <div class="seg">
          <button class={mode === 'expense' ? 'on expense' : ''} onClick={() => switchMode('expense')} disabled={locked || fromBudget}>支出</button>
          <button class={mode === 'income' ? 'on income' : ''} onClick={() => switchMode('income')} disabled={locked || fromBudget}>收入</button>
          <button class={mode === 'transfer' ? 'on transfer' : ''} onClick={() => switchMode('transfer')} disabled={locked || fromBudget}>轉帳</button>
        </div>
        {editing ? (
          <button class="icon-btn danger" onClick={onDelete} aria-label="刪除"><Icon name={UI_ICONS['刪除']} /></button>
        ) : (
          <span class="icon-btn entry-top-spacer" aria-hidden="true" />
        )}
      </div>

      {locked && <div class="notice">{lockedText('要改金額或帳戶')}</div>}
      {fromBudget && (
        <div class="notice notice-row">
          <span>這筆來自預算</span>
          <button class="notice-btn" onClick={onRevertBudget}>退回未付</button>
        </div>
      )}

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
            <Icon name="arrow-left-right" />
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
            <span class="cat-icon"><Icon name={UI_ICONS['新增']} /></span>
            <span class="cat-name">新增分類</span>
          </button>
        </div>
      )}

      <div class="amount-row" data-no-swipe>
        <label class="when-cell" style={{ flexGrow: ENTRY_ROW.date }}>
          <Icon name={UI_ICONS['日期']} size={14} />
          <span class="when-text">{whenLabel(when)}</span>
          <input
            type="datetime-local"
            value={when}
            onInput={(e) => e.currentTarget.value && setWhen(e.currentTarget.value)}
          />
        </label>
        <div ref={exprRef} class={`expr-cell ${mode}`} style={{ flexGrow: row[0] }}>
          <div class={`expr-line${displayLen(expr, terms) > 11 ? ' long' : ''}`}>{renderExpr()}</div>
          {(pending || (editing && editMark)) && (
            <div class="expr-sum">
              {pending && (value === null ? '＝無法計算' : `＝${value.toLocaleString('en-US')}`)}
              {editing && editMark && <span class={`sum-tag mk-${editMark}`}>{MARK_LABEL[editMark]}</span>}
            </div>
          )}
        </div>
        <input
          ref={noteRef}
          class="note-input"
          style={{ flexGrow: row[1] }}
          value={note}
          maxLength={40}
          placeholder="備註"
          enterkeyhint="done"
          onInput={(e) => setNote(e.currentTarget.value)}
          onFocus={() => {
            setNoteFocus(true);
            kb.onFocus();
          }}
          onBlur={() => {
            setNoteFocus(false);
            kb.onBlur();
          }}
          // 鍵盤上的完成鈕：只收鍵盤（回到計算機），不存檔
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
      </div>

      {previewLine && previewLine.text && <div class={`preview-line${previewLine.err ? ' err' : ''}`}>{previewLine.text}</div>}

      {!isTransfer && (
        <div class="mark-row" data-no-swipe ref={markRowRef}>
          <button class="mark-chip glass chip-acc" onClick={() => !locked && setSheet('account')} disabled={locked}>
            <Icon name="credit-card" size={16} /> {accountId ? accountName(d, accountId) : '選帳戶'}
          </button>
          {chipMarks.map((m) => (
            <button
              key={m}
              class={`mark-chip glass drag mk-${m}${activeOf(m) ? ' on' : ''}`}
              onClick={() => onChipTap(m)}
              onPointerDown={(e) => onChipDown(e, m)}
              onPointerMove={onChipMove}
              onPointerUp={onChipUp}
              onPointerCancel={onChipCancel}
            >
              <Icon name={CHIP_ICON[m]} size={16} /> {MARK_LABEL[m]}
            </button>
          ))}
          <button class="mark-chip glass chip-other" onClick={() => showToast('即將推出')} aria-label="其他"><Icon name={UI_ICONS['更多']} size={16} /></button>
        </div>
      )}

      <div class="tags" data-no-swipe style={drag ? { opacity: DRAG_MARK.dimOpacity } : undefined}>
        {tags.map((t) => (
          <button key={t} class={`tag${note === t ? ' on' : ''}`} onClick={() => setNote(t)}>{t}</button>
        ))}
        <button class="tag more" onClick={() => setSheet('tags')}>更多…</button>
      </div>

      {/* 備註輸入時計算機讓位給系統鍵盤：holdHide＝看不見但先佔著位置，等視窗變矮才真的拿掉；holdShow／hidden＝不顯示（鍵盤收起、視窗變高後才放回來） */}
      {(kb.phase === 'show' || kb.phase === 'holdHide') && (
        <div class={`calc-slot${kb.phase === 'holdHide' ? ' hold' : ''}`}>
          <Calculator onKey={onKey} onOk={onOk} okLabel="OK" okDisabled={!valid || value === null} />
        </div>
      )}

      {drag && (
        <div class={`mark-ghost mk-${drag.mark}`} style={{ left: `${drag.x}px`, top: `${drag.y + DRAG_MARK.ghostOffsetY}px` }}>
          <Icon name={CHIP_ICON[drag.mark]} size={16} /> {MARK_LABEL[drag.mark]}
        </div>
      )}

      {sheet === 'account' && <AccountPicker title="選擇帳戶" value={accountId} onPick={pickAccount} onClose={() => setSheet(null)} />}
      {sheet === 'from' && <AccountPicker title="從哪個帳戶" value={accountId} onPick={setAccountId} onClose={() => setSheet(null)} />}
      {sheet === 'to' && <AccountPicker title="轉到哪個帳戶" value={toAccountId} onPick={setToAccountId} onClose={() => setSheet(null)} />}
      {sheet === 'newCat' && !isTransfer && (
        <CategoryForm type={mode} onClose={() => setSheet(null)} onSaved={(id) => setCatId(id)} />
      )}
      {sheet === 'tags' && <TagManager onClose={() => setSheet(null)} />}
    </div>
  );
}

/** 算式顯示長度（含千分位逗號），用來決定要不要縮小字 */
function displayLen(expr: string, terms: { start: number; end: number }[]): number {
  let n = expr.length;
  for (const t of terms) {
    const intLen = expr.slice(t.start, t.end).split('.')[0].length;
    n += Math.floor((intLen - 1) / 3);
  }
  return n;
}
