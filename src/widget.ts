// 桌面小工具與通知欄快捷列的資料（第七批 C 段；2.3 加上通知欄快捷列）。
//
// 小工具、通知欄都是 Android 原生程式，讀不到網頁裡的資料，所以 App 每次資料一變，就把要顯示的內容
// 算好、透過自寫的橋接（原生 LedgerWidgetPlugin）存到手機，並叫它們立刻重畫。
// - 數字一律用首頁同一組函式（spendableTotal、totals）與同一個金額格式（money），不另寫算法。
// - 載具條碼的粗細條紋也在這裡算好（code39Widths），小工具只負責畫。
// - 另外存「這是哪一天、本期到哪天結束」，原生端發現過期就顯示 0／—，提示點開更新。
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { dayKey, periodKey, periodRange, spendableTotal, totals } from './data/calc';
import { code39Widths } from './data/carrier';
import type { AppData } from './data/types';
import { money } from './format';
import { CARRIER, WIDGET } from './config';
import { notifBarOn, notifHideLockOn } from './features';
import { resolveCoin, type CoinPick } from './coins';
import { dataMood } from './quotes';

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
  /** 0 元的寫法（過期時今日支出顯示這個，格式和首頁一樣） */
  zero: string;
  /** 條碼左右要留的空白（幾條細條寬） */
  quiet: number;
  /** 這份數字是哪一天算的（YYYY-MM-DD）；小工具的「今天」不是這天 → 今日支出顯示 0 */
  day: string;
  /** 下一期第一天（YYYY-MM-DD）；小工具的「今天」到了這天 → 本月顯示「—」 */
  periodEnd: string;
  /** 載具號碼；沒設定＝空字串 */
  carrier: string;
  /** 載具條碼：條、空交錯的寬度（細＝1），以條開頭；沒設定或格式錯＝空陣列 */
  bars: number[];
  /** 2.5：角落硬幣圖示（cry/happy/shock/cool/love/note/original）；舊版原生端沒這欄就用 App 圖示 */
  coin: string;
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
    zero: money(0),
    quiet: CARRIER.quietModules,
    day: dayKey(now),
    periodEnd: dayKey(periodRange(pk, sd).end),
    carrier,
    bars: (carrier && code39Widths(carrier, CARRIER.wideRatio)) || [],
    coin: resolveCoin(d.settings.coinWidget as CoinPick | undefined, dataMood(d, now)),
  };
}

/** 通知欄快捷列（2.3）要顯示的內容 */
export interface BarSnapshot {
  v: 1;
  /** 開關（設定「通知欄快捷列」）。關＝原生端把通知收掉 */
  enabled: boolean;
  /** 鎖定畫面隱藏金額（設定，預設開） */
  hideOnLock: boolean;
  /** 剩餘可用（已格式化，和首頁、小工具同一套算法） */
  left: string;
  leftNeg: boolean;
  /** 今日支出（和小工具同一套算法） */
  todayExpense: string;
  /** 今日收入（照今日支出的邏輯算收入） */
  todayIncome: string;
  /** 0 元的寫法（跨日後今日數字顯示這個） */
  zero: string;
  /** 這份數字是哪一天算的；原生端午夜跨日時，今日支出／收入就改顯示 0 */
  day: string;
}

/** 算出通知欄快捷列要顯示的內容（純函式，測試會拿來和首頁、小工具的算法比對） */
export function barSnapshot(d: AppData, now: Date = new Date()): BarSnapshot {
  const left = spendableTotal(d, now);
  const today = totals(d, { day: dayKey(now) });
  return {
    v: 1,
    enabled: notifBarOn(d.settings),
    hideOnLock: notifHideLockOn(d.settings),
    left: money(left),
    leftNeg: left < 0,
    todayExpense: money(today.expense),
    todayIncome: money(today.income),
    zero: money(0),
    day: dayKey(now),
  };
}

/** 從通知欄、小工具點進來要去哪裡 */
export type NavTarget = 'entry' | 'todo' | 'detail' | 'search';

interface LedgerWidgetPlugin {
  update(opts: { json: string }): Promise<void>;
  /** 2.3：通知欄快捷列的內容；原生端依 enabled 決定發出或收掉通知 */
  updateBar(opts: { json: string }): Promise<void>;
  /** 2.3：Android 13 以上要向使用者要通知權限；回傳是否允許（13 以下一律允許） */
  requestNotifPermission(): Promise<{ granted: boolean }>;
  /** 2.3：App 冷啟動時，領走「從小工具、通知欄點進來」要去哪（沒有＝null） */
  takePending(): Promise<{ target: NavTarget | null }>;
  /** 2.5：換手機桌面的 App 圖示（original／cry／happy…）；部分桌面程式會把舊圖示從桌面拿掉 */
  setAppIcon(opts: { name: string }): Promise<void>;
  addListener(event: 'openNav', fn: (e: { target: NavTarget }) => void): Promise<PluginListenerHandle>;
}
const LedgerWidget = registerPlugin<LedgerWidgetPlugin>('LedgerWidget');

/** 向使用者要通知權限（只有 APK 版有）。網頁版開發時直接當作允許 */
export async function requestNotifPermission(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return true;
    return (await LedgerWidget.requestNotifPermission()).granted;
  } catch {
    return false;
  }
}

/** 是不是 APK 版（App 圖示只有 APK 版能換） */
export async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** 換手機桌面的 App 圖示；成功回傳 true（網頁版直接回 false） */
export async function setAppIcon(name: string): Promise<boolean> {
  if (!(await isNative())) return false;
  try {
    await LedgerWidget.setAppIcon({ name });
    return true;
  } catch (e) {
    console.error('換 App 圖示失敗', e);
    return false;
  }
}

/**
 * APK 版：接上小工具與通知欄快捷列。
 * - getData：讀目前資料；subscribe：資料存放處的「看門員」，資料換了就通知（記帳、修改、刪除、匯入、校正、讀檔都會經過）。
 * - App 從背景回到前景也重送一次（可能已經跨日；通知被使用者滑掉的話，這時重新發出）。
 * - 內容沒變不送；連續變動等 WIDGET.debounceMs 內沒有新變動才送。
 * - onNav：點了小工具（條碼區以外）或通知欄的按鈕時要做的事（2.3）。
 */
export async function installWidgetSync(
  getData: () => AppData | null,
  subscribe: (fn: () => void) => void,
  onNav: (target: NavTarget) => void,
) {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return;
  let last = '';
  let lastBar = '';
  let lastData: AppData | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const push = (force = false) => {
    const d = getData();
    if (!d) return;
    const json = JSON.stringify(widgetSnapshot(d));
    if (force || json !== last) {
      last = json;
      LedgerWidget.update({ json }).catch((e) => console.error('小工具更新失敗', e));
    }
    // 通知欄：開 App／回到前景（force）一律重送，使用者滑掉的通知才會重新出現
    const bar = JSON.stringify(barSnapshot(d));
    if (force || bar !== lastBar) {
      lastBar = bar;
      LedgerWidget.updateBar({ json: bar }).catch((e) => console.error('通知欄更新失敗', e));
    }
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
  await App.addListener('resume', () => push(true));
  await LedgerWidget.addListener('openNav', (e) => onNav(e.target));
  // 冷啟動時點小工具、通知欄按鈕：事件發生時網頁還沒準備好，這裡補領
  LedgerWidget.takePending().then((r) => r.target && onNav(r.target)).catch(() => {});
  push(true);
}
