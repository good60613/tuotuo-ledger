// 帳戶圖示：圖示模式＝淡底圓角方塊＋圖示；徽章模式＝主色圓＋名稱第一個字。尺寸在 config.ts 的 ACCOUNT_ICON。
import type { Account } from '../data/types';
import { accountIconOf, accountIconStyleOf } from '../categoryStyle';
import { ACCOUNT_ICON } from '../config';
import { Icon } from './Icon';

export function AccountIcon({ account, class: cls }: { account: Pick<Account, 'name' | 'kind' | 'icon' | 'iconStyle'>; class?: string }) {
  const badge = accountIconStyleOf(account) === 'badge';
  const size = { width: `${ACCOUNT_ICON.boxPx}px`, height: `${ACCOUNT_ICON.boxPx}px` };
  if (badge) {
    return (
      <span class={`acc-icon badge${cls ? ' ' + cls : ''}`} style={{ ...size, fontSize: `${ACCOUNT_ICON.badgeFontPx}px` }} aria-hidden="true">
        {Array.from(account.name.trim())[0] ?? ''}
      </span>
    );
  }
  return (
    <span class={`acc-icon${cls ? ' ' + cls : ''}`} style={{ ...size, borderRadius: `${ACCOUNT_ICON.radiusPx}px` }} aria-hidden="true">
      <Icon name={accountIconOf(account)} size={ACCOUNT_ICON.iconPx} />
    </span>
  );
}
