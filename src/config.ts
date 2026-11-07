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
  /** 判斷方向前要先移動這麼多 */
  lockDistancePx: 10,
  /** 水平移動要比垂直移動大幾倍才算左右滑（避免上下捲動時誤換頁） */
  horizontalBias: 1.2,
  /** 換頁動畫時間 */
  animMs: 260,
} as const;

/** 「已記一筆」提示停留多久（可按復原） */
export const TOAST_MS = 4000;
