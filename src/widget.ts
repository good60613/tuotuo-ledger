// 桌面小工具的資料（第七批 C 段）。
//
// 小工具是 Android 原生程式，讀不到網頁裡的資料，所以 App 每次資料一變，就把小工具要顯示的內容
// 算好、透過自寫的橋接（原生 LedgerWidgetPlugin）存到手機，並叫小工具立刻重畫。
// - 數字一律用首頁同一組函式（spendableTotal、totals）與同一個金額格式（money），不另寫算法。
// - 載具條碼的粗細條紋也在這裡算好（code39Widths），小工具只負責畫。
// - 另外存「這是哪一天、本期到哪天結束」，小工具發現過期就顯示 0／—，提示點開更新。
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { dayKey, periodKey, periodRange, spendableTotal, totals } from './data/calc';
import { code39Widths } from './data/carrier';
import type { AppData } from './data/types';
import { money } from './format';
import { CARRIER, WIDGET } from './config';

export interface WidgetSnapshot {
  /** 資料格式版本（原生端看到不認識的版本就顯示「點開更新」） */
  v: 1;
  /** 剩餘可用（已格式化，和首頁一樣） */
  left: string;
  /** 剩餘可用是否為負數（小工具用紅色） */
  leftNeg: boolean;
  /** 今日支出（已格式化） */
  todayExpense: string;
  /** 本期支出（已格式化） */
  monthExpense: string;
  /** 這份數字是哪一天算的（YYYY-MM-DD）；小工具的「今天」不是這天 → 今日支出顯示 0 */
  day: string;
  /** 下一期第一天（YYYY-MM-DD）；小工具的「今天」到了這天 → 本月顯示「—」 */
  periodEnd: string;
  /** 載具號碼；沒設定＝空字串 */
  carrier: string;
  /** 載具條碼：條、空交錯的寬度（細＝1），以條開頭；沒設定或格式錯＝空陣列 */
  bars: number[];
}

/** 算出小工具要顯示的內容（純函式，測試會拿來和首頁的算法比對） */
export function widgetSnapshot(d: AppData, now: Date = new Date()): WidgetSnapshot {
  const sd = d.settings.settleDay;
  const pk = periodKey(now, sd);
  const left = spendableTotal(d);
  const carrier = d.settings.carrierCode ?? '';
  return {
    v: 1,
    left: money(left),
    leftNeg: left < 0,
    todayExpense: money(totals(d, { day: dayKey(now) }).expense),
    monthExpense: money(totals(d, { period: pk }).expense),
    day: dayKey(now),
    periodEnd: dayKey(periodRange(pk, sd).end),
    carrier,
    bars: (carrier && code39Widths(carrier, CARRIER.wideRatio)) || [],
  };
}

interface LedgerWidgetPlugin {
  update(opts: { json: string }): Promise<void>;
  addListener(event: 'openHome', fn: () => void): Promise<PluginListenerHandle>;
}
const LedgerWidget = registerPlugin<LedgerWidgetPlugin>('LedgerWidget');

/**
 * APK 版：接上小工具。
 * - getData：讀目前資料；subscribe：資料存放處的「看門員」，資料換了就通知（記帳、修改、刪除、匯入、校正、讀檔都會經過）。
 * - App 從背景回到前景也重送一次（可能已經跨日）。
 * - 內容沒變不送；連續變動等 WIDGET.debounceMs 內沒有新變動才送。
 * - onOpenHome：點了小工具時要做的事（回首頁）。
 */
export async function installWidgetSync(
  getData: () => AppData | null,
  subscribe: (fn: () => void) => void,
  onOpenHome: () => void,
) {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return;
  let last = '';
  let lastData: AppData | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const push = (force = false) => {
    const d = getData();
    if (!d) return;
    const json = JSON.stringify(widgetSnapshot(d));
    if (!force && json === last) return;
    last = json;
    LedgerWidget.update({ json }).catch((e) => console.error('小工具更新失敗', e));
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => push(), WIDGET.debounceMs);
  };
  subscribe(() => {
    const d = getData();
    if (d && d !== lastData) {
      lastData = d;
      schedule();
    }
  });
  const { App } = await import('@capacitor/app');
  await App.addListener('resume', () => push());
  await LedgerWidget.addListener('openHome', onOpenHome);
  push(true);
}
