// 3.0 宣傳片：把 PK 一次錄完的真機錄影（public/rec.mp4，720×1600）剪成五段，放進 1080×1920 直式畫面。
// - 裁掉最上面的狀態列（錄影計時、通知圖示）。
// - 跳過記帳頁打備註時跳出的鍵盤（鍵盤背景是個人照片）。
// - 分享選單的「最近分享對象」那一排（聯絡人名字、大頭貼）整排模糊。
// - 錄影本身的聲音不用（靜音），配音與字幕由 PK 在剪映加。
import React from 'react';
import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, Easing } from 'remotion';
import { C } from './parts';

export const FPS = 30;
const SRC_W = 720;
const SRC_H = 1600;
/** 狀態列高度（原始像素） */
const STATUS = 72;
/** 手機畫面在成品裡的高度、上緣位置（上面留給剪映的大字幕） */
const PHONE_H = 1680;
const PHONE_TOP = 200;
/** 放大時的中心高度（裁掉狀態列後的原始像素）：首頁剩餘可用大卡片 */
const ZOOM_Y = 40;
/** 放大中心的左右位置：偏左，讓「剩餘可用」和「平均／日」都在畫面裡 */
const ZOOM_X = 120;

type Blur = { from: number; to: number; y1: number; y2: number };
interface Piece { from: number; to: number; rate: number }
interface Seg { name: string; pieces: Piece[]; zoom?: boolean; blurs?: Blur[] }

/** 剪接表：秒數是原始錄影的時間 */
export const SEGS: Seg[] = [
  { name: '記帳', pieces: [{ from: 8.6, to: 17.3, rate: 1.5 }, { from: 21.3, to: 24.6, rate: 1.5 }] },
  { name: '轉帳', pieces: [{ from: 37.4, to: 43.3, rate: 1.5 }, { from: 47.2, to: 49.2, rate: 1.5 }] },
  { name: '剩餘可用', pieces: [{ from: 53, to: 57, rate: 1 }], zoom: true },
  {
    name: '匯入',
    pieces: [{ from: 68.5, to: 80.4, rate: 1.5 }],
    // 分享選單滑上來的途中先把下半部全部模糊，停好之後只模糊聯絡人那一排
    blurs: [
      { from: 71.0, to: 71.5, y1: 950, y2: 1600 },
      { from: 71.5, to: 80.4, y1: 1030, y2: 1300 },
    ],
  },
  { name: '教學', pieces: [{ from: 96.8, to: 104.5, rate: 1.2 }] },
];

const pieceFrames = (p: Piece) => Math.round(((p.to - p.from) / p.rate) * FPS);
export const segFrames = (s: Seg) => s.pieces.reduce((n, p) => n + pieceFrames(p), 0);
export const CUTS_FRAMES = SEGS.reduce((n, s) => n + segFrames(s), 0);

/** 一小段錄影（含模糊層）；畫面座標用原始像素，外層再整體縮放 */
const Piece: React.FC<{ p: Piece; blurs?: Blur[] }> = ({ p, blurs }) => {
  const f = useCurrentFrame();
  const srcT = p.from + (f / FPS) * p.rate;
  const blur = blurs?.find((b) => srcT >= b.from && srcT < b.to);
  const video = (style?: React.CSSProperties) => (
    <OffthreadVideo src={staticFile('rec.mp4')} startFrom={Math.round(p.from * FPS)} playbackRate={p.rate} muted style={{ position: 'absolute', left: 0, top: -STATUS, width: SRC_W, height: SRC_H, ...style }} />
  );
  return (
    <>
      {video()}
      {blur && (
        <>
          {video({ filter: 'blur(28px)', clipPath: `inset(${blur.y1}px 0 ${SRC_H - blur.y2}px 0)` })}
          <div style={{ position: 'absolute', left: 0, right: 0, top: blur.y1 - STATUS, height: blur.y2 - blur.y1, background: 'rgba(40,40,40,.35)' }} />
        </>
      )}
    </>
  );
};

/** 一段：依序播放各小段，外面包手機框；剩餘可用那段慢慢放大到首頁大卡片 */
const Segment: React.FC<{ s: Seg }> = ({ s }) => {
  const f = useCurrentFrame();
  const k = PHONE_H / (SRC_H - STATUS);
  const zoom = s.zoom ? interpolate(f, [8, 40], [1, 1.45], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) }) : 1;
  let at = 0;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(${C.peach1}, ${C.peach2})` }}>
      <div
        style={{
          position: 'absolute', left: (1080 - SRC_W * k) / 2, top: PHONE_TOP, width: SRC_W * k, height: PHONE_H,
          borderRadius: 44, overflow: 'hidden', boxShadow: '0 24px 60px rgba(107,58,18,.28)', background: '#fff',
        }}
      >
        <div style={{ position: 'absolute', left: 0, top: 0, width: SRC_W, height: SRC_H - STATUS, transform: `scale(${k})`, transformOrigin: '0 0' }}>
        {/* 放大以首頁大卡片（剩餘可用、平均／日）為中心 */}
        <div style={{ position: 'absolute', inset: 0, transform: `scale(${zoom})`, transformOrigin: `${ZOOM_X}px ${ZOOM_Y}px` }}>
          {s.pieces.map((p, i) => {
            const from = at;
            at += pieceFrames(p);
            return (
              <Sequence key={i} from={from} durationInFrames={pieceFrames(p)} layout="none">
                <Piece p={p} blurs={s.blurs} />
              </Sequence>
            );
          })}
        </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** 五段接在一起（沒有片頭片尾）：各段可以用 --frames 單獨輸出 */
export const Cuts: React.FC = () => {
  let at = 0;
  return (
    <AbsoluteFill>
      {SEGS.map((s) => {
        const from = at;
        at += segFrames(s);
        return (
          <Sequence key={s.name} from={from} durationInFrames={segFrames(s)}>
            <Segment s={s} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

/** 初剪：片頭 3 秒＋五段＋片尾 3 秒（片頭片尾有音效，錄影靜音） */
export const Draft: React.FC = () => (
  <AbsoluteFill style={{ background: '#000' }}>
    <Sequence durationInFrames={90}>
      <OffthreadVideo src={staticFile('intro.mp4')} />
    </Sequence>
    <Sequence from={90} durationInFrames={CUTS_FRAMES}>
      <Cuts />
    </Sequence>
    <Sequence from={90 + CUTS_FRAMES} durationInFrames={90}>
      <OffthreadVideo src={staticFile('outro.mp4')} />
    </Sequence>
  </AbsoluteFill>
);
