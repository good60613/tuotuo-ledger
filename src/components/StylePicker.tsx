// 3.3 設定頁的「風格」選擇：5 張小卡，每張上方是用該風格色彩／形狀畫的迷你預覽（純 CSS，不依賴目前套用的風格）
import { UI_STYLES, type UiStyleId } from '../uiStyle';
import { paletteFor, type ThemeName } from '../theme';

/** 迷你預覽的形狀：卡片圓角、按鈕圓角、邊框、陰影（寫死在這裡，不吃 CSS 的風格規則） */
const SHAPE: Record<UiStyleId, { card: number; btn: number; bw: number; dash?: boolean; shadow: (ink: string) => string; blur?: boolean }> = {
  glass: { card: 10, btn: 8, bw: 1, shadow: () => '0 3px 8px rgba(30,90,110,.18)', blur: true },
  flat: { card: 6, btn: 5, bw: 1, shadow: () => 'none' },
  paper: { card: 3, btn: 3, bw: 1, dash: true, shadow: () => '1px 2px 2px rgba(80,55,20,.18)' },
  pixel: { card: 0, btn: 0, bw: 2, shadow: (ink) => `3px 3px 0 ${ink}` },
  liquid: { card: 13, btn: 99, bw: 1, shadow: () => '0 5px 12px rgba(80,110,255,.30), inset 0 1px 0 rgba(255,255,255,.9)', blur: true },
};

function Preview({ id, theme }: { id: UiStyleId; theme: ThemeName }) {
  const p = paletteFor(theme, id);
  const sh = SHAPE[id];
  const glassy = id === 'glass' || id === 'liquid';
  const ink = id === 'pixel' ? p.text : p['border-strong'];
  const border = `${sh.bw}px ${sh.dash ? 'dashed' : 'solid'} ${id === 'pixel' ? p.text : id === 'paper' ? p['border-strong'] : id === 'flat' ? p.line : p.gbd}`;
  const bg = glassy
    ? `linear-gradient(135deg, ${p['glow-a']}, ${p['glow-b']}), ${p.bg}`
    : p.bg;
  return (
    <span class="style-prev" style={{ background: bg }} aria-hidden="true">
      <i
        class="sp-card"
        style={{
          background: glassy ? p.gbg : p.card,
          border,
          borderRadius: `${sh.card}px`,
          boxShadow: sh.shadow(ink),
          backdropFilter: sh.blur ? 'blur(4px)' : undefined,
        }}
      />
      <i class="sp-line" style={{ background: p.muted, borderRadius: `${Math.min(sh.btn, 2)}px` }} />
      <i
        class="sp-btn"
        style={{
          background: p.accent,
          borderRadius: `${sh.btn}px`,
          border: id === 'pixel' ? `2px solid ${p.text}` : 'none',
          boxShadow: id === 'pixel' ? `2px 2px 0 ${p.text}` : id === 'liquid' ? `0 3px 8px ${p.glow}` : 'none',
        }}
      />
    </span>
  );
}

export function StylePicker({ current, theme, onPick }: { current: UiStyleId; theme: ThemeName; onPick: (id: UiStyleId) => void }) {
  return (
    <div class="style-pick">
      <div class="style-pick-head">
        <span>風格</span>
        <span class="muted small">亮色、暗色都能搭配</span>
      </div>
      <div class="style-strip" role="group" aria-label="外觀風格" data-no-swipe>
        {UI_STYLES.map((s) => {
          const on = s.id === current;
          return (
            <button key={s.id} class={`style-opt${on ? ' on' : ''}`} aria-pressed={on} onClick={() => !on && onPick(s.id)}>
              <Preview id={s.id} theme={theme} />
              <span class="style-name">{s.label}</span>
              <span class="style-desc muted small">{s.desc}</span>
              {on && <span class="style-check" aria-hidden="true">使用中</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
