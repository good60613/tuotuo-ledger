import { Icon } from '../components/Icon';
// 明細頁（右一）：時間軸列出每一筆。2.2：頂部浮動小條、底部篩選膠囊列（帳戶｜日期｜分類｜類型｜🔍）
import { useState } from 'preact/hooks';
import { useAppState, setState, getState, updateData, showToast, confirmDanger, PAGES } from '../store';
import { useBackLayer } from '../backNav';
import { canMoveTx, slotTime, moveTx, deleteMany, restoreDeleted, type DropSlot } from '../data/txMove';
import { OpError } from '../data/ops';
import { shortDay, hm } from '../format';
import type { TxDragOptions } from '../gestures/txDrag';
import { totals, periodKey, dayKey, touchesAccount, statEffect, kindLookup, inMainLedger } from '../data/calc';
import { Balls } from '../components/Balls';
import { TxList } from '../components/TxList';
import { BottomBar } from '../components/BottomBar';
import { CollapseHead } from '../components/CollapseHead';
import { FilterBar } from '../components/FilterBar';
import { matchSearch, matchType } from '../detailFilter';
import { openTx, quickEntry } from '../actions';
import { money } from '../format';
import { prevBalances } from '../data/prevBalance';
import { prevBalanceOn } from '../features';

export function DetailPage() {
  const s = useAppState();
  const d = s.data;
  // 篩選的帳戶若已被刪除，就當作「全部」
  const f = d.accounts.some((a) => a.id === s.detail.accountId) ? s.detail : { ...s.detail, accountId: null };
  const sd = d.settings.settleDay;
  const period = f.period ?? periodKey(new Date(), sd);
  const m = totals(d, { period, accountId: f.accountId });
  const kindOf = kindLookup(d.accounts);
  // 搜尋的範圍是全部月份，不受日期膠囊限制
  const q = (f.q ?? '').trim();

  const txs = d.transactions.filter(
    (t) =>
      (q ? matchSearch(d, t, q) : periodKey(t.occurredAt, sd) === period && (!f.day || dayKey(t.occurredAt) === f.day)) &&
      // 「全部帳戶」＝主帳：有碰到一般帳戶的紀錄（儲值同時出現在主帳和小帳戶子畫面）
      (f.accountId ? touchesAccount(t, f.accountId) : inMainLedger(t, kindOf)) &&
      (!f.categoryId || statEffect(t, kindOf)?.categoryId === f.categoryId) &&
      (!f.kind || matchType(t, f.kind)),
  );

  // ---- 2.5：拖曳換位置、拖去刪除、多選刪除 ----
  const [multi, setMulti] = useState<string[] | null>(null);
  const exitMulti = () => setMulti(null);
  useBackLayer(s.page === PAGES.indexOf('明細') && multi !== null, exitMulti);
  const toggle = (id: string) => setMulti((m) => (m ? (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]) : m));

  /** 確認後刪除（拖去垃圾桶、多選共用）；刪完給〔復原〕 */
  const askDelete = async (ids: string[]) => {
    if (ids.length === 0) return;
    const ok = await confirmDanger(ids.length === 1 ? '刪除這筆紀錄？' : `刪除這 ${ids.length} 筆紀錄？`, '帳戶餘額會跟著改變。刪除後可以在提示條按〔復原〕。');
    if (!ok) return;
    const r = deleteMany(getState().data, ids);
    if (r.deleted.length) updateData(() => r.data);
    exitMulti();
    const skip = r.skipped.length ? `（${r.skipped.length} 筆不能刪：${r.skipped[0].reason}）` : '';
    if (r.deleted.length === 0) {
      showToast(r.skipped[0]?.reason ?? '沒有刪除任何紀錄');
      return;
    }
    showToast(`已刪除 ${r.deleted.length} 筆${skip}`, () => {
      updateData((x) => restoreDeleted(x, r.deleted));
      showToast('已復原');
    });
  };

  const drag: TxDragOptions | undefined = multi
    ? undefined
    : {
        canDrag: (id) => {
          const t = getState().data.transactions.find((x) => x.id === id);
          return !!t && canMoveTx(t);
        },
        onPick: (id) => setMulti([id]),
        onLift: () => setState({ dragging: true }),
        onEnd: () => setState({ dragging: false }),
        onCantDrag: () => showToast('轉帳、校正這類紀錄不能拖曳換位置（長按放開可多選）'),
        onTrash: (id) => void askDelete([id]),
        onDrop: (id: string, slot: DropSlot) => {
          const data = getState().data;
          const at = slotTime(data, id, slot);
          if (!at) return;
          try {
            const r = moveTx(data, id, at);
            updateData(() => r.data);
            const nd = new Date(at);
            showToast(`已移到 ${shortDay(nd)} ${hm(nd)}`, () => {
              updateData((x) => ({ ...x, transactions: x.transactions.map((t) => (t.id === id ? r.old : t)) }));
              showToast('已復原');
            });
          } catch (e) {
            showToast(e instanceof OpError ? e.message : '移動失敗');
          }
        },
      };

  return (
    <div class="page-pad detail has-bar">
      <CollapseHead expense={m.expense} income={m.income} />
      <div class="month-sum">
        <div>
          <div class="amt-label">本期支出</div>
          <div class="amt-mid expense">{money(m.expense)}</div>
        </div>
        <div>
          <div class="amt-label">本期收入</div>
          <div class="amt-mid income">{money(m.income)}</div>
        </div>
      </div>

      <Balls data={d} />

      <TxList data={d} txs={txs} onTap={multi ? (t) => toggle(t.id) : openTx} selected={multi ? new Set(multi) : undefined} drag={drag} prevBal={prevBalanceOn(d.settings) ? prevBalances(d) : null} empty={q ? '找不到符合的紀錄' : '這個條件下沒有紀錄'} />

      <button class="fab" onClick={() => quickEntry(f.accountId)} aria-label="快速記帳"><Icon name="plus" size={28} /></button>

      <BottomBar>
        {multi ? (
          <div class="multi-bar">
            <button class="btn secondary" onClick={exitMulti}>取消</button>
            <span class="muted small">已選 {multi.length} 筆</span>
            <button class="btn danger" disabled={multi.length === 0} onClick={() => void askDelete(multi)}>刪除（{multi.length} 筆）</button>
          </div>
        ) : (
          <FilterBar f={f} period={period} />
        )}
      </BottomBar>
    </div>
  );
}
