// 功能開關集中在這裡。之後若改成付費功能，只要改這個檔案的判斷條件。
import type { Settings } from './data/types';

/** 代墊／借我功能是否開啟（缺值＝開啟）。關掉只影響「能不能新記」，已存在的照常顯示與計算 */
export function advanceOwedOn(settings: Pick<Settings, 'advanceOwedEnabled'> | undefined): boolean {
  return settings?.advanceOwedEnabled !== false;
}
