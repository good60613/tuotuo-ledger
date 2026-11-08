// 手機條碼載具（財政部共通性載具）：格式檢查與 Code 39 條碼編碼。
//
// 格式：共 8 碼，第一碼固定是斜線「/」，後 7 碼由 0-9、大寫 A-Z、「+」「-」「.」組成。例：/ABC+123
// 條碼：Code 39（一種只用粗細條紋表示英數字的條碼），前後各加起訖符號「*」。
// 這裡把號碼轉成「粗細條紋」字串；設定頁預覽和桌面小工具都畫同一份字串，不會各算各的。

/** 財政部手機條碼格式 */
export const CARRIER_RE = /^\/[0-9A-Z+\-.]{7}$/;

/** 使用者輸入整理：去空白、英文轉大寫 */
export const normalizeCarrier = (s: string) => s.replace(/\s+/g, '').toUpperCase();

export const isValidCarrier = (s: string) => CARRIER_RE.test(s);

/** 格式錯誤的說明（正確回傳 null） */
export function carrierError(s: string): string | null {
  if (!s) return null;
  if (!s.startsWith('/')) return '第一碼要是斜線「/」';
  if (s.length !== 8) return `要剛好 8 碼（現在 ${s.length} 碼）`;
  if (!CARRIER_RE.test(s)) return '後 7 碼只能是數字、大寫英文和 + - .';
  return null;
}

/**
 * Code 39 字元表：每個字元 9 個元素（條、空、條、空…交錯，以條開頭），1＝粗、0＝細，每個字元剛好 3 粗。
 * 只列載具會用到的字元與起訖符號。
 */
const CODE39: Record<string, string> = {
  '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000', '4': '000110001',
  '5': '100110000', '6': '001110000', '7': '000100101', '8': '100100100', '9': '001100100',
  A: '100001001', B: '001001001', C: '101001000', D: '000011001', E: '100011000',
  F: '001011000', G: '000001101', H: '100001100', I: '001001100', J: '000011100',
  K: '100000011', L: '001000011', M: '101000010', N: '000010011', O: '100010010',
  P: '001010010', Q: '000000111', R: '100000110', S: '001000110', T: '000010110',
  U: '110000001', V: '011000001', W: '111000000', X: '010010001', Y: '110010000',
  Z: '011010000', '-': '010000101', '.': '110000100', '/': '010100010', '+': '010001010',
  '*': '010010100',
};

/**
 * 轉成條紋寬度字串：每個字元是寬度數字（1＝細、N＝粗），條與空交錯、以條開頭；
 * 字元之間補一個細空。例：*（起）→ 字元… → *（訖）。格式不對回傳 null（不畫掃不出的條碼）。
 * @param wide 粗條是細條的幾倍（2～3，越大越好掃但越寬）
 */
export function code39Widths(code: string, wide: number): number[] | null {
  if (!isValidCarrier(code)) return null;
  const out: number[] = [];
  const chars = `*${code}*`;
  for (let i = 0; i < chars.length; i++) {
    const p = CODE39[chars[i]];
    for (const b of p) out.push(b === '1' ? wide : 1);
    if (i < chars.length - 1) out.push(1); // 字元間細空
  }
  return out;
}
