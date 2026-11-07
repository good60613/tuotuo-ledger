import { useAppState, closeDialog } from '../store';

export function DialogHost() {
  const d = useAppState().dialog;
  if (!d) return null;
  return (
    <div class="dialog-backdrop" data-no-swipe onClick={(e) => e.target === e.currentTarget && closeDialog(null)}>
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
