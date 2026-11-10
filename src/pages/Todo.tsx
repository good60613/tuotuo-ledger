// 待辦頁（左二）：報帳、我先付、朋友付、預算四個分頁，操作一致。
// 我先付／朋友付開關關掉時，若已經沒有這兩種紀錄就不顯示分頁；還有未結案或已結案的仍顯示，避免錢算不清。
import { useState } from 'preact/hooks';
import { useAppState, setState, type TodoTab } from '../store';
import { BottomBar } from '../components/BottomBar';
import { ReimburseTab } from './Reimburse';
import { BudgetTab } from './BudgetTab';
import { OwedTab } from './OwedTab';
import { pendingBudgets } from '../data/budget';
import { advanceOwedOn } from '../features';

export function TodoPage() {
  const s = useAppState();
  const d = s.data;
  const txs = d.transactions;
  const reimbCount = txs.filter((t) => t.reimbursable && t.reimburseKind !== 'advance' && t.reimburseStatus === 'pending').length;
  const advCount = txs.filter((t) => t.reimbursable && t.reimburseKind === 'advance' && t.reimburseStatus === 'pending').length;
  const owedCount = txs.filter((t) => t.type === 'owed' && t.owedStatus !== 'paid').length;
  const budgetCount = pendingBudgets(d).length;
  const on = advanceOwedOn(d.settings);
  const showAdv = on || txs.some((t) => t.reimburseKind === 'advance');
  const showOwed = on || txs.some((t) => t.type === 'owed');
  const tabs: { key: TodoTab; label: string; count: number }[] = [
    { key: 'reimb', label: '報帳', count: reimbCount },
    ...(showAdv ? [{ key: 'advance' as const, label: '我先付', count: advCount }] : []),
    ...(showOwed ? [{ key: 'owed' as const, label: '朋友付', count: owedCount }] : []),
    { key: 'budget', label: '預算', count: budgetCount },
  ];
  const cur = tabs.some((t) => t.key === s.todoTab) ? s.todoTab : 'reimb';
  // 子分頁多選且有選取時，底部切換列讓位給批次操作列
  const [barOn, setBarOn] = useState(false);
  return (
    <div class="page-pad todo">
      {cur === 'reimb' && <ReimburseTab key="reimb" kind="reimb" onBar={setBarOn} />}
      {cur === 'advance' && <ReimburseTab key="advance" kind="advance" onBar={setBarOn} />}
      {cur === 'owed' && <OwedTab onBar={setBarOn} />}
      {cur === 'budget' && <BudgetTab onBar={setBarOn} />}
      {!barOn && (
        <BottomBar class="todo-tabs">
          {tabs.map((t) => (
            <button key={t.key} class={cur === t.key ? `on ${t.key}` : ''} onClick={() => setState({ todoTab: t.key })}>
              {t.label}
              {t.count > 0 && <span class="todo-count">{t.count}</span>}
            </button>
          ))}
        </BottomBar>
      )}
    </div>
  );
}
