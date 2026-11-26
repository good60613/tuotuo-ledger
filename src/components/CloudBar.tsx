// 3.5 首頁的雲端備份提示條：授權過期、背景續不上，而且有變更還沒備份時才出現。
// 整條都能點（點了直接叫出 Google 登入）；右邊叉叉＝這次先不提醒。超過 CLOUD.staleDays 天沒備份換顯眼的顏色。
import type { CloudStatus } from '../store';
import { barState, tapSync, dismissBar } from '../cloud/sync';
import { coinSrc } from '../coins';
import { Icon } from './Icon';

export function CloudBar({ cloud }: { cloud: CloudStatus }) {
  const kind = barState(cloud);
  if (!kind) return null;
  const conflict = cloud.phase === 'error' && cloud.message?.includes('別台');
  const text = conflict ? '雲端有新資料，點我選' : kind === 'stale' ? '好久沒存了，點我備份' : '我斷線了，點我備份';
  return (
    <div class={`cloud-bar${kind === 'stale' ? ' stale' : ''}`}>
      {/* 點擊當下直接呼叫 tapSync（前面不能等別的東西，iPhone 才不會擋登入視窗） */}
      <button class="cloud-bar-main" onClick={() => void tapSync()}>
        <img class="cloud-bar-coin" src={coinSrc(kind === 'stale' ? 'shock' : 'cry')} alt="" />
        <span class="cloud-bar-text">{text}</span>
        <span class="cloud-bar-count">{cloud.pending} 筆還沒存</span>
      </button>
      <button class="cloud-bar-x" aria-label="這次先不提醒" onClick={dismissBar}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
