// 2.5 拖拖硬幣：六種表情＋原版（粉底哭哭）。首頁小語旁的圖示、桌面小工具、手機桌面 App 圖示都從這裡選。
// 原圖放在 素材/拖拖硬幣/；這裡用的是縮小版（src/assets/coins/），Android 那邊另有 coin_*.png、ic_fg_*.png。
import original from './assets/logo.png';
import cry from './assets/coins/cry.png';
import happy from './assets/coins/happy.png';
import shock from './assets/coins/shock.png';
import cool from './assets/coins/cool.png';
import love from './assets/coins/love.png';
import note from './assets/coins/note.png';

/** 六種表情（小語會依情境挑一種） */
export type Mood = 'cry' | 'happy' | 'shock' | 'cool' | 'love' | 'note';
/** 可以固定選的圖：六種表情＋原版 */
export type CoinId = Mood | 'original';
/** 首頁圖示、小工具的設定：auto＝跟著心情換 */
export type CoinPick = 'auto' | CoinId;

export const COINS: { id: CoinId; label: string; src: string }[] = [
  { id: 'original', label: '原版', src: original },
  { id: 'cry', label: '哭哭', src: cry },
  { id: 'happy', label: '開心', src: happy },
  { id: 'shock', label: '嚇到', src: shock },
  { id: 'cool', label: '比讚', src: cool },
  { id: 'love', label: '愛心', src: love },
  { id: 'note', label: '記帳', src: note },
];

export const coinSrc = (id: CoinId) => (COINS.find((c) => c.id === id) ?? COINS[0]).src;
export const coinLabel = (id: CoinId) => (COINS.find((c) => c.id === id) ?? COINS[0]).label;

/** 依設定決定要顯示哪一張：auto（預設）＝跟著心情 */
export const resolveCoin = (pick: CoinPick | undefined, mood: Mood): CoinId => (!pick || pick === 'auto' ? mood : pick);
