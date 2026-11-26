// 設定最下面「更新了什麼？」：只放最新一版的重點（給使用者看的白話，詳細版在 文件/更新紀錄.md）。
// 改版時把這裡換成新版的重點。
export const WHATS_NEW_VERSION = '3.4';
const POINTS = [
  '定期扣款搬到待辦頁正中間的「扣款」，不用再進設定找。',
  '定期扣款可以選每週、每月、每年扣。',
  '每一項可以記下「在哪取消」和備註（例如取消網址），要退訂時一眼就知道。',
  '自動記帳改成扣款日過完的隔天才記，時間寫扣款日的 23:59。',
];

export function WhatsNew() {
  return (
    <div class="whats-new-body">
      <h4>{WHATS_NEW_VERSION} 版</h4>
      <ul>{POINTS.map((p) => <li key={p}>{p}</li>)}</ul>
    </div>
  );
}
