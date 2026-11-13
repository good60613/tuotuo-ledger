// 明細頁底部篩選膠囊列（2.2 B2）：帳戶｜日期｜分類｜類型｜🔍。
// 有套用的膠囊變藍底、顯示目前選擇並帶 ×。一排放不下時可左右滑（這時才擋住左右換頁）。
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useAppState, setState, type DetailFilter } from '../store';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { AccountPicker } from './AccountPicker';
import { catBg } from './CatIcon';
import { periodKey, shiftPeriod } from '../data/calc';
import { accountName, categoriesOf, categoryDisplay } from '../selectors';
import { TYPE_FILTERS } from '../detailFilter';
import { periodLabel } from './PeriodBar';
import { mdLabel } from '../format';

/** 期別膠囊上的短標籤：今年「11月」，其他年「25年11月」 */
function shortPeriod(key: string, current: string): string {
  const [y, m] = key.split('-');
  return y === current.slice(0, 4) ? `${Number(m)}月` : `${y.slice(2)}年${Number(m)}月`;
}

function Cap({ on, onTap, onClear, children }: { on: boolean; onTap: () => void; onClear?: () => void; children: ComponentChildren }) {
  return (
    <div class={`cap${on ? ' on' : ''}`}>
      <button class="cap-main" onClick={onTap}>{children}</button>
      {on && onClear && <button class="cap-x" onClick={onClear} aria-label="清除"><Icon name="x" size={14} /></button>}
    </div>
  );
}

export function FilterBar({ f, period }: { f: DetailFilter; period: string }) {
  const st0 = useAppState();
  const d = st0.data;
  const set = (p: Partial<DetailFilter>) => setState((st) => ({ detail: { ...st.detail, ...p } }));
  const [sheet, setSheet] = useState<null | 'acc' | 'period' | 'cat' | 'kind'>(null);
  const [searching, setSearching] = useState(false);
  // 通知欄「搜尋」：要求直接打開搜尋（每次要求 searchRequest 加 1）
  useEffect(() => {
    if (st0.searchRequest > 0) setSearching(true);
  }, [st0.searchRequest]);
  const current = periodKey(new Date(), d.settings.settleDay);
  const go = (p: string) => set({ period: p === current ? null : p, day: null });
  const q = f.q ?? '';

  // 一排放得下時不擋左右換頁；放不下（可左右滑）時才擋
  const row = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    if (el.scrollWidth > el.clientWidth + 1) el.setAttribute('data-no-swipe', '');
    else el.removeAttribute('data-no-swipe');
  });

  if (searching) {
    return (
      <div class="cap-row" data-no-swipe>
        <input
          class="cap-search"
          type="search"
          placeholder="搜尋備註、分類（全部月份）"
          value={q}
          ref={(el) => {
            if (el && !el.dataset.f) {
              el.dataset.f = '1';
              el.focus();
            }
          }}
          onInput={(e) => set({ q: (e.target as HTMLInputElement).value })}
          onKeyDown={(e) => e.key === 'Enter' && setSearching(false)}
        />
        <div class="cap"><button class="cap-main" onClick={() => setSearching(false)}>完成</button></div>
      </div>
    );
  }

  // 可選的期別：從最早一筆紀錄所在的期別，到目前這一期
  const periods: string[] = [];
  if (sheet === 'period') {
    const first = d.transactions.reduce((m, t) => (t.occurredAt < m ? t.occurredAt : m), new Date().toISOString());
    const earliest = periodKey(first, d.settings.settleDay);
    for (let p = current; p >= earliest && periods.length < 60; p = shiftPeriod(p, -1)) periods.push(p);
  }

  const dateOn = period !== current || !!f.day;
  const kindLabel = TYPE_FILTERS.find((k) => k.key === f.kind)?.label;
  const pick = (p: Partial<DetailFilter>) => {
    set(p);
    setSheet(null);
  };

  return (
    <div class="cap-row" ref={row}>
      <Cap on={!!f.accountId} onTap={() => setSheet('acc')} onClear={() => set({ accountId: null })}>
        {f.accountId ? accountName(d, f.accountId) : '帳戶'}
      </Cap>
      {/* 搜尋時範圍是全部月份，日期膠囊變淡表示暫不作用 */}
      <div class={`cap cap-date${dateOn ? ' on' : ''}${q.trim() ? ' dim' : ''}`}>
        <button class="cap-arrow" onClick={() => go(shiftPeriod(period, -1))} aria-label="上一期"><Icon name="chevron-left" size={16} /></button>
        <button class="cap-main" onClick={() => setSheet('period')}>{f.day ? mdLabel(new Date(f.day + 'T00:00')) : shortPeriod(period, current)}</button>
        <button class="cap-arrow" disabled={period >= current} onClick={() => go(shiftPeriod(period, 1))} aria-label="下一期"><Icon name="chevron-right" size={16} /></button>
        {dateOn && <button class="cap-x" onClick={() => set({ period: null, day: null })} aria-label="回到本期"><Icon name="x" size={14} /></button>}
      </div>
      <Cap on={!!f.categoryId} onTap={() => setSheet('cat')} onClear={() => set({ categoryId: null })}>
        {f.categoryId ? categoryDisplay(d, f.categoryId).name : '分類'}
      </Cap>
      <Cap on={!!f.kind} onTap={() => setSheet('kind')} onClear={() => set({ kind: null })}>
        {kindLabel ?? '類型'}
      </Cap>
      <Cap on={!!q.trim()} onTap={() => setSearching(true)} onClear={() => set({ q: '' })}>
        <Icon name="search" size={16} />
        {q.trim() && <span class="cap-q">{q.trim()}</span>}
      </Cap>

      {sheet === 'acc' && (
        <AccountPicker title="帳戶" allowAll mainOnly value={f.accountId} onPick={(id) => set({ accountId: id })} onClose={() => setSheet(null)} />
      )}
      {sheet === 'period' && (
        <Sheet title="選擇月份" onClose={() => setSheet(null)}>
          {periods.map((p) => (
            <button
              key={p}
              class={`pick-row${p === period && !f.day ? ' selected' : ''}`}
              onClick={() => {
                go(p);
                setSheet(null);
              }}
            >
              <span class="pick-name">{periodLabel(p)}</span>
            </button>
          ))}
        </Sheet>
      )}
      {sheet === 'cat' && (
        <Sheet title="分類" onClose={() => setSheet(null)}>
          <button class={`pick-row${!f.categoryId ? ' selected' : ''}`} onClick={() => pick({ categoryId: null })}>
            <span class="pick-icon"><Icon name="layers" /></span>
            <span class="pick-name">全部</span>
          </button>
          {(['expense', 'income'] as const).map((type) => (
            <div key={type}>
              <div class="pick-group">{type === 'expense' ? '支出分類' : '收入分類'}</div>
              {categoriesOf(d, type).map((c) => (
                <button key={c.id} class={`pick-row${f.categoryId === c.id ? ' selected' : ''}`} onClick={() => pick({ categoryId: c.id })}>
                  <span class="pick-icon cat-bg" style={{ background: catBg(c.color) }}><Icon name={c.icon} size={20} /></span>
                  <span class="pick-name">{c.name}</span>
                </button>
              ))}
            </div>
          ))}
        </Sheet>
      )}
      {sheet === 'kind' && (
        <Sheet title="類型" onClose={() => setSheet(null)}>
          <button class={`pick-row${!f.kind ? ' selected' : ''}`} onClick={() => pick({ kind: null })}>
            <span class="pick-name">全部</span>
          </button>
          {TYPE_FILTERS.map((k) => (
            <button key={k.key} class={`pick-row${f.kind === k.key ? ' selected' : ''}`} onClick={() => pick({ kind: k.key })}>
              <span class="pick-name">{k.label}</span>
            </button>
          ))}
        </Sheet>
      )}
    </div>
  );
}
