// 3.5 網頁版（給 iPhone 朋友「加入主畫面」用）：註冊離線快取（public/sw.js），沒網路也打得開。
// APK 版不需要（檔案本來就在手機裡），開發模式也不註冊（免得快取住舊程式）。
import { Capacitor } from '@capacitor/core';

export function registerWebApp() {
  if (Capacitor.isNativePlatform() || import.meta.env.DEV) return;
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('離線快取註冊失敗', e));
  });
}

/** 是不是從 iPhone／Android 主畫面打開的（不是在瀏覽器分頁裡） */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}
