// 3.3 目前安裝的版本號：設定頁最下面「顯示版本號」與更新檢查共用這一個來源。
// APK 版讀 Android 的 versionName（android/app/build.gradle）；網頁版（開發用）沒有版本號，回傳 null。
export async function getAppVersion(): Promise<string | null> {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return null;
  const { App } = await import('@capacitor/app');
  const info = await App.getInfo();
  return info.version || null;
}
