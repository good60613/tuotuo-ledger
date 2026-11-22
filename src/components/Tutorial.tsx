// 3.0 新手教學：畫面變暗，只亮出要介紹的那一塊，拖拖硬幣在旁邊說明。
// - 第一次安裝（settings.tutorial='pending'）自動出現；看完或跳過＝'done'，不再自動出現。說明區可重看。
// - 「試試看」兩步：範例資料時才讓使用者真的拖（產生的是範例紀錄）；自己的資料重看教學時只看說明，不會多出紀錄。
// - 試試看時變暗層不擋手指；拿起卡片或打開記帳頁時整個教學先藏起來，關掉記帳頁就進下一步。
import { useEffect, useLayoutEffect, useState } from 'preact/hooks';
import { getState, goPage, pageIndex, setState, updateData, useAppState } from '../store';
import { useBackLayer } from '../backNav';
import { COINS } from '../coins';
import { clearSampleAndStart } from '../actions';
import { TUTORIAL } from '../config';
import { scrollInPage } from '../scrollInPage';

interface Step {
  page: '首頁' | '設定';
  /** 要亮出來的元素（CSS 選擇器）；沒有＝整個畫面變暗、泡泡置中 */
  target?: string;
  coin: string;
  title: string;
  text: string;
  /** 試試看：拖卡片記支出／轉帳 */
  tryIt?: boolean;
  /** 最後一頁：三個出口 */
  last?: boolean;
}

const STEPS: Step[] = [
  { page: '首頁', coin: 'happy', title: '嗨，我是拖拖！', text: '拖拖記帳的記帳方式很簡單：大部分的事，用手指「拖」一下就好。我帶你看一圈，大概一分鐘。' },
  { page: '首頁', target: '.home-sum', coin: 'cool', title: '剩餘可用', text: '最大的數字是「這個月還能花多少」：一般帳戶加起來，先扣掉預算、定期扣款、還沒還朋友的錢（右邊小字）。下面是本月、今日的支出和收入。' },
  { page: '首頁', target: '.sum-avg', coin: 'note', title: '平均每天能花多少', text: '剩餘可用 ÷ 離結算日（發薪日）還有幾天。照這個數字花，撐得到下次發薪。可以在設定裡關掉。' },
  { page: '首頁', target: '.quote-quick', coin: 'note', title: '記一筆', text: '最基本的記帳方法：按這裡，輸入金額、選分類就好。' },
  { page: '首頁', target: '.cards', coin: 'happy', title: '試試看：拖卡片記帳', text: '按住一張帳戶卡，拖到下面出現的「支出」放開，就會用這個帳戶記一筆支出。', tryIt: true },
  { page: '首頁', target: '.cards', coin: 'cool', title: '試試看：拖卡片轉帳', text: '把一張卡拖到另一張卡上放開，就是轉帳（例如從銀行領現金）。', tryIt: true },
  { page: '首頁', target: '.balls', coin: 'love', title: '小帳戶', text: '悠遊卡、電子錢包、投資、儲蓄、其他。點進去可以儲值、記投資、存錢到目標。卡片也可以拖到球上＝轉帳過去。' },
  { page: '首頁', target: '.bottom-nav', coin: 'note', title: '其他頁面', text: '左右滑或點下面切換：待辦（預算、報帳、朋友先付）、統計（花在哪裡）、明細（每一筆紀錄，可搜尋、修改）、設定。' },
  { page: '設定', target: '[data-tour="settle"]', coin: 'shock', title: '先設好結算日', text: '結算日＝每個月重新開始算的那天，通常是發薪日。設好了，剩餘可用和平均每天才會準。' },
  { page: '首頁', coin: 'love', title: '準備好了嗎？', text: '現在看到的是範例資料。可以清空開始記自己的；用過別的記帳 App，也可以交給你常用的 AI（ChatGPT、Gemini、Claude…）轉成拖拖記帳的格式搬過來。', last: true },
];

const coinOf = (id: string) => COINS.find((c) => c.id === id)?.src ?? COINS[0].src;

interface Rect { x: number; y: number; w: number; h: number }

export function Tutorial() {
  const s = useAppState();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = STEPS[i];
  const sample = !!s.data.settings.sample;
  const tryIt = !!step.tryIt && sample;

  const close = () => {
    setState({ tutorial: false });
    if (getState().data.settings.tutorial !== 'done') updateData((x) => ({ ...x, settings: { ...x.settings, tutorial: 'done' } }));
    goPage(pageIndex('首頁'));
  };
  useBackLayer(true, close);
  const next = () => (i + 1 < STEPS.length ? setI(i + 1) : close());

  // 換步驟：先換頁，再一直追著目標元素的位置（換頁動畫、捲動中位置會變）
  useEffect(() => {
    if (s.page !== pageIndex(step.page)) goPage(pageIndex(step.page));
    if (!step.target) return setRect(null);
    let scrolled = false;
    const track = () => {
      const el = document.querySelector<HTMLElement>(`.page[data-page] ${step.target}, ${step.target}`);
      if (el) {
        if (!scrolled && step.page === '設定') {
          scrollInPage(el);
          scrolled = true;
        }
        const r = el.getBoundingClientRect();
        const app = document.querySelector('.app')?.getBoundingClientRect();
        const ox = app?.left ?? 0, oy = app?.top ?? 0;
        if (r.width > 0) setRect((old) => {
          const n = { x: r.left - ox, y: r.top - oy, w: r.width, h: r.height };
          return old && Math.abs(old.x - n.x) < 0.5 && Math.abs(old.y - n.y) < 0.5 && old.w === n.w && old.h === n.h ? old : n;
        });
      } else setRect(null);
    };
    track();
    // 用計時器而不是 requestAnimationFrame：畫面在背景時 rAF 會停，位置就不會更新
    const timer = setInterval(track, TUTORIAL.trackMs);
    return () => clearInterval(timer);
  }, [i]);

  // 試試看：打開記帳頁（拖到支出、拖到別張卡都會打開）→ 等它關掉就進下一步
  const [opened, setOpened] = useState(false);
  useLayoutEffect(() => setOpened(false), [i]);
  useEffect(() => {
    if (!tryIt) return;
    if (s.overlays.length > 0) setOpened(true);
    else if (opened) next();
  }, [s.overlays.length, tryIt]);

  // 試試看時點到卡片會跳去明細頁：拉回這一步的頁面（要用拖的）
  useEffect(() => {
    if (tryIt && s.overlays.length === 0 && s.page !== pageIndex(step.page)) goPage(pageIndex(step.page));
  }, [s.page, tryIt]);

  // 拿起卡片、記帳頁開著：整個教學先藏起來，不擋畫面
  if (tryIt && (s.dragging || s.overlays.length > 0)) return null;

  const pad = TUTORIAL.holePadPx;
  const hole = rect && { left: rect.x - pad, top: rect.y - pad, width: rect.w + pad * 2, height: rect.h + pad * 2 };
  const appH = document.querySelector('.app')?.clientHeight ?? window.innerHeight;
  // 泡泡放在目標的另一側（目標在上半部＝泡泡放下面）
  const below = rect ? rect.y + rect.h / 2 < appH / 2 : true;
  const bubblePos = !hole
    ? { top: 0, bottom: 0, margin: 'auto 0', height: 'fit-content' }
    : below
      ? { top: `${hole.top + hole.height + 12}px` }
      : { bottom: `${appH - hole.top + 12}px` };

  return (
    <div class={`tour${tryIt ? ' pass' : ''}`} data-no-swipe>
      {hole ? <div class="tour-hole" style={hole} /> : <div class="tour-dim" />}
      <div class="tour-bubble" style={bubblePos} role="dialog" aria-label={step.title}>
        <div class="tour-head">
          <img src={coinOf(step.coin)} alt="" />
          <b>{step.title}</b>
          <button class="tour-skip" onClick={close}>跳過教學</button>
        </div>
        <p>{step.text}</p>
        {step.tryIt && !sample && <p class="muted small">（重看教學時不會真的記帳，看說明就好）</p>}
        {step.last ? (
          <div class="tour-last">
            {sample && (
              <button class="btn" onClick={async () => { close(); await clearSampleAndStart(); }}>清空範例，開始記帳</button>
            )}
            {/* 已經不是範例資料時（沒有「清空範例」那顆），主要動作就是「用 AI 搬過來」，用主色；範例資料時主色留給「清空範例」 */}
            <button class={sample ? 'btn secondary' : 'btn'} onClick={() => { close(); setState({ settingsIntent: 'import-other' }); goPage(pageIndex('設定')); }}>
              用 AI 從舊 App 搬過來
            </button>
            <button class="btn secondary" onClick={close}>{sample ? '先留著範例玩玩看' : '暫時略過'}</button>
          </div>
        ) : (
          <div class="tour-nav">
            <span class="tour-dots">
              {STEPS.map((_, k) => <i key={k} class={k === i ? 'on' : ''} />)}
            </span>
            {i > 0 && <button class="btn secondary" onClick={() => setI(i - 1)}>上一步</button>}
            <button class="btn" onClick={next}>{tryIt ? '略過這步' : '下一步'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
