// 記帳頁輸入備註時，系統鍵盤取代計算機鍵盤（2.3.1）。
// 目標：點備註欄 → 計算機收起、系統鍵盤出現在同一個位置；分類區不被擠壓；金額、備註、付款方式列、備註標籤、日期列留在鍵盤上方；
// 鍵盤收起（完成鈕、返回鍵、點別處）→ 計算機回來。
//
// 做法：App 的視窗會隨系統鍵盤變矮（Capacitor 把鍵盤高度算成視窗底部留白）。計算機要「跟著視窗高度的變化」才收起／回來，
// 不能一點備註就先拿掉——否則視窗還沒變矮的那一瞬間，空出來的高度會被分類區吃掉，輸入列跳到最底下再跳回來。
// 所以計算機分四個階段：
//   show      顯示（平常）
//   holdHide  已點備註、鍵盤正在出來：計算機看不見但還佔著位置（視窗變矮之後才真的拿掉）
//   hidden    計算機拿掉，位置讓給系統鍵盤
//   holdShow  鍵盤正在收：計算機還沒回來（視窗變高之後才放回來）
// 視窗一直沒變矮／變高（例如鍵盤是浮動的）：靠逾時保底，不會卡在中間階段。

import { useEffect, useRef, useState } from 'preact/hooks';

export type CalcPhase = 'show' | 'holdHide' | 'hidden' | 'holdShow';

/** 視窗比「沒有鍵盤時」矮超過這麼多 px，就當作系統鍵盤出現了 */
export const KB_OPEN_PX = 80;
/** 視窗和「沒有鍵盤時」只差這麼多 px 以內，就當作鍵盤已經收起 */
export const KB_CLOSED_PX = 40;
/** 等視窗變矮／變高的最長時間（ms），超過就照常切換 */
export const KB_WAIT_MS = 450;

export type KbEvent =
  | { t: 'focus'; h: number; full: number }
  | { t: 'blur'; h: number; full: number }
  | { t: 'resize'; h: number; full: number }
  | { t: 'timeout' };

export interface KbResult {
  phase: CalcPhase;
  /** 鍵盤已經被收掉（返回鍵），但輸入框還停在選取狀態：要主動讓它失焦，計算機才回得來 */
  blurInput?: boolean;
}

/** 純函式：依事件算出計算機下一個階段（獨立出來方便自動測試） */
export function nextCalcPhase(phase: CalcPhase, e: KbEvent): KbResult {
  switch (e.t) {
    case 'focus':
      // 鍵盤其實已經開著（例如收起途中又點回備註）：直接視為已拿掉
      return { phase: e.h <= e.full - KB_OPEN_PX ? 'hidden' : 'holdHide' };
    case 'resize':
      if (phase === 'holdHide' && e.h <= e.full - KB_OPEN_PX) return { phase: 'hidden' };
      if (phase === 'holdShow' && e.h >= e.full - KB_CLOSED_PX) return { phase: 'show' };
      // 鍵盤被返回鍵收掉時，網頁的輸入框不會失焦：視窗回到全高，就自己讓它失焦
      if (phase === 'hidden' && e.h >= e.full - KB_CLOSED_PX) return { phase, blurInput: true };
      return { phase };
    case 'blur':
      if (phase === 'hidden' || phase === 'holdHide') {
        return { phase: e.h >= e.full - KB_CLOSED_PX ? 'show' : 'holdShow' };
      }
      return { phase };
    case 'timeout':
      if (phase === 'holdHide') return { phase: 'hidden' };
      if (phase === 'holdShow') return { phase: 'show' };
      return { phase };
  }
}

// ---- 接到畫面上的 hook ----

/**
 * 備註輸入框用：回傳計算機目前的階段，以及要綁在輸入框 onFocus／onBlur 的函式。
 * inputRef 是備註輸入框，鍵盤被返回鍵收掉時用它主動讓輸入框失焦。
 */
export function useNoteKeyboard(inputRef: { current: HTMLInputElement | null }) {
  const [phase, setPhase] = useState<CalcPhase>('show');
  const phaseRef = useRef<CalcPhase>('show');
  // 沒有鍵盤時的視窗高度（鍵盤不在、計算機正常顯示時隨時更新）
  const fullRef = useRef(typeof window === 'undefined' ? 0 : window.innerHeight);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dispatchRef = useRef<(e: { t: KbEvent['t'] }) => void>(() => {});

  dispatchRef.current = (ev) => {
    const h = window.innerHeight;
    const e = (ev.t === 'timeout' ? { t: 'timeout' } : { t: ev.t, h, full: fullRef.current }) as KbEvent;
    const r = nextCalcPhase(phaseRef.current, e);
    if (r.phase !== phaseRef.current) {
      phaseRef.current = r.phase;
      setPhase(r.phase);
      clearTimeout(timer.current);
      if (r.phase === 'holdHide' || r.phase === 'holdShow') {
        timer.current = setTimeout(() => dispatchRef.current({ t: 'timeout' }), KB_WAIT_MS);
      }
    }
    if (r.blurInput) inputRef.current?.blur();
  };

  useEffect(() => {
    const onResize = () => {
      if (phaseRef.current === 'show') fullRef.current = window.innerHeight;
      dispatchRef.current({ t: 'resize' });
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(timer.current);
    };
  }, []);

  return {
    phase,
    onFocus: () => dispatchRef.current({ t: 'focus' }),
    onBlur: () => dispatchRef.current({ t: 'blur' }),
  };
}
