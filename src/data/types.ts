// 資料型別：欄位照「工單/施工工單.md」的〈資料結構與計算規則〉。
import type { CategoryColorKey } from '../categoryStyle';

/** bank＝一般帳戶（首頁卡片）；其餘為五顆小帳戶球的類型 */
export type AccountKind = 'bank' | 'easycard' | 'ewallet' | 'invest' | 'saving' | 'other';

export const SMALL_KINDS: AccountKind[] = ['easycard', 'ewallet', 'invest', 'saving', 'other'];

export const KIND_LABEL: Record<AccountKind, string> = {
  bank: '一般帳戶',
  easycard: '悠遊卡',
  ewallet: '電子錢包',
  invest: '投資',
  saving: '儲蓄',
  other: '其他',
};

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  initialBalance: number;
  order: number;
  /**
   * 同一顆球底下可以有多個帳戶（電子錢包、投資、儲蓄、「其他」都是）。
   * 投資：'cash'＝待投入（固定一個）、'holding'＝標的（例如 0050）。
   * 之後「其他」底下的子項目也用這個欄位分種類。
   */
  subtype?: string;
  /** 儲蓄目標的目標金額（只有 kind='saving' 使用）。儲蓄目標 order 越大越下面（越必要） */
  target?: number;
  /**
   * 預留給小帳戶之後的「小記帳」與特殊功能（下一批再設計）。
   * 試玩版不使用，但匯出/匯入會原樣保留。
   */
  extra?: Record<string, unknown>;
}

/**
 * adjust＝校正產生的「調整」（只影響餘額，不算收支）；
 * valuation＝投資標的「更新市值」（amount＝現值，不影響任何帳戶餘額）。
 */
export type TxType = 'expense' | 'income' | 'transfer' | 'reimburse_in' | 'adjust' | 'valuation';

export interface Transaction {
  id: string;
  type: TxType;
  /** 金額，一律正整數（元） */
  amount: number;
  /** 支出、收入的帳戶；轉帳的來源 */
  accountId: string;
  /** 轉帳的目的；報帳入帳的帳戶 */
  toAccountId?: string;
  categoryId?: string;
  note: string;
  /** ISO 字串 */
  occurredAt: string;
  reimbursable: boolean;
  reimburseStatus?: 'pending' | 'done';
  reimburseBatchId?: string;
  /**
   * 預算（第四批，v4）：只有一般帳戶的支出可以是預算。
   * 預算紀錄本身不扣帳戶、不算當月支出，但「剩餘可用」要扣掉未付的預算。
   * 按「已支付」時另外新增一筆真正的支出（budgetOfId 指回預算），預算改成 paid。
   */
  budget?: boolean;
  budgetStatus?: 'pending' | 'paid';
  /** 預算紀錄：付款時新增的那筆真正支出 */
  budgetPaidTxId?: string;
  /** 真正支出：是哪一筆預算付的款 */
  budgetOfId?: string;
  /** 調整紀錄的方向：up＝實際比帳上多，down＝實際比帳上少 */
  adjustDir?: 'up' | 'down';
  /**
   * 來源畫面標記。投資：'invest-buy'、'invest-sell'、'invest-dividend'、'invest-fee'；
   * 儲蓄：'saving-in'、'saving-out'、'saving-interest'。
   * 配息、費用、利息不需要分類（見 TX_SOURCE_NO_CATEGORY）。
   */
  source?: string;
  createdAt: string;
}

export type CategoryType = 'expense' | 'income';

export interface Category {
  id: string;
  type: CategoryType;
  name: string;
  /** 圖示：只能從 categoryStyle.ts 的圖示選單選 */
  icon: string;
  /** 顏色標籤（只是視覺標記，不影響統計）；舊資料沒有時為「其他」灰色 */
  color: CategoryColorKey;
  order: number;
}

/**
 * 備註的設定資料（記憶模式）。備註清單本身從紀錄推算，這裡只存「釘選」與「刪除」，
 * 以及第一批手動加過、還沒用過的常用標籤。
 */
export interface NoteTag {
  id: string;
  text: string;
  /** 釘選之間的排序 */
  order: number;
  /** 加星星＝釘選：所有分類都看得到，排在 5 格最前面 */
  pinned: boolean;
  /** 從清單刪除的時間；之後若又用到這個備註，會重新出現 */
  hiddenAt?: string;
}

export interface Settings {
  /** 預設報帳帳戶；null＝不設定 */
  defaultReimburseAccountId: string | null;
  /** 明細頁選「全部」時，快速記帳用上次使用的帳戶 */
  lastUsedAccountId: string | null;
  /** 結算日（每月幾號開始新的一期），預設 1。該月沒有這天時用該月最後一天 */
  settleDay: number;
  /** 分類自動排序：開啟時依最近 90 天使用次數排序，預設關閉 */
  autoSortCategories: boolean;
}

export interface AppData {
  version: 4;
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  noteTags: NoteTag[];
  settings: Settings;
}

export const DATA_VERSION = 4;

/** 不需要分類的紀錄來源（投資配息、費用、儲蓄利息） */
export const TX_SOURCE_NO_CATEGORY = ['invest-dividend', 'invest-fee', 'saving-interest'];
