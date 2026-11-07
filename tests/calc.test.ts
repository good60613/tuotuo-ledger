import { describe, expect, it } from 'vitest';
import { pressKey, evaluate, displayExpr, type CalcKey } from '../src/calcExpr';
import { roundAmount } from '../src/data/calc';

const type = (keys: CalcKey[]) => keys.reduce((e, k) => pressKey(e, k), '');

describe('計算機', () => {
  it('一般輸入與 00', () => {
    expect(type(['1', '2', '00'])).toBe('1200');
    expect(type(['00'])).toBe('0');
    expect(type(['0', '5'])).toBe('5');
  });
  it('小數點只能一個、最多兩位', () => {
    expect(type(['1', '.', '.', '5', '5', '5'])).toBe('1.55');
    expect(type(['.', '5'])).toBe('0.5');
  });
  it('運算子不能開頭、連按會替換', () => {
    expect(type(['+'])).toBe('');
    expect(type(['5', '+', '×', '3'])).toBe('5×3');
  });
  it('先乘除後加減', () => {
    expect(evaluate('120+35×2')).toBe(190);
    expect(evaluate('100÷4−5')).toBe(20);
    expect(evaluate('12+')).toBe(12);
  });
  it('除以 0 算不出來', () => {
    expect(evaluate('5÷0')).toBeNull();
  });
  it('退格與 AC', () => {
    expect(type(['1', '2', '⌫'])).toBe('1');
    expect(type(['1', '2', 'AC'])).toBe('');
  });
  it('顯示千分位', () => {
    expect(displayExpr('12000+3.5')).toBe('12,000+3.5');
  });
  it('存檔四捨五入到整數元', () => {
    expect(roundAmount(evaluate('10÷3')!)).toBe(3);
    expect(roundAmount(evaluate('99.5')!)).toBe(100);
  });
});
