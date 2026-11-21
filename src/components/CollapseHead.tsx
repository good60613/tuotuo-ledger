// 頂部浮動小條（2.2 B1／C1）：明細、統計頁往下捲時，頂端浮出一行「本期支出／本期收入」；捲回頂端時收起。
// 做法：小條本身不佔版面（高度 0 的 sticky 外框＋絕對定位內容），所以出現、收起時列表不會跳動；
// 原本的完整頂部（含五顆球）照常跟著捲動，捲回頂端自然完整出現。
import { useEffect, useRef, useState } from 'preact/hooks';
import { COLLAPSE_HEAD } from '../config';
import { money } from '../format';

export function CollapseHead({ expense, income, label = '本期' }: { expense: number; income: number; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sc = ref.current?.closest('.page') as HTMLElement | null;
    if (!sc) return;
    let raf = 0;
    const check = () => {
      raf = 0;
      setOn(sc.scrollTop > COLLAPSE_HEAD.triggerPx);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    check();
    return () => {
      sc.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div ref={ref} class={`collapse-head${on ? ' on' : ''}`} aria-hidden={!on} style={{ '--ch-ms': COLLAPSE_HEAD.animMs + 'ms' }}>
      <div class="collapse-bar glass">
        <span>{label}支出 <b class="expense">{money(expense)}</b></span>
        <span>{label}收入 <b class="income">{money(income)}</b></span>
      </div>
    </div>
  );
}
