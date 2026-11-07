// 統計頁的圖表，全部用 SVG 自己畫（不需外部套件，離線可用）。
import type { Totals } from '../data/calc';
import { money } from '../format';

export const PALETTE = ['#2f6fde', '#e0663a', '#1f9d6b', '#9b59d0', '#d9a400', '#8a94a3'];

/** 甜甜圈圓餅圖 */
export function Donut({ parts, center }: { parts: { value: number; color: string }[]; center: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const r = 42, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg viewBox="0 0 110 110" class="donut" aria-hidden="true">
      <circle cx="55" cy="55" r={r} fill="none" stroke="#e9ecf1" stroke-width="16" />
      {total > 0 &&
        parts.map((p, i) => {
          const len = (p.value / total) * c;
          const el = (
            <circle
              key={i}
              cx="55" cy="55" r={r} fill="none" stroke={p.color} stroke-width="16"
              stroke-dasharray={`${len} ${c - len}`} stroke-dashoffset={-acc}
              transform="rotate(-90 55 55)"
            />
          );
          acc += len;
          return el;
        })}
      <text x="55" y="59" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">{center}</text>
    </svg>
  );
}

const W = 340, H = 140, PAD_L = 4, PAD_B = 18;

function axisDays(n: number) {
  return [1, 5, 10, 15, 20, 25, n].filter((v, i, a) => a.indexOf(v) === i);
}

/** 每日收支折線 */
export function LineChart({ series, show, upto }: { series: Totals[]; show: 'both' | 'expense' | 'income'; upto?: number }) {
  const n = series.length;
  const keys = show === 'both' ? (['expense', 'income'] as const) : ([show] as const);
  const max = Math.max(1, ...series.flatMap((d) => keys.map((k) => d[k])));
  const x = (i: number) => PAD_L + (i / Math.max(1, n - 1)) * (W - PAD_L * 2);
  const y = (v: number) => (H - PAD_B) - (v / max) * (H - PAD_B - 10);
  const color = { expense: '#d64545', income: '#1f9d6b' };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="chart" aria-hidden="true">
      <line x1="0" x2={W} y1={H - PAD_B} y2={H - PAD_B} stroke="#e3e5e9" />
      {keys.map((k) => (
        <polyline
          key={k}
          fill="none" stroke={color[k]} stroke-width="2" stroke-linejoin="round"
          points={series.slice(0, upto ?? n).map((d, i) => `${x(i)},${y(d[k])}`).join(' ')}
        />
      ))}
      {axisDays(n).map((dd) => (
        <text key={dd} x={x(dd - 1)} y={H - 4} font-size="10" text-anchor="middle" fill="#7a808a">{dd}</text>
      ))}
      <text x={W - 2} y="10" font-size="10" text-anchor="end" fill="#7a808a">最高 {money(max)}</text>
    </svg>
  );
}

/** 每日柱狀圖 */
export function BarChart({ values, color }: { values: number[]; color: string }) {
  const n = values.length;
  const max = Math.max(1, ...values);
  const bw = (W - PAD_L * 2) / n;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="chart" aria-hidden="true">
      <line x1="0" x2={W} y1={H - PAD_B} y2={H - PAD_B} stroke="#e3e5e9" />
      {values.map((v, i) => {
        const h = (v / max) * (H - PAD_B - 10);
        return <rect key={i} x={PAD_L + i * bw + 1} y={H - PAD_B - h} width={Math.max(1, bw - 2)} height={h} rx="1.5" fill={color} />;
      })}
      {axisDays(n).map((dd) => (
        <text key={dd} x={PAD_L + (dd - 0.5) * bw} y={H - 4} font-size="10" text-anchor="middle" fill="#7a808a">{dd}</text>
      ))}
      <text x={W - 2} y="10" font-size="10" text-anchor="end" fill="#7a808a">最高 {money(max)}</text>
    </svg>
  );
}
