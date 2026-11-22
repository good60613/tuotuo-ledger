// 3.3 UI 風格：套用、非法值退回 glass、快取讀寫失敗不丟錯、色票微調合併後完整、備份不會因新欄位報錯、dev 預覽網址
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  UI_STYLES,
  applyUiStyle,
  applyCachedUiStyle,
  normalizeUiStyle,
  styleOf,
  parseDevPreview,
  applyDevPreview,
  devPreviewLock,
  liveBlurFor,
} from '../src/uiStyle';
import { STYLE_PALETTE, THEMES, paletteFor, applyTheme } from '../src/theme';
import { exportJson, parseBackup } from '../src/data/backup';
import { emptyData } from '../src/data/seed';
import type { UiStyleId } from '../src/data/types';

const IDS = UI_STYLES.map((s) => s.id);

/** 測試用的假 document：只放 theme.ts／uiStyle.ts 會碰到的東西 */
function installDom() {
  const props = new Map<string, string>();
  const classes = new Set<string>();
  const root = {
    dataset: {} as Record<string, string>,
    style: { setProperty: (k: string, v: string) => void props.set(k, v), colorScheme: '' },
    classList: {
      toggle: (c: string, on?: boolean) => {
        const want = on === undefined ? !classes.has(c) : on;
        if (want) classes.add(c); else classes.delete(c);
        return want;
      },
      contains: (c: string) => classes.has(c),
    },
  };
  const meta = { setAttribute: () => {} };
  (globalThis as unknown as Record<string, unknown>).document = {
    documentElement: root,
    querySelector: () => meta,
    createElement: () => meta,
    head: { appendChild: () => {} },
  };
  return { root, props, classes };
}

/** 假 localStorage；broken＝讀寫都丟錯 */
function installStorage(init: Record<string, string> = {}, broken = false) {
  const m = new Map(Object.entries(init));
  (globalThis as unknown as Record<string, unknown>).localStorage = {
    getItem: (k: string) => {
      if (broken) throw new Error('denied');
      return m.has(k) ? m.get(k)! : null;
    },
    setItem: (k: string, v: string) => {
      if (broken) throw new Error('denied');
      m.set(k, String(v));
    },
  };
  return m;
}

let dom: ReturnType<typeof installDom>;
beforeEach(() => {
  dom = installDom();
  installStorage();
  applyTheme('light');
  applyUiStyle('glass');
});
afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>).document;
  delete (globalThis as unknown as Record<string, unknown>).localStorage;
});

describe('UI_STYLES', () => {
  it('有 5 種風格，id 不重複，說明不超過 12 字', () => {
    expect(IDS).toEqual(['glass', 'flat', 'paper', 'pixel', 'liquid']);
    expect(new Set(IDS).size).toBe(5);
    for (const s of UI_STYLES) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.desc.length).toBeLessThanOrEqual(12);
    }
  });
});

describe('applyUiStyle', () => {
  it('設 data-style，並寫進 localStorage 快取', () => {
    const store = installStorage();
    for (const id of IDS) {
      expect(applyUiStyle(id)).toBe(id);
      expect(dom.root.dataset.style).toBe(id);
      expect(store.get('tt-ui-style')).toBe(id);
    }
  });

  it('只有 Liquid Glass 打開即時模糊（glass-blur）', () => {
    applyUiStyle('liquid');
    expect(dom.classes.has('glass-blur')).toBe(true);
    for (const id of ['glass', 'flat', 'paper', 'pixel'] as UiStyleId[]) {
      applyUiStyle(id);
      expect(dom.classes.has('glass-blur')).toBe(liveBlurFor(id));
      expect(liveBlurFor(id)).toBe(false);
    }
  });

  it('非法值一律退回 glass', () => {
    for (const bad of ['neon', '', 'GLASS', undefined, null, 123, {}, []]) {
      applyUiStyle('pixel');
      expect(applyUiStyle(bad)).toBe('glass');
      expect(dom.root.dataset.style).toBe('glass');
      expect(normalizeUiStyle(bad)).toBe('glass');
    }
  });

  it('設定缺值或亂值＝glass', () => {
    expect(styleOf(undefined)).toBe('glass');
    expect(styleOf({})).toBe('glass');
    expect(styleOf({ uiStyle: 'zzz' })).toBe('glass');
    expect(styleOf({ uiStyle: 'paper' })).toBe('paper');
  });

  it('切風格會即時重畫顏色（不用重開）', () => {
    applyUiStyle('pixel');
    expect(dom.props.get('--accent')).toBe(STYLE_PALETTE.pixel.light.accent);
    applyUiStyle('glass');
    expect(dom.props.get('--accent')).toBe(THEMES.light.accent);
    applyTheme('dark');
    applyUiStyle('paper');
    expect(dom.props.get('--accent')).toBe(STYLE_PALETTE.paper.dark.accent);
    expect(dom.props.get('--bg')).toBe(STYLE_PALETTE.paper.dark.bg);
  });

  it('localStorage 讀寫失敗不丟錯', () => {
    installStorage({}, true);
    expect(() => applyUiStyle('flat')).not.toThrow();
    expect(dom.root.dataset.style).toBe('flat');
    expect(() => applyCachedUiStyle()).not.toThrow();
    expect(applyCachedUiStyle()).toBe('glass');
  });

  it('沒有 document／localStorage 的環境也不丟錯', () => {
    delete (globalThis as unknown as Record<string, unknown>).document;
    delete (globalThis as unknown as Record<string, unknown>).localStorage;
    expect(() => applyUiStyle('pixel')).not.toThrow();
    expect(() => applyCachedUiStyle()).not.toThrow();
  });
});

describe('applyCachedUiStyle', () => {
  it('開機先套上次存的風格；沒存或亂值＝glass', () => {
    installStorage({ 'tt-ui-style': 'liquid' });
    expect(applyCachedUiStyle()).toBe('liquid');
    expect(dom.root.dataset.style).toBe('liquid');
    expect(dom.classes.has('glass-blur')).toBe(true);
    installStorage({ 'tt-ui-style': 'bogus' });
    expect(applyCachedUiStyle()).toBe('glass');
    installStorage();
    expect(applyCachedUiStyle()).toBe('glass');
    expect(dom.classes.has('glass-blur')).toBe(false);
  });
});

describe('STYLE_PALETTE', () => {
  const NAMES: Array<'light' | 'dark'> = ['light', 'dark'];
  const baseKeys = Object.keys(THEMES.light).sort();

  it('glass 沒有任何微調（現行外觀完全不變）', () => {
    expect(STYLE_PALETTE.glass.light).toEqual({});
    expect(STYLE_PALETTE.glass.dark).toEqual({});
    expect(paletteFor('light', 'glass')).toEqual(THEMES.light);
    expect(paletteFor('dark', 'glass')).toEqual(THEMES.dark);
    expect(paletteFor('light')).toEqual(THEMES.light);
  });

  it('每個風格 × 亮暗合併後都包含所有 token，沒有 undefined／空字串', () => {
    for (const id of IDS) {
      for (const n of NAMES) {
        const p = paletteFor(n, id);
        expect(Object.keys(p).sort()).toEqual(baseKeys);
        for (const k of baseKeys) {
          const v = (p as Record<string, unknown>)[k];
          expect(typeof v, `${id}/${n}/${k}`).toBe('string');
          expect((v as string).length, `${id}/${n}/${k}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('微調只用得到已存在的 token 名稱（沒有打錯字）', () => {
    for (const id of IDS) {
      for (const n of NAMES) {
        for (const k of Object.keys(STYLE_PALETTE[id][n])) expect(baseKeys, `${id}/${n}/${k}`).toContain(k);
      }
    }
  });

  it('分類顏色、圖表色、收支轉帳語意色彼此不同色', () => {
    for (const id of IDS) {
      for (const n of NAMES) {
        const p = paletteFor(n, id) as Record<string, string>;
        const norm = (v: string) => v.toLowerCase();
        const cats = Object.keys(p).filter((k) => k.startsWith('cat-')).map((k) => norm(p[k]));
        expect(new Set(cats).size, `${id}/${n} cat`).toBe(cats.length);
        const pals = ['pal-1', 'pal-2', 'pal-3', 'pal-4', 'pal-5', 'pal-6'].map((k) => norm(p[k]));
        expect(new Set(pals).size, `${id}/${n} pal`).toBe(pals.length);
        const sem = ['expense', 'income', 'transfer', 'reimb', 'budget', 'advance', 'owed'].map((k) => norm(p[k]));
        expect(new Set(sem).size, `${id}/${n} semantic`).toBe(sem.length);
      }
    }
  });

  it('文字色與底色不同（至少看得出來）', () => {
    for (const id of IDS) {
      for (const n of NAMES) {
        const p = paletteFor(n, id);
        expect(p.text).not.toBe(p.bg);
        expect(p.text).not.toBe(p.card);
        expect(p['on-accent']).not.toBe(p.accent);
      }
    }
  });
});

describe('備份與設定', () => {
  it('uiStyle 欄位匯出再匯入不報錯、值保留；舊備份沒有這欄＝glass', () => {
    const d = emptyData();
    d.settings.uiStyle = 'pixel';
    expect(parseBackup(exportJson(d)).settings.uiStyle).toBe('pixel');
    const old = emptyData();
    delete old.settings.uiStyle;
    const back = parseBackup(exportJson(old));
    expect(back.settings.uiStyle).toBeUndefined();
    expect(styleOf(back.settings)).toBe('glass');
  });

  it('備份裡有不認得的風格值，匯入不報錯，使用時退回 glass', () => {
    const d = emptyData();
    (d.settings as unknown as Record<string, unknown>).uiStyle = 'future-style';
    const back = parseBackup(exportJson(d));
    expect(styleOf(back.settings)).toBe('glass');
  });
});

describe('dev 預覽網址', () => {
  it('只認得合法的 style／theme', () => {
    expect(parseDevPreview('?style=pixel&theme=dark')).toEqual({ style: 'pixel', theme: 'dark' });
    expect(parseDevPreview('?style=liquid')).toEqual({ style: 'liquid' });
    expect(parseDevPreview('?theme=light')).toEqual({ theme: 'light' });
    expect(parseDevPreview('?style=nope&theme=purple')).toEqual({});
    expect(parseDevPreview('')).toEqual({});
  });

  it('只套用、不寫進 localStorage 快取', () => {
    const store = installStorage();
    applyDevPreview('?style=paper&theme=dark');
    expect(dom.root.dataset.style).toBe('paper');
    expect(dom.root.dataset.theme).toBe('dark');
    expect(dom.props.get('--bg')).toBe(STYLE_PALETTE.paper.dark.bg);
    expect(store.size).toBe(0);
    expect(devPreviewLock()).toEqual({ style: 'paper', theme: 'dark' });
    applyDevPreview(''); // 清掉鎖，不影響其他測試
    expect(devPreviewLock()).toEqual({});
  });
});
