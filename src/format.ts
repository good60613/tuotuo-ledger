export function money(n: number): string {
  const s = Math.abs(Math.round(n)).toLocaleString('en-US');
  return n < 0 ? `-$${s}` : `$${s}`;
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
export function weekday(d: Date): string {
  return `星期${WEEK[d.getDay()]}`;
}

export function mdLabel(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function hm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 給 <input type="datetime-local"> 用的本地時間字串 */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromLocalInput(v: string): string {
  return new Date(v).toISOString();
}
