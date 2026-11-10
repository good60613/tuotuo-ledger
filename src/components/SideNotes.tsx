import { money } from '../format';

/** 右側小字欄的一列（例如「預算 1,000」、之後的「借我 600」） */
export interface SideNote {
  key: string;
  label: string;
  amount: number;
  /** 有給就變成可點的按鈕 */
  onClick?: () => void;
  /** 金額顏色：預設 budget；可擴充 */
  tone?: 'budget' | 'expense' | 'income' | 'muted';
  /** 金額後面的補充（例如逾期筆數） */
  extra?: string;
  /** 補充文字用警示色 */
  extraWarn?: boolean;
}

/** 剩餘可用右側的小字欄：可接多列，沒有任何列時回傳 null（由外層決定不畫分隔線） */
export function SideNotes({ items }: { items: SideNote[] }) {
  if (items.length === 0) return null;
  return (
    <div class="amt-side">
      {items.map((it) => {
        const body = (
          <>
            <span class="amt-side-label">{it.label}</span> <b class={`tone-${it.tone ?? 'budget'}`}>{money(it.amount)}</b>
            {it.extra && <span class={`amt-side-extra${it.extraWarn ? ' warn' : ''}`}>{it.extra}</span>}
          </>
        );
        return it.onClick ? (
          <button key={it.key} class="amt-side-row" onClick={it.onClick}>
            {body}
          </button>
        ) : (
          <div key={it.key} class="amt-side-row">
            {body}
          </div>
        );
      })}
    </div>
  );
}
