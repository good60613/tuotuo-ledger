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

const W = 340, H = 150, PAD_L = 4, PAD_B = 18;
/** 折線圖左邊留給數值刻度的寬度 */
const AXIS_L = 38;

/** X 軸要標哪幾個位置（第 1 天、每 5 天、最後一天） */
function axisIdx(n: number) {
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (i === 0 || (i + 1) % 5 === 0 || i === n - 1) out.push(i);
  // 最後兩個太近時，省略倒數第二個
  if (out.length > 2 && out[out.length - 1] - out[out.length - 2] < 3) out.splice(out.length - 2, 1);
  return out;
}

const short = (v: number) => (v >= 10000 ? `${Math.round(v / 1000) / 10}萬` : v.toLocaleString('en-US'));

export const LINE_COLOR = { expense: '#d64545', income: '#1f9d6b' };

/** 每日收支折線：有格線、左邊數值刻度，下方圖例標出哪個顏色是支出、哪個是收入 */
export function LineChart({ series, labels, show, upto }: { series: Totals[]; labels: string[]; show: 'both' | 'expense' | 'income'; upto?: number }) {
  const n = series.length;
  const keys = show === 'both' ? (['expense', 'income'] as const) : ([show] as const);
  const max = Math.max(1, ...series.flatMap((d) => keys.map((k) => d[k])));
  const x = (i: number) => AXIS_L + (i / Math.max(1, n - 1)) * (W - AXIS_L - 6);
  const y = (v: number) => (H - PAD_B) - (v / max) * (H - PAD_B - 12);
  const ticks = [0, 1, 2, 3, 4].map((k) => (max * k) / 4);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} class="chart" aria-hidden="true">
        {ticks.map((v, k) => (
          <g key={k}>
            <line x1={AXIS_L} x2={W - 4} y1={y(v)} y2={y(v)} stroke={k === 0 ? '#c9ccd2' : '#eceef2'} />
            <text x={AXIS_L - 4} y={y(v) + 3} font-size="9" text-anchor="end" fill="#7a808a">{short(Math.round(v))}</text>
          </g>
        ))}
        {keys.map((k) => (
          <polyline
            key={k}
            fill="none" stroke={LINE_COLOR[k]} stroke-width="2" stroke-linejoin="round"
            points={series.slice(0, upto ?? n).map((d, i) => `${x(i)},${y(d[k])}`).join(' ')}
          />
        ))}
        {axisIdx(n).map((i) => (
          <text key={i} x={x(i)} y={H - 4} font-size="10" text-anchor="middle" fill="#7a808a">{labels[i]}</text>
        ))}
      </svg>
      <div class="chart-legend">
        {keys.map((k) => (
          <span key={k}><i style={{ background: LINE_COLOR[k] }} />{k === 'expense' ? '支出' : '收入'}</span>
        ))}
      </div>
    </>
  );
}

/** 每日柱狀圖 */
export function BarChart({ values, labels, color }: { values: number[]; labels: string[]; color: string }) {
  const n = values.length;
  const max = Math.max(1, ...values);
  const bw = (W - PAD_L * 2) / n;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="chart" aria-hidden="true">
      <line x1="0" x2={W} y1={H - PAD_B} y2={H - PAD_B} stroke="#e3e5e9" />
      {values.map((v, i) => {
        const h = (v / max) * (H - PAD_B - 12);
        return <rect key={i} x={PAD_L + i * bw + 1} y={H - PAD_B - h} width={Math.max(1, bw - 2)} height={h} rx="1.5" fill={color} />;
      })}
      {axisIdx(n).map((i) => (
        <text key={i} x={PAD_L + (i + 0.5) * bw} y={H - 4} font-size="10" text-anchor="middle" fill="#7a808a">{labels[i]}</text>
      ))}
      <text x={W - 2} y="10" font-size="10" text-anchor="end" fill="#7a808a">最高 {money(max)}</text>
    </svg>
  );
}
