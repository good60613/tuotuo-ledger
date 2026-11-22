import { useRef } from 'preact/hooks';
import { useAppState, closeDialog, type State } from '../store';
import { useGhostOut } from '../motion';

type DialogState = NonNullable<State['dialog']>;

export function DialogHost() {
  const d = useAppState().dialog;
  if (!d) return null;
  return <DialogView d={d} />;
}

/** 對話框本體。關閉（卸載）時做離場殘影，真正的狀態照常立刻關掉 */
function DialogView({ d }: { d: DialogState }) {
  const ref = useRef<HTMLDivElement>(null);
  useGhostOut(ref, 'dialog');
  return (
    <div class="dialog-backdrop" data-no-swipe ref={ref} onClick={(e) => e.target === e.currentTarget && closeDialog(null)}>
      <div class="dialog" role="alertdialog">
        <div class="dialog-title">{d.title}</div>
        {d.body && <div class="dialog-body">{d.body}</div>}
        <div class={`dialog-btns${d.buttons.length > 2 ? ' vertical' : ''}`}>
          {d.buttons.map((b) => (
            <button key={b.value} class={`btn ${b.style ?? 'primary'}`} onClick={() => closeDialog(b.value)}>
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
