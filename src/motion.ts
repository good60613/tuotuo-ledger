// 3.3 B2 動畫系統：集中放動畫數值與工具。
// - MOTION：基礎數值（毫秒＋緩動曲線）；STYLE_MOTION[風格]：五種風格各自的倍率／覆蓋值
// - applyMotionVars(風格)：把數值寫成 :root 的 CSS 變數（--mo-*），styles.css 與 ui-*.css 全部用變數，切風格即時生效
// - ghostOut(元素, 種類)：離場殘影。畫面狀態照常「立刻」關閉（store 的時序不動、返回鍵不受影響），
//   只是在元素卸載的瞬間複製一份它的樣子放在原位播退場動畫，播完就移除（純視覺、沒有互動）。
// - 系統開了「減少動態效果」：不做殘影，所有 --mo-*-ms 降到 1ms（只留極短淡入）。
import { useLayoutEffect } from 'preact/hooks';
import { PAGER } from './config';
import type { UiStyleId } from './data/types';

/** 一組完整的動畫數值（毫秒與緩動曲線，另含位移距離與對話框起始縮放） */
export interface MotionSet {
  pageMs: number; pageEase: string;
  pushMs: number; pushEase: string;
  popMs: number; popEase: string;
  sheetInMs: number; sheetInEase: string;
  sheetOutMs: number; sheetOutEase: string;
  dialogInMs: number; dialogInEase: string;
  dialogOutMs: number; dialogOutEase: string;
  backdropMs: number;
  pressMs: number; pressEase: string;
  /** 子視窗／選單進場的位移距離（px） */
  shiftPx: number;
  /** 對話框進場起始縮放（1＝不縮放） */
  dialogScale: number;
}

const OUT = 'cubic-bezier(.4, 0, 1, 1)'; // 離場：先慢後快
const SMOOTH = 'cubic-bezier(.22, .8, .3, 1)'; // 進場：柔順 ease-out

/** 基礎數值（毛玻璃＝現行感覺再順一點）。換頁時間沿用 config 的 PAGER.animMs */
export const MOTION = {
  page: { ms: PAGER.animMs, ease: SMOOTH },
  push: { ms: 230, ease: SMOOTH },
  pop: { ms: 190, ease: OUT },
  sheetIn: { ms: 260, ease: SMOOTH },
  sheetOut: { ms: 200, ease: OUT },
  dialogIn: { ms: 200, ease: SMOOTH },
  dialogOut: { ms: 150, ease: OUT },
  backdrop: { ms: 200 },
  press: { ms: 90, ease: 'ease-out' },
  shiftPx: 28,
  dialogScale: 0.94,
} as const;

const r = (n: number) => Math.max(1, Math.round(n));

/** 以基礎數值乘上倍率 k，再套用各風格想覆蓋的緩動／位移 */
function build(k: number, o: Partial<{
  pageEase: string; pushEase: string; inEase: string; outEase: string; sheetEase: string; pressEase: string;
  shiftPx: number; dialogScale: number;
}> = {}): MotionSet {
  const inE = o.inEase ?? SMOOTH;
  const outE = o.outEase ?? OUT;
  return {
    pageMs: r(MOTION.page.ms * k), pageEase: o.pageEase ?? inE,
    pushMs: r(MOTION.push.ms * k), pushEase: o.pushEase ?? inE,
    popMs: r(MOTION.pop.ms * k), popEase: outE,
    sheetInMs: r(MOTION.sheetIn.ms * k), sheetInEase: o.sheetEase ?? inE,
    sheetOutMs: r(MOTION.sheetOut.ms * k), sheetOutEase: outE,
    dialogInMs: r(MOTION.dialogIn.ms * k), dialogInEase: o.sheetEase ?? inE,
    dialogOutMs: r(MOTION.dialogOut.ms * k), dialogOutEase: outE,
    backdropMs: r(MOTION.backdrop.ms * k),
    pressMs: r(MOTION.press.ms * Math.min(k, 1.1)), pressEase: o.pressEase ?? MOTION.press.ease,
    shiftPx: o.shiftPx ?? MOTION.shiftPx,
    dialogScale: o.dialogScale ?? MOTION.dialogScale,
  };
}

/** 五種風格各自的動畫個性 */
export const STYLE_MOTION: Record<UiStyleId, MotionSet> = {
  // 毛玻璃：柔順 ease-out
  glass: build(1),
  // 簡約扁平：短而俐落（約 0.75×），純淡入＋小位移
  flat: build(0.75, { inEase: 'cubic-bezier(.3, .7, .3, 1)', shiftPx: 12, dialogScale: 0.98 }),
  // 手帳紙本：舒緩（1.1×），ease-in-out，輕微上浮
  paper: build(1.1, { inEase: 'cubic-bezier(.45, 0, .25, 1)', outEase: 'cubic-bezier(.45, 0, .55, 1)', shiftPx: 18, dialogScale: 0.96 }),
  // 像素復古：階梯、純位移、無彈性。3.3 實測：換頁用階梯會像掉格（卡卡的），所以換頁維持平滑，只有選單／對話框／子畫面用階梯
  pixel: build(1, { inEase: 'steps(8, end)', outEase: 'steps(6, end)', pageEase: SMOOTH, pressEase: 'steps(2, end)', shiftPx: 24, dialogScale: 1 }),
  // Liquid Glass：彈簧（帶過衝）、較長（1.2×），進場帶縮放與模糊（見 ui-liquid.css）
  liquid: build(1.2, {
    inEase: 'cubic-bezier(.34, 1.56, .64, 1)',
    pageEase: 'cubic-bezier(.25, 1.12, .4, 1)', // 換頁只帶一點過衝，不然最左／最右頁會露出底色
    pushEase: 'cubic-bezier(.3, 1.2, .5, 1)', // 子視窗蓋滿畫面，過衝太大會在右緣露出底下的頁面，所以收斂一點
    outEase: 'cubic-bezier(.5, 0, .75, .3)',
    pressEase: 'cubic-bezier(.34, 1.56, .64, 1)',
    shiftPx: 36, dialogScale: 0.92,
  }),
};

/** 系統是否開了「減少動態效果」 */
export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

let currentStyle: UiStyleId = 'glass';

/** 取得某風格實際生效的數值；減少動態時所有毫秒都是 0 */
export function resolveMotion(id: UiStyleId, reduced: boolean = prefersReducedMotion()): MotionSet {
  const m = STYLE_MOTION[id] ?? STYLE_MOTION.glass;
  if (!reduced) return m;
  return {
    ...m,
    pageMs: 0, pushMs: 0, popMs: 0, sheetInMs: 0, sheetOutMs: 0,
    dialogInMs: 0, dialogOutMs: 0, backdropMs: 0, pressMs: 0,
    shiftPx: 0, dialogScale: 1,
  };
}

/** 把動畫數值寫成 :root 的 CSS 變數（沒有 document＝不做事）。減少動態時毫秒寫 1ms */
export function applyMotionVars(id: UiStyleId): MotionSet {
  currentStyle = STYLE_MOTION[id] ? id : 'glass';
  const m = resolveMotion(currentStyle);
  if (typeof document === 'undefined') return m;
  const st = document.documentElement?.style;
  if (!st) return m;
  const ms = (n: number) => Math.max(1, n) + 'ms';
  const set = (k: string, v: string) => st.setProperty('--mo-' + k, v);
  set('page-ms', ms(m.pageMs)); set('page-ease', m.pageEase);
  set('push-ms', ms(m.pushMs)); set('push-ease', m.pushEase);
  set('pop-ms', ms(m.popMs)); set('pop-ease', m.popEase);
  set('sheet-in-ms', ms(m.sheetInMs)); set('sheet-in-ease', m.sheetInEase);
  set('sheet-out-ms', ms(m.sheetOutMs)); set('sheet-out-ease', m.sheetOutEase);
  set('dialog-in-ms', ms(m.dialogInMs)); set('dialog-in-ease', m.dialogInEase);
  set('dialog-out-ms', ms(m.dialogOutMs)); set('dialog-out-ease', m.dialogOutEase);
  set('backdrop-ms', ms(m.backdropMs));
  set('press-ms', ms(m.pressMs)); set('press-ease', m.pressEase);
  set('shift', m.shiftPx + 'px');
  set('dialog-scale', String(m.dialogScale));
  return m;
}

/** 換頁容器（.track）用的 transition 字串：與 CSS 變數同一組值（變數還沒寫入時退回 PAGER.animMs） */
export const pageTransition = (): string =>
  `transform var(--mo-page-ms, ${PAGER.animMs}ms) var(--mo-page-ease, ${SMOOTH})`;

export type GhostKind = 'sub' | 'entry' | 'sheet' | 'dialog';

/** 殘影要存活多久（毫秒）；0＝不做 */
function ghostMs(kind: GhostKind, m: MotionSet): number {
  if (kind === 'sheet') return Math.max(m.sheetOutMs, 0);
  if (kind === 'dialog') return Math.max(m.dialogOutMs, 0);
  return m.popMs;
}

/**
 * 離場殘影：複製元素目前的樣子，以同樣 class 加上 .ghost-out 放在原位（緊接在原元素後面），
 * 播完退場動畫後移除。沒有 document、沒有 cloneNode、減少動態時一律安全略過（回傳 null，不丟錯）。
 * 殘影沒有 id、不能聚焦、不吃點擊。
 */
export function ghostOut(el: Element | null | undefined, kind: GhostKind): HTMLElement | null {
  try {
    if (typeof document === 'undefined' || !el || typeof el.cloneNode !== 'function') return null;
    const parent = el.parentNode;
    if (!parent || typeof parent.insertBefore !== 'function') return null;
    const m = resolveMotion(currentStyle);
    const ms = ghostMs(kind, m);
    if (ms <= 0) return null; // 減少動態
    const g = el.cloneNode(true) as HTMLElement;
    g.classList?.add('ghost-out');
    g.setAttribute?.('aria-hidden', 'true');
    g.setAttribute?.('inert', '');
    if (g.style) g.style.pointerEvents = 'none';
    g.removeAttribute?.('id');
    g.querySelectorAll?.('[id]').forEach((n) => n.removeAttribute('id'));
    g.querySelectorAll?.('button, input, select, textarea, a, [tabindex]').forEach((n) => n.setAttribute('tabindex', '-1'));
    parent.insertBefore(g, el.nextSibling);
    let done = false;
    const rm = () => {
      if (done) return;
      done = true;
      try { g.remove(); } catch { /* 已經被移除 */ }
    };
    g.addEventListener?.('animationend', (e) => { if (e.target === g) rm(); });
    setTimeout(rm, ms + 80); // 保險：動畫沒跑（背景分頁、被關掉）也一定移除
    return g;
  } catch {
    return null;
  }
}

/**
 * 元件用：元素卸載時做離場殘影。
 * `when` 可選：回傳 false 就不做（例如疊層「換成另一個」而不是「關掉」時）。
 */
export function useGhostOut(ref: { current: Element | null }, kind: GhostKind, when?: () => boolean) {
  useLayoutEffect(
    () => () => {
      const el = ref.current;
      if (el && (!when || when())) ghostOut(el, kind);
    },
    [],
  );
}
