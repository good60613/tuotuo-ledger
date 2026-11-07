import { useEffect, useRef } from 'preact/hooks';
import type { Account } from '../data/types';
import { money } from '../format';
import { attachCardDrag, type DropTarget } from '../gestures/cardDrag';

interface Props {
  account: Account;
  balance: number;
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
    <div class="card" ref={ref} data-drop={`account:${p.account.id}`} role="button" aria-label={p.account.name}>
      <div class="card-name">{p.account.name}</div>
      <div class={`card-balance${p.balance < 0 ? ' neg' : ''}`}>{money(p.balance)}</div>
    </div>
  );
}
