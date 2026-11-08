// 返回鍵：每種畫面按返回都只退一層，只有首頁且什麼都沒開才離開 App
import { beforeEach, describe, expect, it } from 'vitest';
import { getState, setState, openOverlay, HOME_PAGE, PAGES } from '../src/store';
import { handleBack, pushBackLayer, _resetBackLayers } from '../src/backNav';

const entry = { kind: 'entry' as const, mode: 'expense' as const, accountId: null };
const sub = { kind: 'sub' as const, ball: 'easycard' as const };

beforeEach(() => {
  _resetBackLayers();
  setState({ dialog: null, overlays: [], page: HOME_PAGE });
});

describe('返回鍵', () => {
  it('首頁、什麼都沒開：才離開 App', () => {
    expect(handleBack()).toBe('exit');
  });

  it('其他主頁（報帳、統計、明細、設定）：回首頁，不離開', () => {
    for (const name of ['待辦', '統計', '明細', '設定'] as const) {
      setState({ page: PAGES.indexOf(name) });
      expect(handleBack()).toBe('home');
      expect(getState().page).toBe(HOME_PAGE);
    }
  });

  it('確認視窗：先關掉（等同取消），不離開', () => {
    let answer: string | null | undefined;
    setState({ dialog: { title: '刪除？', buttons: [], resolve: (v) => (answer = v) } });
    openOverlay(entry);
    expect(handleBack()).toBe('dialog');
    expect(getState().dialog).toBeNull();
    expect(answer).toBeNull();
    expect(getState().overlays.length).toBe(1); // 底下的畫面還在
  });

  it('底部選單：先關選單，再關畫面，最後才離開', () => {
    openOverlay(entry);
    let sheetOpen = true;
    const off = pushBackLayer(() => {
      sheetOpen = false;
      off();
    });
    expect(handleBack()).toBe('layer');
    expect(sheetOpen).toBe(false);
    expect(getState().overlays.length).toBe(1);
    expect(handleBack()).toBe('overlay');
    expect(getState().overlays.length).toBe(0);
    expect(handleBack()).toBe('exit');
  });

  it('子畫面上再開記帳頁：一次退一層', () => {
    openOverlay(sub);
    openOverlay(entry);
    expect(handleBack()).toBe('overlay');
    expect(getState().overlays).toEqual([sub]);
    expect(handleBack()).toBe('overlay');
    expect(getState().overlays).toEqual([]);
    expect(handleBack()).toBe('exit');
  });

  it('設定的二級頁：回設定目錄，再按才回首頁', () => {
    setState({ page: PAGES.indexOf('設定') });
    let view = 'accounts';
    const off = pushBackLayer(() => {
      view = 'menu';
      off();
    });
    expect(handleBack()).toBe('layer');
    expect(view).toBe('menu');
    expect(getState().page).toBe(PAGES.indexOf('設定'));
    expect(handleBack()).toBe('home');
  });

  it('頁面的二級頁上面開了疊層畫面：先關疊層畫面，不會誤關底下的二級頁', () => {
    let view = 'accounts';
    pushBackLayer(() => (view = 'menu')); // 在沒有疊層時登記
    openOverlay(entry);
    expect(handleBack()).toBe('overlay');
    expect(view).toBe('accounts');
    expect(handleBack()).toBe('layer');
    expect(view).toBe('menu');
  });

  it('疊層畫面裡開了兩層選單：先關最上面那層', () => {
    openOverlay(entry);
    const closed: string[] = [];
    const offA = pushBackLayer(() => { closed.push('A'); offA(); });
    const offB = pushBackLayer(() => { closed.push('B'); offB(); });
    handleBack();
    handleBack();
    expect(closed).toEqual(['B', 'A']);
    expect(getState().overlays.length).toBe(1);
  });
});
