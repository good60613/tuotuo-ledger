// 投資子畫面：頂端總額（待投入＋各標的現值）、卡片列（待投入／各標的／＋）、更新市值、記一筆四種。
import { useState } from 'preact/hooks';
import { useAppState, updateData, showToast } from '../store';
import { allBalances, holdingStats, investSummary } from '../data/calc';
import { addTransaction, holdings, investCashAccount, updateMarketValue, upsertAccount, uid, OpError, type TxInput } from '../data/ops';
import type { Account } from '../data/types';
import { SubFrame } from '../components/SubFrame';
import { AmountForm } from '../components/AmountForm';
import { Sheet } from '../components/Sheet';
import { money } from '../format';

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${money(Math.abs(n))}`;
const plClass = (n: number) => (n > 0 ? 'income' : n < 0 ? 'expense' : '');

type EntryKind = 'buy' | 'sell' | 'dividend' | 'fee';
const ENTRY_LABEL: Record<EntryKind, string> = { buy: '買進', sell: '賣出', dividend: '配息', fee: '費用' };

export function InvestSub() {
  const d = useAppState().data;
  const cash = investCashAccount(d);
  const hs = holdings(d);
  const bal = allBalances(d);
  const sum = investSummary(d);
  const [sel, setSel] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'entry' | 'value' | 'addHolding'>(null);
  const selHolding = hs.find((h) => h.id === sel) ?? null;

  const shown = sel ? [sel] : [cash?.id, ...hs.map((h) => h.id)].filter((x): x is string => !!x);
  const toggle = (id: string) => setSel(id === sel ? null : id);

  return (
    <SubFrame
      title="投資"
      total={money(sum.total)}
      subLine={
        <>
          本金 {money(sum.principal)} · 損益 <span class={plClass(sum.profit)}>{signed(sum.profit)}</span>
        </>
      }
      accountIds={shown}
      topRight={selHolding && <button class="pill-btn small" onClick={() => setSheet('value')}>更新市值</button>}
      onAdd={() => (cash ? setSheet('entry') : showToast('找不到「待投入」帳戶'))}
    >
      <div class="card-row" data-no-swipe>
        {cash && (
          <button class={`mini-card${sel === cash.id ? ' on' : ''}`} onClick={() => toggle(cash.id)} aria-pressed={sel === cash.id}>
            <span class="mini-card-name">待投入</span>
            <b>{money(bal.get(cash.id) ?? 0)}</b>
          </button>
        )}
        {hs.map((h) => {
          const st = holdingStats(h, d.transactions);
          return (
            <button key={h.id} class={`mini-card${sel === h.id ? ' on' : ''}`} onClick={() => toggle(h.id)} aria-pressed={sel === h.id}>
              <span class="mini-card-name">{h.name}</span>
              <b>{money(st.value)}</b>
              <span class={`small ${plClass(st.profit)}`}>{signed(st.profit)}</span>
            </button>
          );
        })}
        <button class="mini-card add" onClick={() => setSheet('addHolding')} aria-label="新增標的">＋</button>
      </div>

      {sheet === 'entry' && cash && <InvestEntry cash={cash} holdings={hs} preset={selHolding?.id ?? null} onClose={() => setSheet(null)} />}
      {sheet === 'value' && selHolding && <MarketValueSheet holding={selHolding} onClose={() => setSheet(null)} />}
      {sheet === 'addHolding' && <AddHolding onClose={() => setSheet(null)} />}
    </SubFrame>
  );
}

function InvestEntry({ cash, holdings: hs, preset, onClose }: { cash: Account; holdings: Account[]; preset: string | null; onClose: () => void }) {
  const [kind, setKind] = useState<EntryKind>('buy');
  const [hid, setHid] = useState<string | null>(preset ?? hs[0]?.id ?? null);
  const [note, setNote] = useState('');
  const needsHolding = kind === 'buy' || kind === 'sell';
  return (
    <AmountForm
      title="投資記一筆"
      ready={!needsHolding || !!hid}
      onSubmit={(amount) => {
        const base = { amount, note: note.trim(), occurredAt: new Date().toISOString() };
        const input: TxInput =
          kind === 'buy' ? { ...base, type: 'transfer', accountId: cash.id, toAccountId: hid!, source: 'invest-buy' }
          : kind === 'sell' ? { ...base, type: 'transfer', accountId: hid!, toAccountId: cash.id, source: 'invest-sell' }
          : kind === 'dividend' ? { ...base, type: 'income', accountId: cash.id, source: 'invest-dividend' }
          : { ...base, type: 'expense', accountId: cash.id, source: 'invest-fee' };
        try {
          updateData((x) => addTransaction(x, input).data);
          showToast(`已記一筆${ENTRY_LABEL[kind]}`);
        } catch (e) {
          showToast(e instanceof OpError ? e.message : '存檔失敗');
          return false;
        }
      }}
      onClose={onClose}
    >
      <div class="mini-seg wide">
        {(Object.keys(ENTRY_LABEL) as EntryKind[]).map((k) => (
          <button key={k} class={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{ENTRY_LABEL[k]}</button>
        ))}
      </div>
      {needsHolding && (
        hs.length === 0 ? (
          <p class="muted small">還沒有投資標的，請先按卡片列最後的「＋」新增。</p>
        ) : (
          <div class="chip-row">
            {hs.map((h) => (
              <button key={h.id} class={`chip${hid === h.id ? ' on' : ''}`} onClick={() => setHid(h.id)}>{h.name}</button>
            ))}
          </div>
        )
      )}
      <p class="muted small">
        {kind === 'buy' ? '待投入 → 標的' : kind === 'sell' ? '標的 → 待投入（填實際賣出金額）' : kind === 'dividend' ? '配息進待投入' : '費用從待投入扣'}
        ，不算主帳收支。
      </p>
      <input class="note-input full" value={note} maxLength={40} placeholder="備註" onInput={(e) => setNote(e.currentTarget.value)} />
    </AmountForm>
  );
}

function MarketValueSheet({ holding, onClose }: { holding: Account; onClose: () => void }) {
  const d = useAppState().data;
  const st = holdingStats(holding, d.transactions);
  return (
    <AmountForm
      title={`更新「${holding.name}」市值`}
      initial={st.value}
      allowZero
      hint={(v) => `本金 ${money(st.principal)}，損益 ${signed(v - st.principal)}（不算收支）`}
      onSubmit={(v) => {
        try {
          updateData((x) => updateMarketValue(x, holding.id, v));
          showToast('已更新市值');
        } catch (e) {
          showToast(e instanceof OpError ? e.message : '更新失敗');
          return false;
        }
      }}
      onClose={onClose}
    >
      <p class="muted small">輸入目前的現值。</p>
    </AmountForm>
  );
}

function AddHolding({ onClose }: { onClose: () => void }) {
  const d = useAppState().data;
  const [name, setName] = useState('');
  return (
    <Sheet title="新增投資標的" onClose={onClose}>
      <label class="field">
        <span>名稱</span>
        <input value={name} maxLength={12} onInput={(e) => setName(e.currentTarget.value)} placeholder="例如：0050" />
      </label>
      <p class="muted small">新增後用「買進」把待投入的錢放進去。</p>
      <button
        class="btn block"
        disabled={!name.trim()}
        onClick={() => {
          updateData((x) =>
            upsertAccount(x, {
              id: uid('a'),
              name: name.trim(),
              kind: 'invest',
              subtype: 'holding',
              initialBalance: 0,
              order: holdings(d).length,
            }),
          );
          showToast('已新增標的');
          onClose();
        }}
      >
        新增
      </button>
    </Sheet>
  );
}
