import { useEffect, useRef } from 'preact/hooks';
import type { Account } from '../data/types';
import { money } from '../format';
import { AccountIcon } from './AccountIcon';
import { attachCardDrag, type DropTarget } from '../gestures/cardDrag';

interface Props {
  account: Account;
  balance: number;
  /** 這個帳戶未付的預算合計（0＝不顯示） */
  budget?: number;
  onTap: (acc: Account) => void;
  onLift: (acc: Account) => void;
  onHover: (t: DropTarget | null) => void;
  onDrop: (acc: Account, t: DropTarget) => void;
  onEnd: () => void;
}

export function AccountCard(p: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // 用 ref 拿最新的 props，手勢只需要掛一次
  const latest = useRef(p);
  latest.current = p;

  useEffect(() => {
    return attachCardDrag(ref.current!, {
      sourceId: () => latest.current.account.id,
      onTap: () => latest.current.onTap(latest.current.account),
      onLift: () => latest.current.onLift(latest.current.account),
      onHover: (t) => latest.current.onHover(t),
      onDrop: (t) => latest.current.onDrop(latest.current.account, t),
      onEnd: () => latest.current.onEnd(),
    });
  }, []);

  return (
    <div class="card glass" ref={ref} data-drop={`account:${p.account.id}`} role="button" aria-label={p.account.name}>
      <AccountIcon account={p.account} />
      <div class="card-body">
        <div class="card-name-row">
          <span class="card-name">{p.account.name}</span>
          {!!p.budget && <span class="card-budget">預 {money(p.budget)}</span>}
        </div>
        <div class={`card-balance${p.balance < 0 ? ' neg' : ''}`}>{money(p.balance)}</div>
      </div>
    </div>
  );
}
