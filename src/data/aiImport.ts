// 3.0 從其他軟體匯入：交給使用者自己的 AI（ChatGPT、Gemini、Claude…）轉成拖拖記帳的完整備份檔。
// - 這裡放：給 AI 的提示詞、格式說明（AI 看的）、匯入前的檢查、匯入前的預覽摘要。
// - 檢查也套用在一般的「匯入備份」：自己 App 匯出的備份一定過得了；過不了的是 AI 做錯，
//   錯誤訊息寫成可以直接貼回去給 AI 修正的句子。
import type { AppData, Transaction } from './types';
import { DATA_VERSION, KIND_LABEL } from './types';
import { CATEGORY_COLORS } from '../categoryStyle';
import { BACKUP_FILE_VERSION } from './backup';
import { allBalances, spendableTotal } from './calc';
import { money } from '../format';

export const AI_PROMPT = `我要把記帳資料從舊的記帳 App 搬到「拖拖記帳」。
我附上了：
1. 舊 App 匯出的檔案
2.「拖拖記帳-格式說明.md」：拖拖記帳備份檔的格式規則
3.「拖拖記帳-範本.json」：拖拖記帳的範本檔（裡面有我目前的分類和設定）

請照「格式說明」把舊資料轉成一個拖拖記帳的完整備份檔（.json），要求：
- 每個帳戶最後的餘額，要跟舊 App 現在顯示的餘額一樣（格式說明第 4 點有算法）
- 舊資料裡看不懂、或不知道該怎麼對應的地方，先列出來問我，不要自己猜
- 做好後給我可以下載的 .json 檔，並列出：每個帳戶的最後餘額、總共幾筆紀錄、最早和最晚的日期，讓我核對
- 如果我之後貼給你錯誤訊息，請照訊息修正後重新給我檔案`;

const COLOR_KEYS = CATEGORY_COLORS.map((c) => `${c.key}（${c.label}）`).join('、');

/** 給 AI 看的格式說明（存成 .md 一起分享出去） */
export function formatDoc(): string {
  return `# 拖拖記帳 備份檔格式說明（給 AI 看）

把舊記帳 App 的資料轉成下面這個格式，存成一個 .json 檔。使用者會用拖拖記帳的「匯入備份」匯入，匯入前 App 會檢查格式並顯示各帳戶餘額讓使用者核對。

## 1. 外層

\`\`\`json
{
  "app": "ledger-app",
  "type": "full",
  "fileVersion": ${BACKUP_FILE_VERSION},
  "exportedAt": "2026-11-21T05:00:00.000Z",
  "data": {
    "version": ${DATA_VERSION},
    "accounts": [],
    "transactions": [],
    "categories": [],
    "noteTags": [],
    "recurring": [],
    "settings": {}
  }
}
\`\`\`

- 以附上的「拖拖記帳-範本.json」為底：categories、noteTags、settings 照範本保留，只需要填 accounts 和 transactions，必要時新增分類。
- recurring（定期扣款）留空陣列 []。

## 2. 帳戶 accounts

\`\`\`json
{ "id": "a-1", "name": "薪轉帳戶", "kind": "bank", "initialBalance": 12000, "order": 0 }
\`\`\`

- id：不重複的字串。name：帳戶名稱。order：同一種類裡的排序，從 0 開始。
- kind（種類）只能是：
  - "bank"：一般帳戶（銀行、現金、信用卡都用這個）。會顯示在首頁卡片，算進「剩餘可用」。
  - "easycard"：${KIND_LABEL.easycard}
  - "ewallet"：${KIND_LABEL.ewallet}（LINE Pay、街口…）
  - "invest"：${KIND_LABEL.invest}。要加 "subtype"："cash"＝待投入的錢（固定一個）、"holding"＝投資標的（例如 0050）
  - "saving"：${KIND_LABEL.saving}目標，可加 "target"（目標金額）
  - "other"：${KIND_LABEL.other}
- 範本裡已經有悠遊卡、電子錢包、待投入、儲蓄、其他各一個帳戶，請保留（可以改名、改金額）。
- 信用卡用 "bank"，餘額是負數（欠款）。
- initialBalance：開始記帳那天之前的餘額，整數（元），可以是負數。算法見第 4 點。

## 3. 紀錄 transactions

只用這三種 type：

\`\`\`json
{ "id": "t-1", "type": "expense", "amount": 120, "accountId": "a-1", "categoryId": "c-e1", "note": "便當", "occurredAt": "2026-11-20T04:10:00.000Z", "createdAt": "2026-11-20T04:10:00.000Z", "reimbursable": false }
{ "id": "t-2", "type": "income", "amount": 35000, "accountId": "a-1", "categoryId": "c-i0", "note": "11 月薪水", "occurredAt": "2026-11-05T01:00:00.000Z", "createdAt": "2026-11-05T01:00:00.000Z", "reimbursable": false }
{ "id": "t-3", "type": "transfer", "amount": 3000, "accountId": "a-1", "toAccountId": "a-2", "note": "領現金", "occurredAt": "2026-11-06T02:00:00.000Z", "createdAt": "2026-11-06T02:00:00.000Z", "reimbursable": false }
\`\`\`

- expense＝支出、income＝收入：要有 categoryId，而且分類的 type 要對（支出用支出分類、收入用收入分類）。
- transfer＝轉帳：accountId 是轉出、toAccountId 是轉入，不要 categoryId。信用卡繳費＝從銀行轉帳到信用卡。
- id：不重複的字串。amount：正整數（元），不能是 0 或負數，方向由 type 決定。
- note：備註，沒有就填 ""。reimbursable 一律 false。
- occurredAt：發生時間，ISO 8601 格式（UTC，結尾 Z）。台灣時間要減 8 小時，例如台灣 2026-11-20 12:10 ＝ "2026-11-20T04:10:00.000Z"。只有日期沒有時間時，用台灣時間中午 12:00。createdAt 填跟 occurredAt 一樣。
- 不要用其他 type（例如 adjust、owed），也不要加其他欄位。

## 4. 帳戶餘額怎麼算

拖拖記帳不存「目前餘額」，而是用 initialBalance 加上所有紀錄算出來：

帳戶目前餘額 ＝ initialBalance ＋ 收入 － 支出 ＋ 轉入 － 轉出

所以每個帳戶的 initialBalance ＝ 舊 App 目前顯示的餘額 －（收入 － 支出 ＋ 轉入 － 轉出）。
算完請驗算一次：每個帳戶用上面的公式算出來，要等於舊 App 目前的餘額。

## 5. 分類 categories

\`\`\`json
{ "id": "c-e1", "type": "expense", "name": "午餐", "icon": "utensils", "color": "food", "order": 1 }
\`\`\`

- 盡量用範本裡已有的分類。對不上的可以新增：id 不重複，type 是 "expense" 或 "income"，order 接在同類最後面。
- icon：Lucide 圖示名稱（例如 utensils、bus、shopping-bag、gift），不確定就填 "package"。
- color 只能是：${COLOR_KEYS}。

## 6. 匯入失敗時

App 會列出錯誤，例如「第 35 筆紀錄（2026-03-04 午餐 $120）：帳戶「a-9」不存在」。使用者會把錯誤訊息貼給你，請照訊息修正後重新產生整個檔案。
`;
}

/** 範本：目前的帳戶、分類、設定，紀錄與定期扣款清空（AI 照這個填） */
export function templateData(d: AppData): AppData {
  const { sample: _s, tutorial: _t, lastUsedAccountId: _l, ...settings } = d.settings;
  return { ...d, transactions: [], recurring: [], settings: { ...settings, lastUsedAccountId: null } };
}

// ---------------- 匯入前檢查 ----------------

const TX_TYPES = new Set<string>(['expense', 'income', 'transfer', 'reimburse_in', 'adjust', 'valuation', 'owed', 'owed_repay']);
const ACC_KINDS = new Set<string>(Object.keys(KIND_LABEL));
const MAX_ERRORS = 30;

const validDate = (v: unknown) => typeof v === 'string' && !Number.isNaN(new Date(v).getTime());

/** 錯誤訊息裡描述一筆紀錄：「第 35 筆紀錄（2026-03-04 午餐 $120）」 */
function txLabel(t: Partial<Transaction>, i: number): string {
  const day = validDate(t.occurredAt) ? new Date(t.occurredAt as string).toLocaleDateString('sv-SE') : '日期不明';
  const amt = typeof t.amount === 'number' ? ` $${t.amount}` : '';
  return `第 ${i + 1} 筆紀錄（${day}${t.note ? ` ${t.note}` : ''}${amt}）`;
}

/**
 * 檢查完整備份的內容，回傳錯誤清單（空的＝可以匯入）。
 * 只擋「匯進去會讓 App 算錯或壞掉」的問題；自己匯出的備份一定通過。
 */
export function checkImport(d: AppData): string[] {
  const errs: string[] = [];
  const push = (s: string) => errs.length < MAX_ERRORS && errs.push(s);

  const accIds = new Set<string>();
  d.accounts.forEach((a, i) => {
    const name = `第 ${i + 1} 個帳戶（${a?.name ?? '沒有名稱'}）`;
    if (!a || typeof a.id !== 'string' || !a.id) return push(`${name}：沒有 id`);
    if (accIds.has(a.id)) push(`${name}：id「${a.id}」跟別的帳戶重複`);
    accIds.add(a.id);
    if (typeof a.name !== 'string' || !a.name.trim()) push(`${name}：沒有名稱`);
    if (!ACC_KINDS.has(a.kind)) push(`${name}：kind「${String(a.kind)}」不對，只能是 ${[...ACC_KINDS].join('、')}`);
    if (typeof a.initialBalance !== 'number' || !Number.isFinite(a.initialBalance)) push(`${name}：initialBalance 不是數字`);
  });

  const cats = new Map<string, string>();
  d.categories.forEach((c, i) => {
    if (!c || typeof c.id !== 'string') return push(`第 ${i + 1} 個分類：沒有 id`);
    if (cats.has(c.id)) push(`第 ${i + 1} 個分類（${c.name}）：id「${c.id}」跟別的分類重複`);
    if (c.type !== 'expense' && c.type !== 'income') push(`第 ${i + 1} 個分類（${c.name}）：type 只能是 expense 或 income`);
    cats.set(c.id, c.type);
  });

  const txIds = new Set<string>();
  d.transactions.forEach((t, i) => {
    const name = txLabel(t, i);
    if (!t || typeof t.id !== 'string' || !t.id) return push(`${name}：沒有 id`);
    if (txIds.has(t.id)) push(`${name}：id「${t.id}」跟別筆重複`);
    txIds.add(t.id);
    if (!TX_TYPES.has(t.type)) return push(`${name}：type「${String(t.type)}」不對，只能用 expense、income、transfer`);
    if (typeof t.amount !== 'number' || !Number.isFinite(t.amount) || t.amount < 0) push(`${name}：amount 要是正整數`);
    if (!validDate(t.occurredAt)) push(`${name}：occurredAt「${String(t.occurredAt)}」不是正確的日期時間`);
    // 朋友付不選帳戶（accountId 是空字串）
    if (!(t.type === 'owed' && t.accountId === '') && !accIds.has(t.accountId)) push(`${name}：帳戶「${String(t.accountId)}」不存在`);
    if ((t.type === 'transfer' || t.type === 'reimburse_in') && !accIds.has(t.toAccountId ?? '')) {
      push(`${name}：轉入帳戶（toAccountId）「${String(t.toAccountId)}」不存在`);
    }
    if (t.categoryId) {
      const ct = cats.get(t.categoryId);
      if (!ct) push(`${name}：分類「${t.categoryId}」不存在`);
      else if ((t.type === 'expense' || t.type === 'income') && ct !== t.type) {
        push(`${name}：${t.type === 'expense' ? '支出' : '收入'}用了${ct === 'expense' ? '支出' : '收入'}分類「${t.categoryId}」`);
      }
    }
  });

  const sd = d.settings?.settleDay;
  if (typeof sd !== 'number' || sd < 1 || sd > 31) push('settings.settleDay（結算日）要是 1～31 的數字');
  if (errs.length === MAX_ERRORS) errs.push('（錯誤太多，只列出前面幾個）');
  return errs;
}

/**
 * 日期統一成 App 自己存的格式（UTC、結尾 Z）：App 用字串比大小排序，格式不一樣會排錯。
 * 自己匯出的備份本來就是這個格式，不會有任何改變。金額取整數（元）。
 */
export function normalizeImport(d: AppData): AppData {
  // 壞掉的日期（使用者選了「仍要匯入」）原樣留著，不在這裡丟錯
  const iso = (v: string) => (validDate(v) ? new Date(v).toISOString() : v);
  return {
    ...d,
    transactions: d.transactions.map((t) => ({
      ...t,
      amount: Math.round(t.amount),
      occurredAt: iso(t.occurredAt),
      createdAt: validDate(t.createdAt) ? iso(t.createdAt) : iso(t.occurredAt),
      note: typeof t.note === 'string' ? t.note : '',
      reimbursable: t.reimbursable === true,
    })),
  };
}

/** 匯入前給使用者核對的摘要：帳戶餘額、紀錄筆數與期間、剩餘可用 */
export function importSummary(d: AppData): string {
  const bal = allBalances(d);
  const days = d.transactions.map((t) => t.occurredAt).sort();
  const fmt = (s: string) => new Date(s).toLocaleDateString('sv-SE').replace(/-/g, '/');
  const lines = [...d.accounts]
    .sort((a, b) => (a.kind === 'bank' ? 0 : 1) - (b.kind === 'bank' ? 0 : 1) || a.order - b.order)
    .map((a) => `・${a.name}　${money(bal.get(a.id) ?? 0)}`);
  const shown = lines.length > 12 ? [...lines.slice(0, 12), `…還有 ${lines.length - 12} 個帳戶`] : lines;
  return [
    `紀錄 ${d.transactions.length} 筆${days.length ? `（${fmt(days[0])}～${fmt(days[days.length - 1])}）` : ''}`,
    `剩餘可用 ${money(spendableTotal(d))}`,
    '',
    '各帳戶餘額：',
    ...shown,
  ].join('\n');
}
