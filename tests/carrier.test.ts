import { describe, it, expect } from 'vitest';
import { carrierError, code39Widths, isValidCarrier, normalizeCarrier } from '../src/data/carrier';
import { exportJson, readBackup } from '../src/data/backup';
import { sampleData } from '../src/data/seed';

/** 把寬度轉成 Code 39 常見的二進位寫法（粗＝2 格），拿來和標準表對照 */
const bits = (w: number[]) => w.map((x, i) => (i % 2 === 0 ? '1' : '0').repeat(x)).join('');

describe('手機條碼載具', () => {
  it('格式檢查', () => {
    expect(isValidCarrier('/ABC1234')).toBe(true);
    expect(isValidCarrier('/AB+-.12')).toBe(true);
    expect(isValidCarrier('ABC12345')).toBe(false);
    expect(isValidCarrier('/abc1234')).toBe(false);
    expect(isValidCarrier('/ABC123')).toBe(false);
    expect(isValidCarrier('/ABC_123')).toBe(false);
    expect(normalizeCarrier(' /abc 1234 ')).toBe('/ABC1234');
    expect(carrierError('ABC')).toMatch('斜線');
    expect(carrierError('/ABC')).toMatch('8 碼');
    expect(carrierError('/ABC*12')).not.toBeNull();
    expect(carrierError('')).toBeNull();
  });

  it('格式不對不產生條碼', () => {
    expect(code39Widths('/ABC12', 3)).toBeNull();
  });

  it('Code 39 編碼與標準表一致', () => {
    // 單一字元：取「*X*」中間那段（每字元 9 元素＋1 細空）
    const one = (c: string) => {
      const code = `/${c.repeat(7)}`;
      const w = code39Widths(code, 2)!;
      return bits(w.slice(20, 29)); // 第 3 個字元＝第一個 c
    };
    expect(one('0')).toBe('101001101101');
    expect(one('1')).toBe('110100101011');
    expect(one('A')).toBe('110101001011');
    expect(one('B')).toBe('101101001011');
    expect(one('-')).toBe('100101011011');
    expect(one('.')).toBe('110010101101');
    expect(one('+')).toBe('100101001001');
    const w = code39Widths('/ABC1234', 2)!;
    expect(bits(w.slice(0, 9))).toBe('100101101101'); // 起始 *
    expect(bits(w.slice(10, 19))).toBe('100100101001'); // /
    // 10 個字元（含起訖），每個 9 元素，中間 9 個細空
    expect(w.length).toBe(10 * 9 + 9);
  });

  it('每個字元剛好 3 粗', () => {
    const w = code39Widths('/0123456', 3)!;
    for (let i = 0; i < 10; i++) expect(w.slice(i * 10, i * 10 + 9).filter((x) => x === 3).length).toBe(3);
    const w2 = code39Widths('/789XYZ.', 3)!;
    for (let i = 0; i < 10; i++) expect(w2.slice(i * 10, i * 10 + 9).filter((x) => x === 3).length).toBe(3);
  });

  it('載具號碼跟著設定備份與完整備份；舊備份沒有就是未設定', () => {
    const d = sampleData();
    d.settings.carrierCode = '/ABC1234';
    expect(readBackup(exportJson(d, 'settings')).data.settings.carrierCode).toBe('/ABC1234');
    expect(readBackup(exportJson(d, 'full')).data.settings.carrierCode).toBe('/ABC1234');
    const old = sampleData();
    delete old.settings.carrierCode;
    expect(readBackup(exportJson(old, 'full')).data.settings.carrierCode).toBeUndefined();
  });
});
