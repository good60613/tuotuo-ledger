// 防誤觸護盾：拖曳放開後的短時間內，擋掉所有點擊。
// 避免「放開的那一下」被當成點到新開畫面上的按鈕（例如計算機數字）。
let blockUntil = 0;

export function blockClicks(ms: number) {
  blockUntil = Math.max(blockUntil, performance.now() + ms);
}

export function clicksBlocked(): boolean {
  return performance.now() < blockUntil;
}

export function installClickGuard() {
  const stop = (e: Event) => {
    if (clicksBlocked()) {
      e.stopPropagation();
      e.preventDefault();
    }
  };
  // capture 階段攔截，比任何按鈕都先處理
  // （卡片的「點一下」不靠 click，自己會檢查 clicksBlocked）
  window.addEventListener('click', stop, true);
  // 長按時不要跳出系統選單
  window.addEventListener('contextmenu', (e) => {
    const t = e.target as HTMLElement | null;
    if (!t?.closest('input, textarea')) e.preventDefault();
  });
}
