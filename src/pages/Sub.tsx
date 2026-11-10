// 小帳戶子畫面（點首頁或明細頁的小帳戶球進來）：悠遊卡、電子錢包。投資、儲蓄在各自的檔案。
import { useState } from 'preact/hooks';
import { useAppState, openOverlay, updateData, showToast, type Overlay } from '../store';
import { allBalances } from '../data/calc';
import { calibrate, OpError } from '../data/ops';
import { accountsOfKind } from '../selectors';
import { Icon } from '../components/Icon';
import { ACCOUNT_KIND_ICON } from '../icons';
import { SubFrame } from '../components/SubFrame';
import { AmountForm, diffText } from '../components/AmountForm';
import { InvestSub } from './SubInvest';
import { SavingSub } from './SubSaving';
import { money } from '../format';

type SubOverlay = Extract<Overlay, { kind: 'sub' }>;

export function SubPage({ o }: { o: SubOverlay }) {
  if (o.ball === 'invest') return <InvestSub />;
  if (o.ball === 'saving') return <SavingSub />;
  return <WalletSub kind={o.ball} />;
}

/** 校正視窗：輸入實際餘額 → 差額自動產生「調整」 */
export function CalibrateSheet({ accountId, name, onClose }: { accountId: string; name: string; onClose: () => void }) {
  const d = useAppState().data;
  const cur = allBalances(d).get(accountId) ?? 0;
  return (
    <AmountForm
      title={`校正「${name}」`}
      initial={cur}
      allowZero
      hint={(v) => diffText(v - cur)}
      onSubmit={(v) => {
        try {
          updateData((x) => calibrate(x, accountId, v));
          showToast(v === cur ? '和帳上一致，沒有調整' : '已校正');
        } catch (e) {
          showToast(e instanceof OpError ? e.message : '校正失敗');
          return false;
        }
      }}
      onClose={onClose}
    >
      <p class="muted small">帳上目前 {money(cur)}。輸入實際的餘額。</p>
    </AmountForm>
  );
}

/** 悠遊卡（單一帳戶）與電子錢包（可多個，卡片列可左右滑） */
function WalletSub({ kind }: { kind: 'easycard' | 'ewallet' }) {
  const d = useAppState().data;
  const bal = allBalances(d);
  const accs = accountsOfKind(d, kind);
  const [sel, setSel] = useState<string | null>(null);
  const selected = accs.find((a) => a.id === sel) ?? null;
  const [calib, setCalib] = useState(false);

  // 校正對象：只有一個帳戶時一直顯示；多個時要選了某一個才出現
  const target = accs.length === 1 ? accs[0] : selected;
  const total = accs.reduce((s, a) => s + (bal.get(a.id) ?? 0), 0);
  const shown = selected ? [selected.id] : accs.map((a) => a.id);

  return (
    <SubFrame
      title={kind === 'easycard' ? '悠遊卡' : '電子錢包'}
      total={money(total)}
      accountIds={shown}
      topRight={target && <button class="pill-btn small" onClick={() => setCalib(true)}>校正</button>}
      onAdd={() => {
        const acc = target ?? accs[0];
        if (!acc) return showToast('請先到設定新增帳戶');
        openOverlay({ kind: 'entry', mode: 'expense', accountId: acc.id });
      }}
    >
      {kind === 'ewallet' && (
        <div class="card-row" data-no-swipe>
          {accs.map((a) => (
            <button
              key={a.id}
              class={`mini-card${a.id === sel ? ' on' : ''}`}
              onClick={() => setSel(a.id === sel ? null : a.id)}
              aria-pressed={a.id === sel}
            >
              <span class="mini-card-name"><Icon name={ACCOUNT_KIND_ICON[kind]} size={16} /> {a.name}</span>
              <b>{money(bal.get(a.id) ?? 0)}</b>
            </button>
          ))}
        </div>
      )}
      {calib && target && <CalibrateSheet accountId={target.id} name={target.name} onClose={() => setCalib(false)} />}
    </SubFrame>
  );
}
