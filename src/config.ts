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

/** 定期扣款：App 一直開著時，每隔多久檢查一次有沒有到扣款日（打開 App、回到前景時也會檢查） */
export const RECURRING_CHECK_MS = 30 * 60 * 1000;

/**
 * 自動留底（2.0 修正批）：存在 App 自己的另一個資料庫，和主資料分開寫。
 * 每份大約等於一份完整備份檔大小（一千筆紀錄約 0.3 MB），兩種合計最多 12 份。
 */
export const SNAPSHOT = {
  /** 每天第一次開啟時的留底，保留最近幾份（＝最近幾天） */
  dailyKeep: 7,
  /** 匯入、清空、載入範例、還原、資料升級前的留底，保留最近幾份 */
  eventKeep: 5,
} as const;

/** 「已記一筆」提示停留多久（可按復原） */
export const TOAST_MS = 4000;

/** 首頁版面（第三批第 3 項） */
export const HOME = {
  /** 卡片區最多顯示幾排（每排 2 張）；超過就在卡片區內上下捲動 */
  maxCardRows: 3,
  /** 卡片之間的間距 */
  cardGapPx: 10,
  /** 最近紀錄每一筆佔的高度（卡片 54px＋間距） */
  recentRowPx: 58,
  /** 最近紀錄每筆之間的間距（含在 recentRowPx 裡） */
  recentGapPx: 4,
  /** 最近紀錄固定顯示幾筆（貼在導覽列上方；螢幕太矮時自動少顯示） */
  recentCount: 3,
  /** 拿起卡片時，最下面「支出／收入」放置區的最小高度（螢幕太矮時仍要出現） */
  dropZoneMinPx: 96,
  /** 拿起時放置區上緣提示字那一行的高度 */
  dragHintPx: 26,
  /** 金額區（倒三角，越下越大）：剩下的高度全給金額區，三行平均分配上下空間 */
  amount: {
    /** 最上：今日收入／支出的數字 */
    todayPx: 16,
    /** 中間：本月收入／支出的數字 */
    monthPx: 24,
    /** 最下：剩餘可用的數字（最大） */
    leftPx: 48,
    /** 小標籤（今日收入、本月支出…）字級 */
    labelPx: 12,
    /** 「已圈預算」字級 */
    budgetPx: 13,
    /** 左右兩欄之間的間距（今日、本月兩行） */
    colGapPx: 28,
    /** 三行之間至少留的間距（空間多時會自動平分加大） */
    rowGapMinPx: 6,
    /** 矮螢幕（高度 700px 以下）字級倍率 */
    shortScale: 0.85,
  },
} as const;

/**
 * 報帳、預算的標示色（PK 定案：報帳橘色、預算藍色）已搬到 theme.ts 的顏色清單（--reimb、--budget）。
 * 色弱：一定同時有文字（「報」「預」「已報」「已付」），不能只靠顏色。
 */

/** 記帳頁計算機上方那一排的各格寬度比例（flex-grow；數字越大越寬） */
export const ENTRY_ROW = {
  /** 日期格：0＝依內容寬度不伸縮 */
  date: 0,
  /** 只有一個數字：算式與備註約一半一半 */
  exprSolo: 1,
  noteSolo: 1,
  /** 算式含運算子：算式撐開、備註縮短 */
  exprCalc: 2.4,
  noteCalc: 1,
  /** 備註輸入框 focus：備註撐開（算式仍保有基本寬度） */
  exprNoteFocus: 1,
  noteFocus: 2.2,
} as const;

/** 拖拖計算機：把標記膠囊拖到數字上 */
export const DRAG_MARK = {
  /**
   * 補強批：在膠囊上按住多久才「拿起」可以拖（0.15～0.2 秒）。
   * 還沒拿起前手指就移動＝左右捲動膠囊列，不會拖。
   */
  holdMs: 180,
  /** 還沒拿起前移動超過這個距離＝判定為捲動；拿起後移動超過這個距離才算開始拖 */
  startMovePx: 6,
  /** 拿起時震動多久（0＝不震） */
  liftVibrateMs: 15,
  /** 跟著手指的小膠囊影子，相對手指的垂直偏移（負＝偏上） */
  ghostOffsetY: -44,
  /** 拖曳時快速標籤那排的透明度 */
  dimOpacity: 0.3,
  /** 命中數字時，數字的框往上下左右各加大多少 px */
  dropPadPx: 18,
} as const;

/**
 * 底部操作列與導覽列的尺寸（第五批，單手操作版面）。
 * 矮螢幕覺得擠就調這兩個（heightPx 與 navHeightPx）。
 */
/** 手機條碼載具（設定頁預覽；桌面小工具的條碼大小在 android/app/src/main/res/values/widget_dimens.xml） */
export const CARRIER = {
  /** 粗條是細條的幾倍（Code 39 建議 2～3；越大越好掃，但條碼越寬） */
  wideRatio: 3,
  /** 預覽條碼：一條細條幾 px */
  previewNarrowPx: 2,
  /** 預覽條碼高度 */
  previewHeightPx: 64,
  /** 條碼左右要留的空白（幾條細條寬；掃描槍需要） */
  quietModules: 10,
} as const;

/** 桌面小工具（網頁端；外觀數值在 android/app/src/main/res/values/widget_dimens.xml） */
export const WIDGET = {
  /** 資料連續變動時，等多久沒有新變動才送給小工具（毫秒） */
  debounceMs: 300,
} as const;

/** 時間軸：左邊豎線在最後一筆下面再往下延伸多長（只畫線，不佔排版高度） */
export const TIMELINE = {
  /** 待辦頁（報帳、預算）：延伸到清單底（清單外框會切掉多的部分，不可大於最後一天的下間距 10px，否則會多出捲動空間） */
  tailTodoPx: 10,
  /** 明細頁：穿過「＋」那一列的空白，停在底部操作列上方 */
  tailDetailPx: 74,
} as const;

export const BOTTOM_BAR = {
  /** 底部操作列高度（統計、明細、待辦頁固定在導覽列正上方） */
  heightPx: 48,
  /** 操作列與內容、浮動「＋」、提示條之間的間距 */
  gapPx: 10,
  /** 底部導覽列高度（原本寫在 styles.css 的 --nav-h） */
  navHeightPx: 58,
} as const;

export const ICON = {
  /** 圖示預設大小（px，24 格畫布縮放） */
  size: 22,
  /** 線條粗細（工單規格 1.8） */
  stroke: 1.8,
} as const;

export const HOME_SUM = {
  /** 首頁「本月」「今日」兩行：支出與收入之間的間距（PK 補充，先給 12px，手機看過再調） */
  gapPx: 12,
} as const;
