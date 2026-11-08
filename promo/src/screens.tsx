// 手機裡的各個畫面（照 App 的樣子重畫，數字全是假資料）。每個畫面收到自己的「本地格數」l。
import React from 'react';
import { Img, staticFile, interpolate } from 'remotion';
import { C, FONT, SCREEN, money, tween, pop, path, Finger, clamp } from './parts';

const W = SCREEN.w;
const abs = (l: number, t: number, w: number, h: number): React.CSSProperties => ({ position: 'absolute', left: l, top: t, width: w, height: h });
const cardBox: React.CSSProperties = { background: C.card, borderRadius: 30, boxShadow: '0 4px 14px rgba(0,0,0,0.06)' };

const StatusBar = ({ dark = false }) => (
  <div style={{ ...abs(0, 0, W, 56), display: 'flex', justifyContent: 'space-between', padding: '16px 56px 0', fontSize: 26, fontWeight: 700, color: dark ? '#fff' : C.text }}>
    <span>9:41</span><span>▂▄▆ 🔋</span>
  </div>
);

const NAV = [['🏠', '首頁'], ['📋', '明細'], ['✅', '待辦'], ['📊', '統計'], ['⚙️', '設定']];
const BottomNav = ({ active }: { active: number }) => (
  <div style={{ ...abs(0, SCREEN.h - 92, W, 92), background: C.card, borderTop: `2px solid ${C.line}`, display: 'flex' }}>
    {NAV.map(([ic, t], i) => (
      <div key={t} style={{ flex: 1, textAlign: 'center', paddingTop: 10, fontSize: 22, color: i === active ? C.accent : C.muted, fontWeight: i === active ? 800 : 500 }}>
        <div style={{ fontSize: 34, filter: i === active ? 'none' : 'grayscale(1) opacity(0.6)' }}>{ic}</div>{t}
      </div>
    ))}
  </div>
);

const Label = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 24, color: C.muted, fontWeight: 600 }}>{children}</div>;

/* ---------------- 首頁：長按卡片 → 拖到支出 → 記一筆 ---------------- */
const CARD0 = { x: 362, y: 566 };
const ZONE = { x: 188, y: 1270 };
const KEY = { k1: [137, 912], k2: [362, 912], k0: [362, 1227], cat: [101, 770], done: [362, 1380] } as const;
export const HOME_T = { press: 48, lift: 78, drop: 120, k1: 142, k2: 150, k0: 158, cat: 168, done: 182 };

export function HomeScreen({ l }: { l: number }) {
  const T = HOME_T;
  const lifted = l >= T.lift && l < T.drop + 8;
  const zonesOn = l >= T.lift - 2 && l < T.drop + 10;
  const hoverExp = l >= 106 && l < T.drop + 10;
  const rec = tween(l, T.done + 6, T.done + 30); // 記好之後數字變化
  const typed = l >= T.k0 ? '120' : l >= T.k2 ? '12' : l >= T.k1 ? '1' : '0';
  const sheetY = l < T.drop ? 1 : l < T.done + 2 ? 1 - tween(l, T.drop + 2, T.drop + 14) : tween(l, T.done + 2, T.done + 14);

  // 手指路徑
  const [fx, fy] = path(l, [[18, 820, 1500], [44, CARD0.x, CARD0.y], [T.lift + 2, CARD0.x, CARD0.y], [T.drop - 4, ZONE.x, ZONE.y], [T.drop + 8, ZONE.x, ZONE.y],
    [T.k1 - 4, KEY.k1[0], KEY.k1[1]], [T.k2 - 3, KEY.k2[0], KEY.k2[1]], [T.k0 - 3, KEY.k0[0], KEY.k0[1]], [T.cat - 4, KEY.cat[0], KEY.cat[1]], [T.done - 4, KEY.done[0], KEY.done[1]], [T.done + 24, 900, 1600]]);
  const taps = [T.k1, T.k2, T.k0, T.cat, T.done];
  const tapPress = Math.max(0, ...taps.map((t) => (l >= t - 2 && l < t + 4 ? 1 - Math.abs(l - t) / 4 : 0)));
  const press = l >= T.press && l < T.drop ? 1 : tapPress;
  const hold = l >= T.press && l < T.lift ? tween(l, T.press, T.lift, 0, 1, (x) => x) : 0;
  const fingerOp = tween(l, 18, 26) * (1 - tween(l, T.done + 16, T.done + 24));

  // 被拿起的卡片跟著手指
  const liftS = lifted ? 1.06 - tween(l, T.drop, T.drop + 8, 0, 0.7) : 1;
  const cardOff = lifted ? [fx - CARD0.x, fy - CARD0.y] : [0, 0];
  // 放下時縮進支出區，之後卡片回到原位（餘額已扣）
  const cardOp = l < T.drop ? 1 : l < T.drop + 8 ? 1 - tween(l, T.drop, T.drop + 8) : tween(l, T.drop + 8, T.drop + 16);

  const banks = [['薪轉帳戶', 45000 - 120 * rec], ['郵局', 18000], ['國泰', 9000]] as const;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <StatusBar />
      <div style={{ ...abs(40, 70, 600, 60), fontSize: 46, fontWeight: 900 }}>11月9日 <span style={{ color: C.muted, fontSize: 32, fontWeight: 600 }}>週一</span></div>
      {/* 金額區 */}
      <div style={{ ...abs(40, 150, W - 80, 90), display: 'flex' }}>
        <div style={{ flex: 1 }}><Label>今日收入</Label><div style={{ fontSize: 38, fontWeight: 800, color: C.income }}>$0</div></div>
        <div style={{ flex: 1 }}><Label>今日支出</Label><div style={{ fontSize: 38, fontWeight: 800, color: C.expense }}>{money(120 * rec)}</div></div>
      </div>
      <div style={{ ...abs(40, 248, W - 80, 90), display: 'flex' }}>
        <div style={{ flex: 1 }}><Label>本月收入</Label><div style={{ fontSize: 42, fontWeight: 800, color: C.income }}>$45,000</div></div>
        <div style={{ flex: 1 }}><Label>本月支出</Label><div style={{ fontSize: 42, fontWeight: 800, color: C.expense }}>{money(18520 + 120 * rec)}</div></div>
      </div>
      <div style={{ ...abs(40, 348, W - 80, 140), textAlign: 'center' }}>
        <Label>剩餘可用</Label>
        <div style={{ fontSize: 84, fontWeight: 900, lineHeight: 1.05 }}>{money(62380 - 120 * rec)}</div>
        <div style={{ fontSize: 22, color: C.budget, fontWeight: 700 }}>已圈預算 $15,799</div>
      </div>
      {/* 一般帳戶卡片 */}
      {banks.map(([name, bal], i) => {
        const me = i === 0;
        const ty = 500 + i * 150;
        const st: React.CSSProperties = me
          ? { transform: `translate(${cardOff[0]}px,${cardOff[1]}px) scale(${liftS})`, zIndex: 20, opacity: cardOp, boxShadow: lifted ? '0 24px 40px rgba(0,0,0,0.25)' : cardBox.boxShadow }
          : {};
        return (
          <React.Fragment key={name}>
            {me && lifted && <div style={{ ...abs(24, ty, W - 48, 132), borderRadius: 30, border: `3px dashed ${C.line}` }} />}
            <div style={{ ...abs(24, ty, W - 48, 132), ...cardBox, display: 'flex', alignItems: 'center', padding: '0 32px', gap: 22, ...st }}>
              <div style={{ width: 76, height: 76, borderRadius: 40, background: '#e8f0ff', fontSize: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🏦</div>
              <div style={{ flex: 1, fontSize: 36, fontWeight: 800 }}>{name}</div>
              <div style={{ fontSize: 40, fontWeight: 900, color: me && rec > 0 && rec < 1 ? C.expense : C.text }}>{money(bal)}</div>
            </div>
          </React.Fragment>
        );
      })}
      <MiniBalls top={962} />
      {/* 最近紀錄 / 拿起卡片時變成支出、收入放置區 */}
      {zonesOn ? (
        <>
          <div style={{ ...abs(0, 1150, W, 40), textAlign: 'center', fontSize: 26, fontWeight: 700, color: hoverExp ? C.expense : C.muted }}>
            {hoverExp ? '放開 ＝ 記一筆支出（薪轉帳戶）' : '往下拖到「支出」或「收入」'}
          </div>
          {[['－', '支出', C.expense, 24, hoverExp], ['＋', '收入', C.income, 372, false]].map(([ic, t, col, x, on]) => (
            <div key={t as string} style={{ ...abs(x as number, 1196, 328, 150), borderRadius: 30, border: `5px dashed ${col}`, background: on ? (col as string) + '33' : '#fff',
              transform: `scale(${on ? 1.05 : 1})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, fontWeight: 900, color: col as string, gap: 10 }}>
              <span>{ic}</span>{t}
            </div>
          ))}
        </>
      ) : (
        <div style={{ ...abs(24, 1160, W - 48, 190), display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden' }}>
          {l > T.done + 4 && <TxRow ic="🍱" name="餐飲" note="午餐便當" amt={120} scale={pop(l, T.done + 6)} hot />}
          <TxRow ic="🍜" name="餐飲" note="早餐蛋餅" amt={55} />
          <TxRow ic="🚌" name="交通" note="公車" amt={15} />
        </div>
      )}
      <BottomNav active={0} />
      {/* 記帳面板 */}
      <EntrySheet y={480 + sheetY * 980} typed={typed} catOn={l >= T.cat} doneHot={l >= T.done - 2 && l < T.done + 4} />
      {/* 記好的提示 */}
      {l > T.done + 2 && l < T.done + 70 && (
        <div style={{ ...abs(70, 60, W - 140, 90), borderRadius: 50, background: '#1f2a24', color: '#fff', fontSize: 32, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
          transform: `translateY(${(1 - pop(l, T.done + 2)) * -120 + tween(l, T.done + 60, T.done + 70, 0, -160)}px)` }}>
          ✅ 已記一筆　餐飲 −$120
        </div>
      )}
      <Finger x={fx} y={fy} press={press} hold={hold} opacity={fingerOp} />
    </div>
  );
}

function TxRow({ ic, name, note, amt, scale = 1, hot = false }: { ic: string; name: string; note: string; amt: number; scale?: number; hot?: boolean }) {
  return (
    <div style={{ ...cardBox, height: 78, flex: '0 0 78px', display: 'flex', alignItems: 'center', padding: '0 26px', gap: 18, transform: `scale(${scale})`, border: hot ? `3px solid ${C.expense}55` : 'none' }}>
      <span style={{ fontSize: 36 }}>{ic}</span>
      <span style={{ fontSize: 28, fontWeight: 800 }}>{name}</span>
      <span style={{ fontSize: 24, color: C.muted, flex: 1 }}>{note}</span>
      <span style={{ fontSize: 30, fontWeight: 900, color: C.expense }}>−{money(amt)}</span>
    </div>
  );
}

function EntrySheet({ y, typed, catOn, doneHot }: { y: number; typed: string; catOn: boolean; doneHot: boolean }) {
  const cats = [['🍱', '餐飲'], ['🚌', '交通'], ['🛍️', '購物'], ['🎮', '娛樂']];
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'];
  return (
    <div style={{ ...abs(0, y, W, 980), background: '#fff', borderRadius: '44px 44px 0 0', boxShadow: '0 -16px 40px rgba(0,0,0,0.18)', zIndex: 30 }}>
      <div style={{ ...abs(0, 14, W, 10), display: 'flex', justifyContent: 'center' }}><div style={{ width: 90, height: 10, borderRadius: 9, background: C.line }} /></div>
      <div style={{ ...abs(36, 34, W - 72, 50), fontSize: 30, fontWeight: 800 }}>
        <span style={{ background: C.expense, color: '#fff', padding: '4px 18px', borderRadius: 20 }}>支出</span>　薪轉帳戶
      </div>
      <div style={{ ...abs(36, 100, W - 72, 110), display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 34, color: C.muted, fontWeight: 700 }}>{catOn ? '🍱 餐飲' : '選分類'}</span>
        <span style={{ fontSize: 96, fontWeight: 900, color: C.expense }}>${typed}</span>
      </div>
      {cats.map(([ic, t], i) => (
        <div key={t} style={{ ...abs(24 + i * 173, 230, 155, 120), borderRadius: 26, background: catOn && i === 0 ? '#fde3e3' : C.bg, border: catOn && i === 0 ? `4px solid ${C.expense}` : '4px solid transparent',
          textAlign: 'center', paddingTop: 12, fontSize: 26, fontWeight: 700 }}>
          <div style={{ fontSize: 46 }}>{ic}</div>{t}
        </div>
      ))}
      {keys.map((k, i) => (
        <div key={k} style={{ ...abs(24 + (i % 3) * 225, 380 + Math.floor(i / 3) * 105, 212, 92), borderRadius: 22, background: C.bg, fontSize: 44, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{k}</div>
      ))}
      <div style={{ ...abs(24, 860, W - 48, 82), borderRadius: 26, background: doneHot ? '#b83333' : C.expense, color: '#fff', fontSize: 38, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>完成</div>
    </div>
  );
}

const BALLS = [['🚇', '悠遊卡', 350, '#e6f6ef'], ['📲', '電子錢包', 1500, '#e8f0ff'], ['📈', '投資', 50000, '#fff1dc'], ['🐷', '存錢', 120000, '#ffe6ee'], ['🗂️', '其他', 0, '#eeeef2']] as const;
const MiniBalls = ({ top }: { top: number }) => (
  <div style={{ ...abs(14, top, W - 28, 180), display: 'flex', justifyContent: 'space-around' }}>
    {BALLS.map(([ic, t, amt, bg]) => (
      <div key={t} style={{ textAlign: 'center', width: 130 }}>
        <div style={{ width: 100, height: 100, margin: '0 auto', borderRadius: 60, background: bg, fontSize: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.08)' }}>{ic}</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{t}</div>
        <div style={{ fontSize: 20, color: C.muted }}>{money(amt)}</div>
      </div>
    ))}
  </div>
);

/* ---------------- 五顆小帳戶球 ---------------- */
export const BALL_POPS = [8, 17, 26, 35, 44];
export function BallsScreen({ l }: { l: number }) {
  const pos = [[190, 330], [534, 330], [190, 690], [534, 690], [362, 1040]];
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <StatusBar />
      <div style={{ ...abs(40, 80, 600, 60), fontSize: 46, fontWeight: 900 }}>小帳戶</div>
      {BALLS.map(([ic, t, amt, bg], i) => {
        const s = pop(l, BALL_POPS[i], 8);
        const n = tween(l, BALL_POPS[i], BALL_POPS[i] + 20) * amt;
        return (
          <div key={t} style={{ position: 'absolute', left: pos[i][0] - 150, top: pos[i][1] - 150, width: 300, textAlign: 'center', transform: `scale(${s})` }}>
            <div style={{ width: 220, height: 220, margin: '0 auto', borderRadius: 120, background: bg, fontSize: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 24px rgba(0,0,0,0.12)' }}>{ic}</div>
            <div style={{ fontSize: 38, fontWeight: 900, marginTop: 10 }}>{t}</div>
            <div style={{ fontSize: 32, color: C.muted, fontWeight: 700 }}>{money(n)}</div>
          </div>
        );
      })}
      <div style={{ ...abs(60, 1240, W - 120, 80), borderRadius: 40, background: '#fff3d6', color: '#9a5b00', fontSize: 30, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: tween(l, 52, 60) }}>
        卡片拖到球上 ＝ 轉帳、儲值
      </div>
      <BottomNav active={0} />
    </div>
  );
}

/* ---------------- 預算與報帳 ---------------- */
export const BUDGET_T = { paid: 28, send: 56 };
export function BudgetScreen({ l }: { l: number }) {
  const T = BUDGET_T;
  const paid = l >= T.paid, sent = l >= T.send;
  const [fx, fy] = path(l, [[6, 820, 1500], [T.paid - 4, 590, 290], [T.paid + 6, 590, 290], [T.send - 4, 362, 1010], [T.send + 6, 362, 1010], [T.send + 22, 900, 1600]]);
  const press = [T.paid, T.send].some((t) => l >= t - 2 && l < t + 4) ? 1 : 0;
  const rows = [['🏠', '房租', 12000, '11/10'], ['🛡️', '保費', 3200, '11/15'], ['📱', '手機費', 599, '11/20']] as const;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <StatusBar />
      <div style={{ ...abs(40, 80, 600, 60), fontSize: 46, fontWeight: 900 }}>待辦</div>
      <div style={{ ...abs(24, 170, W - 48, 390), ...cardBox }}>
        <div style={{ padding: '18px 30px', fontSize: 32, fontWeight: 900, color: C.budget }}>🎯 預算　<span style={{ fontSize: 24, color: C.muted }}>先圈起來，付了再扣</span></div>
        {rows.map(([ic, t, amt, due], i) => {
          const done = i === 0 && paid;
          return (
            <div key={t} style={{ ...abs(20, 80 + i * 100, W - 88, 88), borderRadius: 20, background: done ? '#e3f6ec' : C.bg, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 14 }}>
              <span style={{ fontSize: 38 }}>{ic}</span>
              <span style={{ fontSize: 30, fontWeight: 800, flex: 1, lineHeight: 1.1 }}>{t}<br /><span style={{ fontSize: 20, color: C.muted }}>{due} 到期</span></span>
              <span style={{ fontSize: 30, fontWeight: 900 }}>{money(amt)}</span>
              <span style={{ width: 140, flex: '0 0 140px', textAlign: 'center', fontSize: 24, fontWeight: 800, padding: '10px 0', borderRadius: 30, color: '#fff', background: done ? C.income : C.budget,
                transform: `scale(${done ? pop(l, T.paid, 7) : 1})` }}>{done ? '✔ 已支付' : '已支付'}</span>
            </div>
          );
        })}
      </div>
      <div style={{ ...abs(24, 610, W - 48, 440), ...cardBox }}>
        <div style={{ padding: '18px 30px', fontSize: 32, fontWeight: 900, color: C.reimb }}>🧾 報帳　<span style={{ fontSize: 24, color: C.muted }}>代墊的錢不算進當月收支</span></div>
        {[['🚕', '出差計程車', 580], ['🍽️', '客戶餐敘', 1000]].map(([ic, t, amt], i) => (
          <div key={t as string} style={{ ...abs(30, 80 + i * 80, W - 108, 70), display: 'flex', alignItems: 'center', gap: 14, fontSize: 30, fontWeight: 700, borderBottom: `2px solid ${C.line}` }}>
            <span>{ic}</span><span style={{ flex: 1 }}>{t}</span><span style={{ fontWeight: 900 }}>{money(amt as number)}</span>
          </div>
        ))}
        <div style={{ ...abs(30, 250, W - 108, 60), display: 'flex', justifyContent: 'space-between', fontSize: 32, fontWeight: 900, color: C.reimb }}>
          <span>{sent ? '已送出' : '待請款'}</span><span>{money(1580)}</span>
        </div>
        <div style={{ ...abs(30, 340, W - 108, 80), borderRadius: 26, background: sent ? C.income : C.reimb, color: '#fff', fontSize: 34, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center',
          transform: `scale(${sent ? pop(l, T.send, 7) : 1})` }}>{sent ? '✔ 已送出報帳' : '送出報帳'}</div>
      </div>
      <BottomNav active={2} />
      <Finger x={fx} y={fy} press={press} opacity={tween(l, 6, 12) * (1 - tween(l, T.send + 14, T.send + 22))} />
    </div>
  );
}

/* ---------------- 桌面小工具＋載具條碼 ---------------- */
export const WIDGET_T = { show: 4, beep: 42 };
const BARS = (() => { let s = 11; const r = () => ((s = (s * 48271) % 2147483647) / 2147483647); return [...Array(64)].map(() => [1 + Math.floor(r() * 3), 1 + Math.floor(r() * 3)]); })();
export function WidgetScreen({ l }: { l: number }) {
  const s = pop(l, WIDGET_T.show, 9);
  const scan = interpolate(l, [22, WIDGET_T.beep], [0, 1], clamp);
  const flash = l >= WIDGET_T.beep && l < WIDGET_T.beep + 6;
  let x = 0;
  const apps = ['📷', '🗺️', '💬', '🎵', '☁️', '📅', '🛒', 'icon'];
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(170deg,#8fb4ff 0%,#c79bff 60%,#ffb3c7 100%)' }}>
      <StatusBar dark />
      <div style={{ ...abs(40, 120, W - 80, 470), borderRadius: 48, background: '#fff', boxShadow: '0 20px 40px rgba(60,30,120,0.3)', transform: `scale(${s})`, overflow: 'hidden' }}>
        <div style={{ ...abs(0, 0, W - 80, 250), background: flash ? '#fffbe0' : '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="520" height="140">
            {BARS.map(([w, g], i) => { const r = <rect key={i} x={x} y={0} width={w * 2.4} height={140} fill="#111" />; x += (w + g) * 2.4; return r; })}
          </svg>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 6, marginTop: 8, fontFamily: 'Consolas, monospace' }}>/AB12+3C</div>
          {l >= 22 && l < WIDGET_T.beep + 8 && <div style={{ position: 'absolute', left: 40 + scan * 560, top: 30, width: 6, height: 170, background: '#ff3b3b', boxShadow: '0 0 16px #ff3b3b' }} />}
        </div>
        <div style={{ ...abs(0, 250, W - 80, 220), borderTop: `2px dashed ${C.line}`, display: 'flex', alignItems: 'center', padding: '0 36px' }}>
          {[['剩餘可用', 62260, C.text, 54], ['今日支出', 120, C.expense, 40], ['本月支出', 18640, C.expense, 40]].map(([t, n, col, fs]) => (
            <div key={t as string} style={{ flex: (fs as number) > 50 ? 1.4 : 1 }}>
              <div style={{ fontSize: 24, color: C.muted, fontWeight: 700 }}>{t}</div>
              <div style={{ fontSize: fs as number, fontWeight: 900, color: col as string }}>{money(n as number)}</div>
            </div>
          ))}
          <Img src={staticFile('icon.png')} style={{ position: 'absolute', right: 20, top: 16, width: 54, height: 54, borderRadius: 14 }} />
        </div>
      </div>
      <div style={{ ...abs(60, 680, W - 120, 500), display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', rowGap: 40, opacity: tween(l, 10, 22) }}>
        {apps.map((a) => (
          <div key={a} style={{ textAlign: 'center', color: '#fff', fontSize: 22, fontWeight: 700 }}>
            {a === 'icon'
              ? <Img src={staticFile('icon.png')} style={{ width: 120, height: 120, borderRadius: 30, boxShadow: '0 6px 14px rgba(0,0,0,0.2)' }} />
              : <div style={{ width: 120, height: 120, margin: '0 auto', borderRadius: 30, background: 'rgba(255,255,255,0.35)', fontSize: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{a}</div>}
            {a === 'icon' && <div style={{ marginTop: 6 }}>拖拖記帳</div>}
          </div>
        ))}
      </div>
      <div style={{ ...abs(60, 1260, W - 120, 80), borderRadius: 40, background: 'rgba(255,255,255,0.9)', color: '#5b3aa8', fontSize: 30, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: tween(l, 46, 54) }}>
        結帳直接亮條碼，不用開 App
      </div>
    </div>
  );
}

/* ---------------- 統計圓環圖 ---------------- */
const SEG = [['🍱', '餐飲', 6520, '#ff8a5b'], ['🛍️', '購物', 3730, '#ffc145'], ['🏠', '居家', 3360, '#6cc3a0'], ['🚌', '交通', 2790, '#5b9bff'], ['🎮', '娛樂', 2240, '#b48cff']] as const;
const TOTAL = 18640;
export const STATS_T = { spin0: 8, spin1: 80, legend: 74, focus: 150 };
export function StatsScreen({ l }: { l: number }) {
  const T = STATS_T;
  const R = 190, SW = 120, CIRC = 2 * Math.PI * R;
  const p = tween(l, T.spin0, T.spin1 - 10, 0, 1, (x) => 1 - (1 - x) ** 3);
  const rot = -90 - 360 * (1 - tween(l, T.spin0, T.spin1, 0, 1, (x) => 1 - (1 - x) ** 3));
  const focus = pop(l, T.focus, 8);
  let acc = 0;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <StatusBar />
      <div style={{ ...abs(40, 80, 600, 60), fontSize: 46, fontWeight: 900 }}>統計 <span style={{ fontSize: 32, color: C.muted }}>11月</span></div>
      <div style={{ ...abs(W - 290, 86, 250, 56), borderRadius: 30, background: '#fff', display: 'flex', fontSize: 26, fontWeight: 800, overflow: 'hidden' }}>
        <div style={{ flex: 1, background: C.expense, color: '#fff', textAlign: 'center', lineHeight: '56px' }}>支出</div>
        <div style={{ flex: 1, textAlign: 'center', lineHeight: '56px', color: C.muted }}>收入</div>
      </div>
      <svg width={W} height="640" style={{ position: 'absolute', left: 0, top: 170 }}>
        <g transform={`translate(${W / 2},320) rotate(${rot})`}>
          <circle r={R} fill="none" stroke="#e9ebef" strokeWidth={SW} />
          {SEG.map(([, t, amt, col], i) => {
            const len = (amt / TOTAL) * CIRC;
            const start = acc; acc += len;
            const vis = Math.max(0, Math.min(len, p * CIRC - start));
            const out = i === 0 ? focus * 22 : 0;
            const mid = ((start + len / 2) / CIRC) * 2 * Math.PI;
            return (
              <circle key={t} r={R} fill="none" stroke={col} strokeWidth={SW + (i === 0 ? focus * 16 : 0)}
                strokeDasharray={`${Math.max(0, vis - 4)} ${CIRC}`} strokeDashoffset={-start}
                transform={`translate(${Math.cos(mid) * out},${Math.sin(mid) * out})`} />
            );
          })}
        </g>
      </svg>
      <div style={{ ...abs(0, 420, W, 140), textAlign: 'center' }}>
        <div style={{ fontSize: 28, color: C.muted, fontWeight: 700 }}>本月支出</div>
        <div style={{ fontSize: 50, fontWeight: 900 }}>{money(TOTAL * p)}</div>
      </div>
      {SEG.map(([ic, t, amt, col], i) => {
        const s = tween(l, T.legend + i * 7, T.legend + i * 7 + 10, 0, 1, (x) => 1 - (1 - x) ** 3);
        const hot = i === 0 && l >= T.focus;
        return (
          <div key={t} style={{ ...abs(30, 840 + i * 94, W - 60, 82), ...cardBox, borderRadius: 22, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16, fontSize: 30, fontWeight: 800,
            opacity: s, transform: `translateX(${(1 - s) * 200}px) scale(${hot ? 1 + 0.04 * focus : 1})`, border: hot ? `4px solid ${col}` : 'none' }}>
            <span style={{ width: 22, height: 22, borderRadius: 11, background: col }} />
            <span>{ic}</span><span style={{ flex: 1 }}>{t}</span>
            <span style={{ color: C.muted, fontSize: 26 }}>{Math.round((amt / TOTAL) * 100)}%</span>
            <span style={{ width: 150, textAlign: 'right' }}>{money(amt)}</span>
          </div>
        );
      })}
      <BottomNav active={3} />
    </div>
  );
}
