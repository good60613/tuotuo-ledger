// 舊資料 emoji → 圖示名稱對照表（資料第 6 版 → 第 7 版用）。
// 只在升版時轉換一次；對不到的 emoji 保留原樣（照常顯示），使用者之後自己在選單換掉。
// 這張表包含第三批圖示選單的全部 emoji 與範例分類用的 emoji。

export const EMOJI_TO_ICON: Record<string, string> = {
  // 飲食
  '🍽': 'utensils', '🍱': 'utensils', '🍦': 'ice-cream-cone', '☕': 'coffee', '🍜': 'soup', '🍞': 'croissant',
  '🍪': 'cookie', '🍕': 'pizza', '🍔': 'sandwich', '🍸': 'wine', '🍷': 'wine', '🧋': 'cup-soda', '🥤': 'cup-soda',
  '🍣': 'fish', '🍰': 'cake-slice', '🍺': 'beer', '🍎': 'apple', '🍳': 'egg-fried', '🥗': 'salad',
  // 購物
  '🛍': 'shopping-bag', '👜': 'shopping-bag', '🛒': 'shopping-cart', '👕': 'shirt', '👗': 'shirt', '💍': 'gem',
  '🎁': 'gift', '🧴': 'spray-can', '🕶': 'glasses', '⌚': 'watch', '📦': 'package', '🏪': 'store',
  // 娛樂
  '🎮': 'gamepad-2', '🎵': 'music', '🎹': 'music', '🎧': 'headphones', '🎬': 'clapperboard', '🎤': 'mic',
  '🎙': 'mic', '🎨': 'palette', '📷': 'camera', '🎟': 'ticket', '🎲': 'dices', '🏖': 'tree-palm',
  // 交通
  '🚕': 'car-taxi-front', '🚇': 'tram-front', '🚗': 'car', '🚌': 'bus', '🅿': 'parking-meter', '✈': 'plane',
  '⛽': 'fuel', '🔌': 'plug-zap', '🚲': 'bike', '🚴': 'bike', '🛵': 'motorbike', '🚄': 'train-front', '🚢': 'ship',
  '🛣': 'map', '🗺': 'map',
  // 居家生活
  '🏠': 'house', '💡': 'lightbulb', '💧': 'droplet', '🔥': 'flame', '📞': 'phone', '🛏': 'bed', '🛁': 'bath',
  '🧺': 'washing-machine', '🔑': 'key-round', '🗑': 'trash-2', '🐾': 'paw-print', '🌸': 'flower-2', '👶': 'baby',
  '✂': 'scissors',
  // 學習
  '📚': 'library', '✏': 'pencil', '🎓': 'graduation-cap', '📖': 'book-open', '🖌': 'paintbrush', '📝': 'notebook-pen',
  '🎒': 'backpack',
  // 健康
  '💊': 'pill', '🩹': 'bandage', '🏥': 'hospital', '💉': 'syringe', '🌡': 'thermometer', '🩺': 'stethoscope',
  // 數位
  '📱': 'smartphone', '💻': 'laptop', '🖥': 'monitor', '☁': 'cloud', '📺': 'tv', '📧': 'mail', '🖨': 'printer',
  // 金錢
  '💰': 'banknote-arrow-up', '💵': 'banknote', '💴': 'banknote', '💶': 'banknote', '💷': 'banknote',
  '💳': 'credit-card', '👛': 'wallet', '🏦': 'landmark', '📈': 'trending-up', '📊': 'chart-column',
  '🐷': 'piggy-bank', '🧾': 'receipt-text', '🤝': 'handshake', '💸': 'hand-coins', '🪙': 'coins',
  '🧮': 'calculator', '🏷': 'tag',
  // 運動
  '🏐': 'volleyball', '🏆': 'trophy', '🏋': 'dumbbell', '🏊': 'waves', '🎯': 'target', '🥾': 'footprints',
  // 其他
  '❤': 'heart', '💬': 'message-circle', '🧭': 'compass', '⭐': 'star', '❓': 'circle-help',
};

/** 查對照表：先去掉 emoji 的「變體選擇符」（️），同一個 emoji 有沒有帶它都對得到 */
export function emojiToIcon(v: string): string | undefined {
  return EMOJI_TO_ICON[v.replace(/️/g, '').trim()];
}
