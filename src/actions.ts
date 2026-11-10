// 跨頁面共用的操作
import type { Transaction } from './data/types';
import { getState, openOverlay, updateData, showToast, ask, confirmDanger } from './store';
import { batchItems, revertBatch, deleteTransaction } from './data/ops';
import { accountName } from './selectors';
import { money } from './format';
import { bankAccounts } from './selectors';

/** 點明細的一筆 */
export function openTx(t: Transaction) {
  if (t.type === 'reimburse_in') {
    if (t.reimburseBatchId) askRevertBatch(t.reimburseBatchId);
    return;
  }
  // 調整、市值、投資與儲蓄的記一筆：不走記帳頁，只能刪除（要改就刪掉重記）
  if (t.type === 'adjust' || t.type === 'valuation' || t.source) {
    void askDeleteSpecial(t);
    return;
  }
  // 還借我那筆：要改請在待辦頁「退回未還」
  if (t.type === 'owed_repay') {
    showToast('這筆是還借我的款項，要改請在待辦頁退回未還');
    return;
  }
  openOverlay({ kind: 'entry', mode: t.type === 'owed' ? 'expense' : t.type, accountId: t.accountId, toAccountId: t.toAccountId ?? null, txId: t.id });
}

/** 整批退回待報帳（要確認） */
export async function askRevertBatch(batchId: string) {
  const d = getState().data;
  const { items, inTx } = batchItems(d, batchId);
  if (!inTx) return;
  const body =
    `這一批共 ${items.length} 筆，合計 ${money(inTx.amount)}。\n` +
    `退回後，${accountName(d, inTx.toAccountId)} 會扣回 ${money(inTx.amount)}，` +
    `這 ${items.length} 筆回到「待報帳」。`;
  const v = await ask('退回待報帳？', body, [
    { label: '取消', value: 'no', style: 'secondary' },
    { label: '整批退回', value: 'yes', style: 'danger' },
  ]);
  if (v !== 'yes') return;
  updateData((x) => revertBatch(x, batchId));
  showToast(`已退回 ${items.length} 筆到待報帳`);
}

/** 快速記帳：帳戶預設為指定帳戶，否則用上次使用的帳戶，再否則第一個一般帳戶 */
export function quickEntry(accountId: string | null) {
  const d = getState().data;
  const exists = (id: string | null) => !!id && d.accounts.some((a) => a.id === id);
  const acc = exists(accountId)
    ? accountId
    : exists(d.settings.lastUsedAccountId)
      ? d.settings.lastUsedAccountId
      : bankAccounts(d)[0]?.id ?? d.accounts[0]?.id ?? null;
  openOverlay({ kind: 'entry', mode: 'expense', accountId: acc });
}

/** 點小帳戶球：進入子畫面。「其他」球這批不做 */
export function openSub(kind: string) {
  if (kind === 'easycard' || kind === 'ewallet' || kind === 'invest' || kind === 'saving') {
    openOverlay({ kind: 'sub', ball: kind });
  } else {
    showToast('「其他」之後再做');
  }
}

async function askDeleteSpecial(t: Transaction) {
  const what = t.type === 'adjust' ? '這筆調整' : t.type === 'valuation' ? '這筆市值更新' : '這筆紀錄';
  if (!(await confirmDanger(`刪除${what}？`, '這類紀錄不能直接修改，刪除後可以重新記一筆或重新校正。', '刪除'))) return;
  updateData((x) => deleteTransaction(x, t.id));
  showToast('已刪除');
}
