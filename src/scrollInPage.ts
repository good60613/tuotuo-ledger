// 3.0：把某個元素捲到看得到的地方，只捲它所在的那一頁。
// 不用 scrollIntoView：它也會去捲左右換頁的外框，畫面會卡在兩頁中間。
export function scrollInPage(el: HTMLElement, block: 'start' | 'center' = 'center', smooth = false) {
  let box = el.parentElement;
  while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
  if (!box) return;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  const delta = block === 'start' ? r.top - b.top - 8 : r.top - b.top - (box.clientHeight - r.height) / 2;
  box.scrollTo({ top: box.scrollTop + delta, behavior: smooth ? 'smooth' : 'auto' });
}
