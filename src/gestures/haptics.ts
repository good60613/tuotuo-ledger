// 震動。網頁版用瀏覽器的震動功能（Android 有效，iPhone 瀏覽器不支援）。
// 之後包 APK 時改成 Capacitor Haptics，只要改這個檔案。
export function vibrate(ms: number) {
  if (ms <= 0) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* 不支援就略過 */
  }
}
