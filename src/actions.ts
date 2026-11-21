// 跨頁面共用的操作
import type { Transaction } from './data/types';
import { getState, openOverlay, updateData, showToast, ask, confirmDanger, replaceData, setState, goPage, PAGES } from './store';
import { clearSample } from './data/reset';
import { blankData } from './data/seed';
import { batchItems, revertBatch, deleteTransaction } from './data/ops';
import { accountName } from './selectors';
import { money } from './format';
import { bankAccounts } from './selectors';
import { entryAccountMode } from './features';

/** 點明細的一筆 */
export function openTx(t: Transaction) {
  if (t.type === 'reimburse_in') {
    if (t.reimburseBatchId) askRevertBatch(t.reimburseBatchId);
    return;
  }
  // 調整、市值、投資與儲蓄的記一筆：不走記帳頁，只能刪除（要改就刪掉重記）。
  // 2.5：儲蓄的存入／取出就是轉帳，可以用記帳頁的轉帳模式編輯（保留來源標記）；利息仍只能刪除
  if (t.type === 'adjust' || t.type === 'valuation' || (t.source && !isSavingTransfer(t))) {
    void askDeleteSpecial(t);
    return;
  }
  // 還朋友錢那筆：要改請在待辦頁「退回未還」
  if (t.type === 'owed_repay') {
    showToast('這筆是還朋友的款項，要改請在待辦頁退回未還');
    return;
  }
  openOverlay({ kind: 'entry', mode: t.type === 'owed' ? 'expense' : t.type, accountId: t.accountId, toAccountId: t.toAccountId ?? null, txId: t.id });
}

/** 2.5：儲蓄頁記的存入、取出（type＝transfer），可以編輯 */
export function isSavingTransfer(t: Transaction): boolean {
  return t.type === 'transfer' && (t.source === 'saving-in' || t.source === 'saving-out');
}

/** 整批退回待報帳（要確認） */
export async function askRevertBatch(batchId: string) {
  const d = getState().data;
  const { items, inTx } = batchItems(d, batchId);
  if (!inTx) return;
  const st = inTx.reimburseKind === 'advance' ? '待收回' : '待報帳';
  const body =
    `這一批共 ${items.length} 筆，合計 ${money(inTx.amount)}。\n` +
    `退回後，${accountName(d, inTx.toAccountId)} 會扣回 ${money(inTx.amount)}，` +
    `這 ${items.length} 筆回到「${st}」。`;
  const v = await ask(`退回${st}？`, body, [
    { label: '取消', value: 'no', style: 'secondary' },
    { label: '整批退回', value: 'yes', style: 'danger' },
  ]);
  if (v !== 'yes') return;
  updateData((x) => revertBatch(x, batchId));
  showToast(`已退回 ${items.length} 筆到${st}`);
}

/**
 * 快速記帳：帳戶預設為指定帳戶，否則依設定「記帳預設帳戶」（2.5）：上一筆用的帳戶（預設）或第一個帳戶；
 * 都沒有就第一個一般帳戶。
 */
export function quickEntry(accountId: string | null) {
  const d = getState().data;
  const exists = (id: string | null) => !!id && d.accounts.some((a) => a.id === id);
  const acc = exists(accountId)
    ? accountId
    : entryAccountMode(d.settings) === 'last' && exists(d.settings.lastUsedAccountId)
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

/**
 * 3.0 清空範例、開始記帳（首頁範例提示、教學最後一頁）：先問，清空前自動留底，
 * 清完到設定頁打開「新增帳戶」，讓使用者建立第一個帳戶。
 */
export async function clearSampleAndStart(askFirst = true): Promise<boolean> {
  if (askFirst && !(await confirmDanger('清空範例資料？', '範例的帳戶、紀錄會全部清掉，換成你自己的。外觀、字體等設定會保留。\n（清空前會自動留底，可以還原）', '清空'))) return false;
  try {
    await replaceData(clearSample(getState().data, blankData()), 'pre-clear-all');
  } catch {
    showToast('清空失敗，資料沒有變動');
    return false;
  }
  setState({ settingsIntent: 'add-account' });
  goPage(PAGES.indexOf('設定'));
  showToast('範例已清空，先新增你的第一個帳戶吧');
  return true;
}
