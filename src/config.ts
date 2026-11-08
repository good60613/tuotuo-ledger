// ===== 手勢與防誤觸設定（要微調手感就改這裡） =====
// 單位：毫秒(ms)、畫面像素(px)。

export const GESTURE = {
  /** 按住多久才拿起卡片 */
  longPressMs: 400,
  /** 拿起前，手指移動超過這個距離就判定為「滑動」，不會拿起、也不算點擊 */
  moveTolerancePx: 8,
  /** 點一下的最長按壓時間（超過就不算點擊；通常會先達到長按） */
  tapMaxMs: 400,
  /** 拿起時震動多久（只有 Android 有效） */
  liftVibrateMs: 30,
  /** 拖曳經過新目標時的輕震（0 = 關閉） */
  hoverVibrateMs: 8,
  /** 拿起後卡片放大倍率 */
  liftScale: 1.08,
  /** 拿起後開始移動時，卡片縮小成這個倍率，避免蓋住底下的目標 */
  dragScale: 0.7,
  /** 移動中卡片的透明度（1 = 不透明），讓底下目標的高亮透得出來 */
  dragOpacity: 0.82,
  /** 拿起後手指移動超過這個距離，卡片才縮小 */
  shrinkAfterPx: 14,
  /** 拖曳中，畫面上「拿著的卡片」相對手指往上偏移，避免被手指擋住 */
  dragOffsetY: -24,
  /** 放開後到可以再次點擊之間的冷卻時間，防止放開瞬間誤觸 */
  afterDropCooldownMs: 250,
} as const;

export const PAGER = {
  /** 左右滑超過頁寬的這個比例才換頁 */
  switchRatio: 0.22,
  /** 或是滑得夠快（px/ms）也換頁 */
  flickVelocity: 0.45,
  /** 用「快速甩」換頁時，至少也要滑這麼遠（避免手指小抖動就換頁） */
  flickMinPx: 40,
  /** 判斷方向前要先移動這麼多 */
  lockDistancePx: 10,
  /** 水平移動要比垂直移動大幾倍才算左右滑（避免上下捲動時誤換頁） */
  horizontalBias: 1.2,
  /** 換頁動畫時間 */
  animMs: 260,
} as const;

/** 跳頁的淡入淡出（統計頁點分類或日期 → 明細頁） */
export const TRANSITION = {
  fadeMs: 260,
} as const;

/** 記帳頁計算機鍵盤（五欄布局）。手機上太擠就調這裡 */
export const CALC = {
  /** 每排高度（4 排 × 65 ＝ 原本 5 排 × 52 的總高度，鍵盤整體高度不變） */
  rowHeightPx: 65,
  /** 矮螢幕時的每排高度 */
  shortRowHeightPx: 57.5,
  /** 按鍵之間的間距 */
  gapPx: 1,
} as const;

/** 小帳戶子畫面右下角「＋」離螢幕邊緣的距離 */
export const SUB_FAB = {
  rightPx: 28,
  bottomPx: 36,
} as const;

/** 備註記憶模式 */
export const NOTES = {
  /** 輸入頁備註格數（「更多…」另外算） */
  slots: 5,
} as const;

/** 分類自動排序 */
export const CATEGORY_SORT = {
  /** 依最近幾天的使用次數排序 */
  recentDays: 90,
} as const;

/** 結算日預設值與可選範圍 */
export const SETTLE = {
  defaultDay: 1,
  minDay: 1,
  maxDay: 31,
} as const;

/** 「已記一筆」提示停留多久（可按復原） */
export const TOAST_MS = 4000;

/** 首頁版面（第三批第 3 項） */
export const HOME = {
  /** 卡片區最多顯示幾排（每排 2 張）；超過就在卡片區內上下捲動 */
  maxCardRows: 3,
  /** 卡片之間的間距 */
  cardGapPx: 10,
  /** 最近紀錄每一筆的高度（含上下間距） */
  recentRowPx: 62,
  /** 最近紀錄最多幾筆 */
  recentMax: 5,
  /** 拿起卡片時，中間「支出／收入」放置區的最小高度（螢幕太小或沒有最近紀錄時仍要出現） */
  dropZoneMinPx: 96,
} as const;

/**
 * 報帳、預算的標示色（第四批，PK 定案：報帳維持橘色、預算用藍色）。
 * 記帳頁的預算／報帳格、待辦頁、時間軸外框都用這兩個顏色。
 * 色弱：一定同時有文字（「報」「預」「已報」「已付」），不能只靠顏色。
 */
export const TAG_COLOR = {
  reimb: '#d98a00',
  budget: '#1a8fd6',
} as const;

/** 記帳頁計算機上方那一排的各格寬度比例（flex-grow；數字越大越寬） */
export const ENTRY_ROW = {
  date: 2.2,
  /** 帳戶格要夠寬，「郵局(薪轉)」這種名稱才不會被截太多 */
  account: 3,
  budget: 1.3,
  reimb: 1.3,
} as const;
