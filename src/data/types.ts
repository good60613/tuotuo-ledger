// 資料型別：欄位照「施工工單.md」的〈資料結構與計算規則〉。

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
   * 預留：同一顆球底下可以有多個帳戶（電子錢包、「其他」都是）。
   * 之後「其他」底下的子項目（例如預算、預留款）用這個欄位分種類。試玩版不使用。
   */
  subtype?: string;
  /**
   * 預留給小帳戶之後的「小記帳」與特殊功能（下一批再設計）。
   * 試玩版不使用，但匯出/匯入會原樣保留。
   */
  extra?: Record<string, unknown>;
}

export type TxType = 'expense' | 'income' | 'transfer' | 'reimburse_in';

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
   * 預留：之後小帳戶「小記帳」可用來區分來源畫面（例如 'easycard-ride'）。
   * 試玩版不使用。
   */
  source?: string;
  createdAt: string;
}

export type CategoryType = 'expense' | 'income';

export interface Category {
  id: string;
  type: CategoryType;
  name: string;
  /** 試玩版圖示用一個字或 emoji，視覺風格之後再談 */
  icon: string;
  order: number;
}

export interface NoteTag {
  id: string;
  text: string;
  order: number;
}

export interface Settings {
  /** 預設報帳帳戶；null＝不設定 */
  defaultReimburseAccountId: string | null;
  /** 明細頁選「全部」時，快速記帳用上次使用的帳戶 */
  lastUsedAccountId: string | null;
}

export interface AppData {
  version: 1;
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  noteTags: NoteTag[];
  settings: Settings;
}
