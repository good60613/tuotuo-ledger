// 用程式算出聲波，產生短音效 WAV（不使用任何外部音檔）。輸出到 public/sfx/
import { mkdirSync, writeFileSync } from 'node:fs';
const SR = 44100;
const out = new URL('../public/sfx/', import.meta.url);
mkdirSync(out, { recursive: true });

function wav(name, samples) {
  const n = samples.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32000), 44 + i * 2);
  writeFileSync(new URL(name + '.wav', out), buf);
}
// 產生一段聲音：f(t, 秒) 回傳 -1~1
function make(sec, f) { const a = new Float32Array(Math.round(sec * SR)); for (let i = 0; i < a.length; i++) a[i] = f(i / SR, sec); return a; }
// 依瞬時頻率積分出相位，做滑音
function sweep(sec, freqAt, envAt, shape = Math.sin) {
  let ph = 0; return make(sec, (t) => { ph += 2 * Math.PI * freqAt(t) / SR; return shape(ph) * envAt(t); });
}
const fadeIn = (t, a = 0.004) => Math.min(1, t / a);
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

// 點：短促的木質點擊
wav('tap', make(0.07, (t) => fadeIn(t, 0.001) * Math.exp(-t * 70) * (Math.sin(2 * Math.PI * 1700 * t) * 0.7 + Math.sin(2 * Math.PI * 3400 * t) * 0.2)));
// 小點：很輕的滴答
wav('tick', make(0.04, (t) => fadeIn(t, 0.001) * Math.exp(-t * 140) * Math.sin(2 * Math.PI * 3000 * t) * 0.6));
// 啵：往上滑的泡泡音，五個音高（給五顆球用，Do Re Mi Sol La）
[523, 587, 659, 784, 880].forEach((f0, i) =>
  wav('pop' + (i + 1), sweep(0.12, (t) => f0 * (0.7 + 0.6 * Math.min(1, t / 0.05)), (t) => fadeIn(t) * Math.exp(-t * 28) * 0.8)));
wav('pop', sweep(0.12, (t) => 450 + 600 * Math.min(1, t / 0.05), (t) => fadeIn(t) * Math.exp(-t * 28) * 0.8));
// 咚：放下卡片的低音
wav('thud', sweep(0.18, (t) => 180 - 90 * Math.min(1, t / 0.12), (t) => fadeIn(t, 0.002) * Math.exp(-t * 22) * 0.9));
// 彈跳：金幣跳起來（滑音＋抖音）
wav('boing', sweep(0.32, (t) => (200 + 420 * Math.min(1, t / 0.18)) * (1 + 0.06 * Math.sin(2 * Math.PI * 28 * t)), (t) => fadeIn(t) * Math.exp(-t * 9) * 0.7));
// 捏一下：吱
wav('squeak', sweep(0.2, (t) => 1100 + 500 * Math.sin(Math.PI * t / 0.2) - 600 * (t / 0.2), (t) => fadeIn(t) * Math.sin(Math.PI * t / 0.2) * 0.45));
// 嗚：往下掉的哭音，三個音高
[620, 560, 500].forEach((f0, i) =>
  wav('sob' + (i + 1), sweep(0.24, (t) => f0 * (1 - 0.25 * t / 0.24) * (1 + 0.04 * Math.sin(2 * Math.PI * 9 * t)), (t) => fadeIn(t, 0.02) * Math.sin(Math.PI * t / 0.24) * 0.5,
    (p) => Math.sin(p) * 0.8 + Math.sin(2 * p) * 0.2)));
// 咻：白噪音經過會移動的濾波器
{ let lp = 0; wav('whoosh', make(0.35, (t, s) => { const k = 0.04 + 0.35 * Math.sin(Math.PI * t / s); lp += k * (rnd() - lp); return lp * Math.sin(Math.PI * t / s) ** 2 * 1.6; })); }
// 叮：鈴聲（基音＋泛音，慢慢消失）
const bell = (f, sec = 0.9, v = 0.55) => make(sec, (t) => fadeIn(t, 0.002) * Math.exp(-t * 5) * v * (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * f * 2.01 * t) * Math.exp(-t * 6) + 0.15 * Math.sin(2 * Math.PI * f * 3.02 * t) * Math.exp(-t * 10)));
wav('ding', bell(1318));
// 結尾和弦：Do Mi Sol 依序響起
{ const notes = [1047, 1319, 1568, 2093], s = make(1.6, () => 0);
  notes.forEach((f, i) => { const b = bell(f, 1.6 - i * 0.09, 0.32); const off = Math.round(i * 0.09 * SR); for (let j = 0; j < b.length && off + j < s.length; j++) s[off + j] += b[j]; });
  wav('chime', s); }
// 嗶：掃描條碼
wav('beep', make(0.14, (t, s) => (t < s - 0.01 ? 1 : (s - t) / 0.01) * fadeIn(t, 0.003) * 0.3 * Math.sign(Math.sin(2 * Math.PI * 2400 * t))));
// 上升音：圓環圖轉一圈
wav('rise', sweep(1.2, (t) => 300 + 700 * (t / 1.2) ** 1.5, (t) => fadeIn(t, 0.05) * Math.sin(Math.PI * t / 1.2) * 0.25, (p) => Math.sin(p) + 0.3 * Math.sin(3 * p)));
// 閃亮：結尾小星星
{ const s = make(0.5, () => 0); [2637, 3136, 3520, 4186].forEach((f, i) => { const off = Math.round(i * 0.06 * SR); for (let j = 0; off + j < s.length; j++) { const t = j / SR; s[off + j] += Math.exp(-t * 18) * Math.sin(2 * Math.PI * f * t) * 0.2; } }); wav('sparkle', s); }
console.log('音效完成');
