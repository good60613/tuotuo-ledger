// 功能開關集中在這裡。之後若改成付費功能，只要改這個檔案的判斷條件。
import type { Settings } from './data/types';

/** 我先付／朋友付功能是否開啟（缺值＝開啟）。關掉只影響「能不能新記」，已存在的照常顯示與計算 */
/**
 * 定期扣款是否開啟（缺值＝開啟）。關掉時：不自動記帳、不動帳戶、剩餘可用不預留；
 * 重新打開時，關閉期間錯過的月份不補記（保守，見 recurring.ts 的 setRecurringEnabled）。
 */
export function recurringOn(settings: Pick<Settings, 'recurringEnabled'> | undefined): boolean {
  return settings?.recurringEnabled !== false;
}

export function advanceOwedOn(settings: Pick<Settings, 'advanceOwedEnabled'> | undefined): boolean {
  return settings?.advanceOwedEnabled !== false;
}

/** 毛玻璃效果是否開啟（缺值＝開啟）。關掉時毛玻璃元素改成實心 */
export function glassOn(settings: Pick<Settings, 'glass'> | undefined): boolean {
  return settings?.glass !== false;
}

/** 明細是否顯示「記帳前餘額」（2.3，缺值＝開啟） */
export function prevBalanceOn(settings: Pick<Settings, 'showPrevBalance'> | undefined): boolean {
  return settings?.showPrevBalance !== false;
}

/** 通知欄快捷列是否開啟（2.3，缺值＝關閉） */
export function notifBarOn(settings: Pick<Settings, 'notifBar'> | undefined): boolean {
  return settings?.notifBar === true;
}

/** 鎖定畫面是否隱藏通知欄上的金額（2.3，缺值＝隱藏） */
export function notifHideLockOn(settings: Pick<Settings, 'notifHideOnLock'> | undefined): boolean {
  return settings?.notifHideOnLock !== false;
}

/** 首頁是否用明細頁（2.2，缺值＝帳戶頁） */
export function detailHome(settings: Pick<Settings, 'homePage'> | undefined): boolean {
  return settings?.homePage === 'detail';
}
