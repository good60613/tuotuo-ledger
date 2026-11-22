// 設定最下面「更新了什麼？」：只放最新一版的重點（給使用者看的白話，詳細版在 文件/更新紀錄.md）。
// 改版時把這裡換成新版的重點。
export const WHATS_NEW_VERSION = '3.3';
const POINTS = [
  '新增五種外觀風格：預設（原本的樣子）、簡約扁平、手帳紙本、像素復古、Liquid Glass，到設定的「外觀」選。亮色、暗色照樣能搭配。',
  '換頁、開子畫面、跳出選單和對話框，現在進場與離場都有動畫，各風格的動作手感也不一樣。',
  '打開 App 會先看到拖拖硬幣的開啟動畫。',
  'App 會自動檢查有沒有新版本，有的話提醒你下載。設定裡可以關掉，也能按〔現在檢查〕。',
];

export function WhatsNew() {
  return (
    <div class="whats-new-body">
      <h4>{WHATS_NEW_VERSION} 版</h4>
      <ul>{POINTS.map((p) => <li key={p}>{p}</li>)}</ul>
    </div>
  );
}
