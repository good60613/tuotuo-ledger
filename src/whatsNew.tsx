// 3.1 設定最下面「更新了什麼？」：只放最新一版的重點（給使用者看的白話，詳細版在 文件/更新紀錄.md）。
// 改版時把這裡換成新版的重點。
export const WHATS_NEW_VERSION = '3.1';
const POINTS = [
  '統計頁的日曆搬到最上面。',
  '有記帳的日子，日期會被圈起來，像蓋章一樣。',
  '日曆旁邊會顯示「連續記帳幾天」，還有拖拖硬幣幫你加油。',
  '匯出與匯入的說明變短了：〔從備份匯入〕改叫〔匯入備份〕，〔自動留底〕改叫〔自動存檔〕。',
  '開放原始碼授權移到設定最下面。',
];

export function WhatsNew() {
  return (
    <div class="whats-new-body">
      <h4>{WHATS_NEW_VERSION} 版</h4>
      <ul>{POINTS.map((p) => <li key={p}>{p}</li>)}</ul>
    </div>
  );
}
