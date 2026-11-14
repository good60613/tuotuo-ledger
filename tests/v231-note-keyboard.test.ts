// 2.3.1：記帳頁輸入備註時，計算機跟著視窗高度讓位給系統鍵盤
import { describe, expect, it } from 'vitest';
import { nextCalcPhase, KB_OPEN_PX, KB_CLOSED_PX, type CalcPhase, type KbEvent } from '../src/noteKeyboard';

const FULL = 800;
const WITH_KB = 500; // 鍵盤 300px
const run = (start: CalcPhase, ...events: KbEvent[]) => {
  let phase = start;
  let blur = false;
  for (const e of events) {
    const r = nextCalcPhase(phase, e);
    phase = r.phase;
    blur = blur || !!r.blurInput;
  }
  return { phase, blur };
};
const focus = (h = FULL): KbEvent => ({ t: 'focus', h, full: FULL });
const blur = (h: number): KbEvent => ({ t: 'blur', h, full: FULL });
const resize = (h: number): KbEvent => ({ t: 'resize', h, full: FULL });

describe('備註輸入：計算機讓位給系統鍵盤', () => {
  it('點備註：先「看不見但佔位」，視窗變矮後才真的拿掉', () => {
    expect(run('show', focus()).phase).toBe('holdHide');
    expect(run('show', focus(), resize(WITH_KB)).phase).toBe('hidden');
  });

  it('視窗只變矮一點點（小於門檻）不算鍵盤出現', () => {
    expect(run('show', focus(), resize(FULL - KB_OPEN_PX + 1)).phase).toBe('holdHide');
  });

  it('視窗一直沒變矮（浮動鍵盤等）：逾時照常拿掉，不會卡在中間', () => {
    expect(run('show', focus(), { t: 'timeout' }).phase).toBe('hidden');
  });

  it('點備註時鍵盤其實已經開著：直接視為已拿掉', () => {
    expect(run('holdShow', focus(WITH_KB)).phase).toBe('hidden');
  });

  it('完成鈕（輸入框失焦）：先不放回計算機，視窗變高後才放回來', () => {
    const r = run('show', focus(), resize(WITH_KB), blur(WITH_KB));
    expect(r.phase).toBe('holdShow');
    expect(run('holdShow', resize(FULL)).phase).toBe('show');
    expect(run('holdShow', resize(FULL - KB_CLOSED_PX)).phase).toBe('show');
    expect(run('holdShow', resize(WITH_KB)).phase).toBe('holdShow');
  });

  it('鍵盤收起太久沒變高：逾時照常放回計算機', () => {
    expect(run('holdShow', { t: 'timeout' }).phase).toBe('show');
  });

  it('失焦時視窗已經是全高：直接放回計算機', () => {
    expect(run('hidden', blur(FULL)).phase).toBe('show');
    expect(run('holdHide', blur(FULL)).phase).toBe('show');
  });

  it('鍵盤被返回鍵收掉（輸入框沒失焦）：視窗回到全高時要求輸入框失焦', () => {
    const r = run('hidden', resize(FULL));
    expect(r.blur).toBe(true);
    expect(r.phase).toBe('hidden'); // 實際放回計算機要等失焦事件
    expect(run('hidden', blur(FULL)).phase).toBe('show');
  });

  it('鍵盤開著時視窗高度沒回到全高：不會誤失焦', () => {
    expect(run('hidden', resize(WITH_KB + 20)).blur).toBe(false);
  });

  it('平常（計算機顯示）時不受視窗大小影響', () => {
    expect(run('show', resize(WITH_KB)).phase).toBe('show');
  });
});
