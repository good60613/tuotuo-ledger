// 整支影片：分鏡時間表 + 音效排程。30fps，共 900 格（30 秒）。
import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Bg, C, Coin, FONT, Finger, PHONE, Phone, Subtitle, pop, tween } from './parts';
import { BALL_POPS, BUDGET_T, BallsScreen, BudgetScreen, HOME_T, HomeScreen, STATS_T, StatsScreen, WIDGET_T, WidgetScreen } from './screens';

/** 分鏡起點（格數）：改節奏只要動這裡 */
export const S = { intro: 0, home: 90, balls: 360, budget: 440, widget: 520, stats: 600, outro: 810, end: 900 };
const PX = (1080 - PHONE.w) / 2, PY = 390;

/** 音效排程：[格數, 檔名, 音量] */
const CUES: [number, string, number][] = [
  // 1. 金幣跳出、被捏、嗚嗚嗚
  [2, 'boing', 0.8], [30, 'whoosh', 0.4], [42, 'squeak', 0.9], [50, 'sob1', 0.8], [57, 'sob2', 0.8], [64, 'sob3', 0.8], [72, 'pop', 0.7],
  // 2. 首頁、長按拖到支出、記一筆
  [S.home, 'whoosh', 0.6], [S.home + HOME_T.press, 'tick', 0.7], [S.home + HOME_T.lift, 'pop', 0.8], [S.home + HOME_T.lift + 4, 'pop3', 0.5],
  [S.home + HOME_T.drop, 'thud', 0.9], [S.home + HOME_T.drop + 4, 'whoosh', 0.35],
  [S.home + HOME_T.k1, 'tap', 0.7], [S.home + HOME_T.k2, 'tap', 0.7], [S.home + HOME_T.k0, 'tap', 0.7], [S.home + HOME_T.cat, 'tap', 0.7],
  [S.home + HOME_T.done, 'tap', 0.7], [S.home + HOME_T.done + 2, 'ding', 0.8],
  // 3. 三個功能
  [S.balls - 2, 'whoosh', 0.5], ...BALL_POPS.map((t, i): [number, string, number] => [S.balls + t, 'pop' + (i + 1), 0.75]),
  [S.budget - 2, 'whoosh', 0.5], [S.budget + BUDGET_T.paid, 'tap', 0.7], [S.budget + BUDGET_T.paid + 1, 'pop4', 0.6], [S.budget + BUDGET_T.send, 'tap', 0.7], [S.budget + BUDGET_T.send + 1, 'ding', 0.6],
  [S.widget - 2, 'whoosh', 0.5], [S.widget + WIDGET_T.show, 'pop', 0.7], [S.widget + WIDGET_T.beep, 'beep', 0.6],
  // 4. 統計圓環轉一圈
  [S.stats - 2, 'whoosh', 0.5], [S.stats + STATS_T.spin0, 'rise', 0.7],
  ...[0, 1, 2, 3, 4].map((i): [number, string, number] => [S.stats + STATS_T.legend + i * 7, 'tick', 0.6]),
  [S.stats + 100, 'ding', 0.7], [S.stats + STATS_T.focus, 'pop5', 0.7],
  // 5. 金幣開心跳、片名
  [S.outro, 'whoosh', 0.6], [S.outro + 8, 'boing', 0.8], [S.outro + 30, 'boing', 0.8], [S.outro + 42, 'chime', 0.8], [S.outro + 56, 'sparkle', 0.8],
];

export function Promo() {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: FONT, overflow: 'hidden' }}>
      <style>{'*{box-sizing:border-box}'}</style>
      <Bg />
      {f < S.home + 4 && <Intro f={f} />}
      {f >= S.home - 2 && f < S.outro + 16 && <PhoneScenes f={f} />}
      {f >= S.outro && <Outro l={f - S.outro} />}

      <Subtitle f={f} from={68} to={S.home - 1} text="記帳好麻煩？" top={1560} />
      <Subtitle f={f} from={S.home + HOME_T.lift} to={S.balls - 4} text="一拖就記" />
      <Subtitle f={f} from={S.balls + 2} to={S.budget - 2} text="五顆小帳戶球" />
      <Subtitle f={f} from={S.budget + 2} to={S.widget - 2} text="預算・報帳" />
      <Subtitle f={f} from={S.widget + 2} to={S.stats - 2} text="小工具＋載具條碼" size={78} />
      <Subtitle f={f} from={S.stats + 100} to={S.outro - 2} text="錢去哪了，一眼就懂" size={76} />

      {CUES.map(([t, name, v], i) => (
        <Sequence key={i} from={t} durationInFrames={60}>
          <Audio src={staticFile(`sfx/${name}.wav`)} volume={v} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

/* 1. 金幣跳出來 → 手指捏 → 換成 App 圖示的哭臉 → 嗚嗚嗚 */
function Intro({ f }: { f: number }) {
  const PINCH = 42;
  const s = pop(f, 0, 7);
  const bob = Math.sin(f / 5) * 8;
  const pinched = f >= PINCH;
  const shake = pinched ? Math.sin((f - PINCH) * 2.2) * 14 * Math.max(0, 1 - (f - PINCH) / 18) : 0;
  const squish = pinched ? 1 + 0.06 * Math.max(0, 1 - (f - PINCH) / 10) : 1;
  const fade = 1 - tween(f, S.home - 4, S.home + 4);
  const [fx, fy] = [tween(f, 26, PINCH, 1300, 905), tween(f, 26, PINCH, 1150, 830)];
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      {!pinched ? (
        <div style={{ position: 'absolute', left: 540 - 337, top: 820 - 337 + bob - (1 - s) * 300, transform: `scale(${s})` }}>
          <Coin size={674} face="neutral" sx={1 + (1 - Math.min(s, 1)) * 0.2} sy={Math.min(s, 1.1)} />
        </div>
      ) : (
        <Img src={staticFile('icon.png')} style={{
          position: 'absolute', left: 117 + shake, top: 334, width: 1000, height: 1000, transform: `scale(${squish}, ${2 - squish})`,
          WebkitMaskImage: 'radial-gradient(circle at 42% 49%, #000 56%, transparent 72%)', maskImage: 'radial-gradient(circle at 42% 49%, #000 56%, transparent 72%)',
        }} />
      )}
      {f >= 26 && !pinched && <Finger x={fx} y={fy} rot={-70} />}
      {pinched && f < PINCH + 6 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, background: '#fff', opacity: 1 - (f - PINCH) / 6 }} />
      )}
      {[[50, 150, 300, -14], [57, 330, 230, 6], [64, 520, 300, 16]].map(([t, x, y, r]) =>
        f >= t ? (
          <div key={t} style={{ position: 'absolute', left: x, top: y, fontSize: 130, fontWeight: 900, color: '#5a8de8', WebkitTextStroke: '8px #fff', paintOrder: 'stroke',
            transform: `rotate(${r}deg) scale(${pop(f, t, 8)}) translateY(${Math.sin((f - t) / 3) * 6}px)`, textShadow: '0 8px 0 rgba(60,90,160,0.25)' }}>嗚</div>
        ) : null,
      )}
    </AbsoluteFill>
  );
}

/* 2~4. 手機裡的畫面依序切換（往左滑） */
function PhoneScenes({ f }: { f: number }) {
  const enter = tween(f, S.home - 2, S.home + 14, 1, 0);
  const exit = tween(f, S.outro, S.outro + 14);
  const list: [number, number, (l: number) => React.ReactNode][] = [
    [S.home, S.balls, (l) => <HomeScreen l={l} />],
    [S.balls, S.budget, (l) => <BallsScreen l={l} />],
    [S.budget, S.widget, (l) => <BudgetScreen l={l} />],
    [S.widget, S.stats, (l) => <WidgetScreen l={l} />],
    [S.stats, S.end, (l) => <StatsScreen l={l} />],
  ];
  const SLIDE = 10;
  return (
    <div style={{ position: 'absolute', inset: 0, transform: `translateY(${enter * 1500 + exit * 1600}px) rotate(${exit * 8}deg)` }}>
      <Phone x={PX} y={PY}>
        {list.map(([a, b, render], i) => {
          if (f < a - SLIDE || f >= b) return null;
          // 下一個畫面提早 SLIDE 格從右邊滑進來，同時這個畫面往左滑出
          const inX = i === 0 ? 0 : tween(f, a - SLIDE, a, 1, 0);
          const outX = tween(f, b - SLIDE, b, 0, -1);
          return (
            <div key={a} style={{ position: 'absolute', inset: 0, transform: `translateX(${(inX + outX) * 100}%)`, background: C.bg }}>
              {render(Math.max(0, f - a))}
            </div>
          );
        })}
      </Phone>
    </div>
  );
}

/* 5. 金幣開心跳兩下 → 片名 */
function Outro({ l }: { l: number }) {
  const jump = (t0: number) => { const t = (l - t0) / 20; return t >= 0 && t <= 1 ? Math.sin(Math.PI * t) : 0; };
  const h = jump(8) * 220 + jump(30) * 260;
  const land = (t0: number) => { const t = l - t0; return t >= 0 && t < 8 ? Math.sin((Math.PI * t) / 8) : 0; };
  const sq = land(28) + land(50);
  const enter = pop(l, 2, 9);
  const title = pop(l, 42, 8);
  const tag = pop(l, 56, 10);
  return (
    <AbsoluteFill>
      {[...Array(8)].map((_, i) => {
        const a = (i / 8) * Math.PI * 2 + l / 30, r = 380 + Math.sin(l / 6 + i) * 30;
        const s = pop(l, 44 + i * 2, 8);
        return <div key={i} style={{ position: 'absolute', left: 540 + Math.cos(a) * r - 30, top: 640 + Math.sin(a) * r * 0.8 - 30, fontSize: 60, transform: `scale(${s})` }}>{i % 2 ? '✨' : '⭐'}</div>;
      })}
      <div style={{ position: 'absolute', left: 540 - 260, top: 380 - h, transform: `scale(${enter})`, transformOrigin: '50% 100%' }}>
        <Coin size={520} face="happy" sx={1 + sq * 0.12} sy={1 - sq * 0.12} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1000, textAlign: 'center', transform: `scale(${title})` }}>
        <div style={{ fontSize: 190, fontWeight: 900, color: '#ff8a3d', WebkitTextStroke: '14px #fff', paintOrder: 'stroke', textShadow: '0 14px 0 #e0602a33', letterSpacing: 8 }}>拖拖記帳</div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1290, display: 'flex', justifyContent: 'center', transform: `scale(${tag})` }}>
        <div style={{ fontSize: 60, fontWeight: 900, color: C.brown, background: '#fff', borderRadius: 999, padding: '20px 48px', boxShadow: '0 10px 0 #f0a93a' }}>
          一拖就記，再也不拖拖拉拉
        </div>
      </div>
    </AbsoluteFill>
  );
}
