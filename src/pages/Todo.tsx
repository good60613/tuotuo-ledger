// 待辦頁（左二，第四批第 4 段）：原本的報帳頁改名，分「報帳」「預算」兩個分頁，操作一致。
import { useAppState, setState } from '../store';
import { ReimburseTab } from './Reimburse';
import { BudgetTab } from './BudgetTab';
import { pendingBudgets } from '../data/budget';

export function TodoPage() {
  const s = useAppState();
  const d = s.data;
  const reimbCount = d.transactions.filter((t) => t.reimbursable && t.reimburseStatus === 'pending').length;
  const budgetCount = pendingBudgets(d).length;
  return (
    <div class="page-pad todo">
      <div class="todo-tabs">
        <button class={s.todoTab === 'reimb' ? 'on reimb' : ''} onClick={() => setState({ todoTab: 'reimb' })}>
          報帳{reimbCount > 0 && <span class="todo-count">{reimbCount}</span>}
        </button>
        <button class={s.todoTab === 'budget' ? 'on budget' : ''} onClick={() => setState({ todoTab: 'budget' })}>
          預算{budgetCount > 0 && <span class="todo-count">{budgetCount}</span>}
        </button>
      </div>
      {s.todoTab === 'reimb' ? <ReimburseTab /> : <BudgetTab />}
    </div>
  );
}
