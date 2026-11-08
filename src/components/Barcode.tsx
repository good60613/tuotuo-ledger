import { code39Widths } from '../data/carrier';
import { CARRIER } from '../config';

/** 手機條碼載具的 Code 39 條碼（SVG）。號碼格式不對就不畫。 */
export function Barcode({ code }: { code: string }) {
  const widths = code39Widths(code, CARRIER.wideRatio);
  if (!widths) return null;
  const q = CARRIER.quietModules;
  const total = widths.reduce((a, b) => a + b, 0) + q * 2;
  const n = CARRIER.previewNarrowPx;
  const h = CARRIER.previewHeightPx;
  let x = q;
  const bars = widths.map((w, i) => {
    const r = i % 2 === 0 ? <rect key={i} x={x} y={0} width={w} height={h} /> : null;
    x += w;
    return r;
  });
  return (
    <div class="barcode">
      <svg width={total * n} height={h} viewBox={`0 0 ${total} ${h}`} preserveAspectRatio="none" shape-rendering="crispEdges">
        <rect x={0} y={0} width={total} height={h} fill="#fff" />
        <g fill="#000">{bars}</g>
      </svg>
      <div class="barcode-text">{code}</div>
    </div>
  );
}
