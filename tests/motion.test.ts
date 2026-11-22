// 3.3 B2 動畫系統：五風格數值完整、減少動態時為 0、ghostOut 在沒有 DOM／假 DOM 下都不丟錯
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOTION, STYLE_MOTION, resolveMotion, applyMotionVars, ghostOut, pageTransition, type MotionSet } from '../src/motion';
import { UI_STYLES } from '../src/uiStyle';

const IDS = UI_STYLES.map((s) => s.id);
const MS_KEYS: (keyof MotionSet)[] = ['pageMs', 'pushMs', 'popMs', 'sheetInMs', 'sheetOutMs', 'dialogInMs', 'dialogOutMs', 'backdropMs', 'pressMs'];
const EASE_KEYS: (keyof MotionSet)[] = ['pageEase', 'pushEase', 'popEase', 'sheetInEase', 'sheetOutEase', 'dialogInEase', 'dialogOutEase', 'pressEase'];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('STYLE_MOTION', () => {
  it('五種風格都有，欄位完整', () => {
    expect(Object.keys(STYLE_MOTION).sort()).toEqual([...IDS].sort());
    for (const id of IDS) {
      const m = STYLE_MOTION[id];
      for (const k of MS_KEYS) expect(m[k], `${id}.${k}`).toSatisfy((v: unknown) => typeof v === 'number' && v > 0);
      for (const k of EASE_KEYS) expect(m[k], `${id}.${k}`).toSatisfy((v: unknown) => typeof v === 'string' && (v as string).length > 0);
      expect(typeof m.shiftPx).toBe('number');
      expect(m.dialogScale).toBeGreaterThan(0);
      expect(m.dialogScale).toBeLessThanOrEqual(1);
    }
  });

  it('各風格的個性：flat 比 glass 短、paper／liquid 比 glass 長、pixel 用 steps()', () => {
    expect(STYLE_MOTION.flat.pushMs).toBeLessThan(STYLE_MOTION.glass.pushMs);
    expect(STYLE_MOTION.paper.pushMs).toBeGreaterThan(STYLE_MOTION.glass.pushMs);
    expect(STYLE_MOTION.liquid.pushMs).toBeGreaterThan(STYLE_MOTION.paper.pushMs);
    expect(STYLE_MOTION.pixel.pushEase).toMatch(/^steps\(6/);
    expect(STYLE_MOTION.liquid.sheetInEase).toBe('cubic-bezier(.34, 1.56, .64, 1)');
    expect(STYLE_MOTION.liquid.dialogScale).toBeCloseTo(0.92);
  });

  it('毛玻璃的換頁時間沿用 config 的 PAGER.animMs', () => {
    expect(STYLE_MOTION.glass.pageMs).toBe(MOTION.page.ms);
  });

  it('換頁 transition 字串用 CSS 變數', () => {
    expect(pageTransition()).toContain('var(--mo-page-ms');
    expect(pageTransition()).toContain('var(--mo-page-ease');
  });
});

describe('減少動態', () => {
  it('resolveMotion(reduced) 所有毫秒都是 0、不位移', () => {
    for (const id of IDS) {
      const m = resolveMotion(id, true);
      for (const k of MS_KEYS) expect(m[k]).toBe(0);
      expect(m.shiftPx).toBe(0);
    }
  });
  it('沒開減少動態時回傳原值', () => {
    expect(resolveMotion('liquid', false)).toEqual(STYLE_MOTION.liquid);
  });
  it('系統開了 prefers-reduced-motion：resolveMotion 預設讀到並回 0ms', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(resolveMotion('glass').pushMs).toBe(0);
  });
});

describe('ghostOut／applyMotionVars 在沒有 DOM 的環境', () => {
  it('不丟錯、回傳 null', () => {
    expect(() => ghostOut(null, 'sub')).not.toThrow();
    expect(ghostOut(null, 'sheet')).toBeNull();
    expect(ghostOut({} as Element, 'dialog')).toBeNull();
    expect(() => applyMotionVars('liquid')).not.toThrow();
  });
});

describe('ghostOut（假 DOM）', () => {
  function fakeDom() {
    const inserted: unknown[] = [];
    const removed: unknown[] = [];
    const listeners = new Map<string, (e: unknown) => void>();
    const ghost: Record<string, unknown> = {
      classList: { add: vi.fn() },
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      style: {} as Record<string, string>,
      querySelectorAll: () => [],
      addEventListener: (t: string, f: (e: unknown) => void) => void listeners.set(t, f),
      remove: () => void removed.push(ghost),
    };
    const parent = { insertBefore: (n: unknown) => void inserted.push(n) };
    const el = { parentNode: parent, nextSibling: null, cloneNode: () => ghost } as unknown as Element;
    return { el, ghost, inserted, removed, listeners };
  }

  it('複製一份放進原位，動畫結束後移除（只移除一次）', () => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { documentElement: { style: { setProperty: () => {} } } });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const d = fakeDom();
    const g = ghostOut(d.el, 'sub');
    expect(g).toBe(d.ghost);
    expect(d.inserted).toEqual([d.ghost]);
    expect((d.ghost.classList as { add: ReturnType<typeof vi.fn> }).add).toHaveBeenCalledWith('ghost-out');
    expect((d.ghost.style as Record<string, string>).pointerEvents).toBe('none');
    d.listeners.get('animationend')?.({ target: d.ghost });
    vi.advanceTimersByTime(2000);
    expect(d.removed).toHaveLength(1);
    vi.useRealTimers();
  });

  it('減少動態時不做殘影', () => {
    vi.stubGlobal('document', { documentElement: { style: { setProperty: () => {} } } });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const d = fakeDom();
    expect(ghostOut(d.el, 'sheet')).toBeNull();
    expect(d.inserted).toHaveLength(0);
  });

  it('保險 timeout：沒有 animationend 也會移除', () => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { documentElement: { style: { setProperty: () => {} } } });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const d = fakeDom();
    ghostOut(d.el, 'dialog');
    expect(d.removed).toHaveLength(0);
    vi.advanceTimersByTime(1000);
    expect(d.removed).toHaveLength(1);
    vi.useRealTimers();
  });

  it('cloneNode 丟錯也不外洩', () => {
    vi.stubGlobal('document', {});
    const el = { parentNode: { insertBefore() {} }, cloneNode() { throw new Error('boom'); } } as unknown as Element;
    expect(() => ghostOut(el, 'sub')).not.toThrow();
  });
});

describe('applyMotionVars（假 document）', () => {
  it('寫入 --mo-* 變數，風格不同值不同', () => {
    const props = new Map<string, string>();
    vi.stubGlobal('document', { documentElement: { style: { setProperty: (k: string, v: string) => void props.set(k, v) } } });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    applyMotionVars('glass');
    const glassPush = props.get('--mo-push-ms');
    applyMotionVars('liquid');
    expect(props.get('--mo-push-ms')).not.toBe(glassPush);
    expect(props.get('--mo-sheet-in-ease')).toBe('cubic-bezier(.34, 1.56, .64, 1)');
    for (const k of ['page-ms', 'page-ease', 'push-ms', 'push-ease', 'pop-ms', 'sheet-in-ms', 'sheet-out-ms', 'dialog-in-ms', 'dialog-out-ms', 'backdrop-ms', 'press-ms']) {
      expect(props.has('--mo-' + k), k).toBe(true);
    }
  });
  it('減少動態時毫秒寫 1ms', () => {
    const props = new Map<string, string>();
    vi.stubGlobal('document', { documentElement: { style: { setProperty: (k: string, v: string) => void props.set(k, v) } } });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    applyMotionVars('glass');
    expect(props.get('--mo-push-ms')).toBe('1ms');
    expect(props.get('--mo-shift')).toBe('0px');
  });
});

import { SPLASH, splashShouldHide } from '../src/splash';

describe('開啟動畫淡出時機', () => {
  it('資料沒好：最長 3 秒才移除', () => {
    expect(splashShouldHide(1500, false, false)).toBe(false);
    expect(splashShouldHide(SPLASH.maxMs, false, false)).toBe(true);
  });
  it('資料好了：要等滿最短時間（一般 900ms、減少動態 300ms）', () => {
    expect(splashShouldHide(500, true, false)).toBe(false);
    expect(splashShouldHide(900, true, false)).toBe(true);
    expect(splashShouldHide(300, true, true)).toBe(true);
    expect(splashShouldHide(299, true, true)).toBe(false);
  });
  it('沒有 document 時 runSplash 不丟錯', async () => {
    const { runSplash } = await import('../src/splash');
    expect(() => runSplash()).not.toThrow();
  });
});
