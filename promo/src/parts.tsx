// 共用零件：金幣、手指、手機框、字幕、動畫小工具
import React from 'react';
import { interpolate, spring, Easing } from 'remotion';

export const FPS = 30;
export const FONT = "'Microsoft JhengHei','Noto Sans TC','PingFang TC',sans-serif";
export const C = {
  bg: '#f4f5f7', card: '#ffffff', text: '#1d1f23', muted: '#7a808a', line: '#e3e5e9',
  accent: '#2f6fde', expense: '#d64545', income: '#1f9d6b', reimb: '#d98a00', budget: '#1a8fd6',
  brown: '#6b3a12', peach1: '#fde3d2', peach2: '#f7b8ae',
};

export const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
/** 在 [f0,f1] 之間由 a 變到 b（平滑） */
export const tween = (f: number, f0: number, f1: number, a = 0, b = 1, ease = Easing.inOut(Easing.cubic)) =>
  interpolate(f, [f0, f1], [a, b], { ...clamp, easing: ease });
/** 彈簧進場（0→1，可略超過 1） */
export const pop = (f: number, start: number, damping = 10) =>
  f < start ? 0 : spring({ frame: f - start, fps: FPS, config: { damping, stiffness: 180, mass: 0.6 } });

/** 依關鍵格 [格, x, y] 算出位置 */
export function path(f: number, keys: [number, number, number][]): [number, number] {
  if (f <= keys[0][0]) return [keys[0][1], keys[0][2]];
  for (let i = 1; i < keys.length; i++) {
    const [f1, x1, y1] = keys[i], [f0, x0, y0] = keys[i - 1];
    if (f <= f1) { const t = tween(f, f0, f1); return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]; }
  }
  const k = keys[keys.length - 1]; return [k[1], k[2]];
}

/** 向量金幣：照 App 圖示重畫，可換表情 */
export function Coin({ size, face, sx = 1, sy = 1 }: { size: number; face: 'neutral' | 'happy'; sx?: number; sy?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={{ transform: `scale(${sx},${sy})`, transformOrigin: '50% 100%', overflow: 'visible' }}>
      <defs>
        <radialGradient id="cf" cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#ffe27a" /><stop offset="1" stopColor="#f5b52a" /></radialGradient>
      </defs>
      <ellipse cx="100" cy="196" rx="70" ry="8" fill="#e98a7a" opacity="0.35" />
      <circle cx="100" cy="100" r="92" fill="#e7951c" stroke="#8a4b12" strokeWidth="3.5" />
      <circle cx="100" cy="97" r="82" fill="#f9c63a" />
      <circle cx="100" cy="97" r="70" fill="url(#cf)" stroke="#e39a22" strokeWidth="2.5" />
      <path d="M40 60 Q60 30 95 24" stroke="#fff6c8" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.8" />
      <text x="100" y="62" textAnchor="middle" fontSize="34" fontWeight="900" fill="#d98219" fontFamily="Arial">$</text>
      {face === 'neutral' ? (
        <g>
          <ellipse cx="74" cy="104" rx="11" ry="13" fill="#4a2a10" /><ellipse cx="126" cy="104" rx="11" ry="13" fill="#4a2a10" />
          <circle cx="70" cy="99" r="4.5" fill="#fff" /><circle cx="122" cy="99" r="4.5" fill="#fff" />
          <path d="M88 128 Q100 138 112 128" stroke="#7a3b10" strokeWidth="4" fill="none" strokeLinecap="round" />
        </g>
      ) : (
        <g>
          <path d="M62 106 Q74 90 86 106" stroke="#4a2a10" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M114 106 Q126 90 138 106" stroke="#4a2a10" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M82 120 Q100 150 118 120 Z" fill="#c9374a" stroke="#7a3b10" strokeWidth="3" strokeLinejoin="round" />
          <ellipse cx="100" cy="133" rx="9" ry="5" fill="#f28a99" />
        </g>
      )}
      <ellipse cx="58" cy="122" rx="10" ry="6" fill="#ff8a8a" opacity="0.55" />
      <ellipse cx="142" cy="122" rx="10" ry="6" fill="#ff8a8a" opacity="0.55" />
    </svg>
  );
}

/** 手指：x,y 是指尖位置；press 0~1 表示按下程度；hold 0~1 畫長按進度圈 */
export function Finger({ x, y, press = 0, hold = 0, opacity = 1, rot = -18 }: { x: number; y: number; press?: number; hold?: number; opacity?: number; rot?: number }) {
  const s = 1 - press * 0.08;
  return (
    <div style={{ position: 'absolute', left: x, top: y, opacity, pointerEvents: 'none', zIndex: 50 }}>
      {press > 0.05 && (
        <div style={{ position: 'absolute', left: -48, top: -48, width: 96, height: 96, borderRadius: 99, background: 'rgba(47,111,222,0.18)', transform: `scale(${0.6 + press * 0.6})` }} />
      )}
      {hold > 0 && (
        <svg width="150" height="150" style={{ position: 'absolute', left: -75, top: -75 }}>
          <circle cx="75" cy="75" r="62" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="10" />
          <circle cx="75" cy="75" r="62" fill="none" stroke="#ff9f43" strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 62 * hold} 999`} transform="rotate(-90 75 75)" />
        </svg>
      )}
      <svg width="130" height="330" viewBox="0 0 130 330" style={{ position: 'absolute', left: -45, top: -14, transform: `rotate(${rot}deg) scale(${s})`, transformOrigin: '45px 14px', filter: 'drop-shadow(0 10px 14px rgba(0,0,0,0.22))' }}>
        <path d="M10 40 Q10 0 45 0 Q80 0 80 40 L84 200 Q120 215 124 260 L124 330 L0 330 L4 220 Z" fill="#f8cfb0" stroke="#b07250" strokeWidth="4" strokeLinejoin="round" />
        <path d="M24 34 Q24 12 45 12 Q66 12 66 34 L64 62 Q45 72 26 62 Z" fill="#fde6d8" stroke="#d9a283" strokeWidth="3" />
        <path d="M22 120 Q45 128 72 120" stroke="#d9a283" strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/** 手機框：畫面內容會被裁切；overlay 和畫面同座標但不裁切（放手指用） */
export const PHONE = { w: 760, h: 1480, border: 18 };
export const SCREEN = { w: PHONE.w - PHONE.border * 2, h: PHONE.h - PHONE.border * 2 };
export function Phone({ x, y, children, overlay }: { x: number; y: number; children: React.ReactNode; overlay?: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: PHONE.w, height: PHONE.h }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 86, background: '#23262d', boxShadow: '0 40px 80px rgba(120,50,30,0.35)' }} />
      <div style={{ position: 'absolute', left: PHONE.border, top: PHONE.border, width: SCREEN.w, height: SCREEN.h, borderRadius: 70, overflow: 'hidden', background: C.bg, fontFamily: FONT, color: C.text }}>
        {children}
      </div>
      <div style={{ position: 'absolute', left: PHONE.border, top: PHONE.border, width: SCREEN.w, height: SCREEN.h }}>{overlay}</div>
    </div>
  );
}

/** 字幕：上方的圓角字卡，彈出進場 */
export function Subtitle({ f, from, to, text, top = 150, size = 86 }: { f: number; from: number; to: number; text: string; top?: number; size?: number }) {
  if (f < from || f > to) return null;
  const p = pop(f, from, 9);
  const out = tween(f, to - 6, to, 1, 0);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top, display: 'flex', justifyContent: 'center', zIndex: 80, opacity: out }}>
      <div style={{
        fontFamily: FONT, fontWeight: 900, fontSize: size, color: C.brown, background: '#fff', padding: '22px 56px', borderRadius: 999,
        border: '8px solid #ffcf5a', boxShadow: '0 14px 0 #f0a93a, 0 24px 40px rgba(150,70,20,0.25)', transform: `scale(${p})`, whiteSpace: 'nowrap',
      }}>{text}</div>
    </div>
  );
}

export const Bg = () => (
  <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(160deg, ${C.peach1} 0%, #fbd0c0 55%, ${C.peach2} 100%)` }}>
    {[...Array(14)].map((_, i) => (
      <div key={i} style={{ position: 'absolute', left: (i * 263) % 1080, top: (i * 431) % 1920, width: 40 + (i % 4) * 22, height: 40 + (i % 4) * 22, borderRadius: 99, background: 'rgba(255,255,255,0.28)' }} />
    ))}
  </div>
);
