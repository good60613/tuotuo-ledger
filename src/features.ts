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
