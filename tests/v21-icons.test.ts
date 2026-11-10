// 2.1：圖示系統與資料第 7 版（帳戶 icon／iconStyle、分類 emoji → 圖示名稱）
import { describe, expect, it } from 'vitest';
import { exportJson, readBackup } from '../src/data/backup';
import { migrate } from '../src/data/migrate';
import { sampleData } from '../src/data/seed';
import { allBalances } from '../src/data/calc';
import { upsertAccount } from '../src/data/ops';
import { DATA_VERSION, type AppData } from '../src/data/types';
import { EMOJI_TO_ICON } from '../src/data/emojiIcons';
import {
  ACCOUNT_ICONS, ACCOUNT_KIND_ICON, CAPSULE_ICONS, CATEGORY_ICON_GROUPS, ICON_SVG, UI_ICONS, isIconName,
} from '../src/icons';
import { MISSING_ICON } from '../src/categoryStyle';

/** 模擬 2.0.2 的資料：版本 6、分類用 emoji、帳戶沒有 icon 欄位 */
function v6Data(): Record<string, unknown> {
  const d = sampleData(new Date(2026, 10, 10, 12));
  const accounts = d.accounts.map(({ icon: _i, iconStyle: _s, ...a }) => a);
  const emojis = ['🍞', '🍱', '🍙', '🧋', '🚌', '🧴', '🛍️', '🎮', '💊', '👻', '📱', '📦', '💰', '🎁', '📈', '🤝', '📦'];
  const categories = d.categories.map((c, i) => ({ ...c, icon: emojis[i] }));
  return { ...d, version: 6, accounts, categories };
}

describe('圖示清單', () => {
  it('選單、預設、膠囊、介面用到的圖示都有 SVG', () => {
    const all = [
      ...CATEGORY_ICON_GROUPS.flatMap((g) => g.icons), ...ACCOUNT_ICONS, ...Object.values(ACCOUNT_KIND_ICON),
      ...Object.values(CAPSULE_ICONS), ...Object.values(UI_ICONS), MISSING_ICON,
    ];
    for (const n of all) expect(ICON_SVG[n], n).toBeTruthy();
    expect(CATEGORY_ICON_GROUPS).toHaveLength(16);
    for (const n of ['cuffs', 'collar', 'rope', 'whip', 'paddle', 'candle', 'belt']) expect(isIconName(n)).toBe(true);
  });

  it('emoji 對照表的每個目標都是存在的圖示', () => {
    for (const [e, n] of Object.entries(EMOJI_TO_ICON)) expect(isIconName(n), `${e} → ${n}`).toBe(true);
  });
});

describe('資料第 6 版 → 第 7 版', () => {
  it('分類 emoji 換成圖示名稱，對不到的保留原 emoji；帶不帶變體符號都對得到', () => {
    const d = migrate(v6Data());
    expect(d.version).toBe(DATA_VERSION);
    const icons = d.categories.map((c) => c.icon);
    expect(icons[0]).toBe('croissant');
    expect(icons[1]).toBe('utensils');
    expect(icons[2]).toBe('🍙'); // 對不到：原樣保留
    expect(icons[6]).toBe('shopping-bag'); // 🛍️ 帶變體符號
    expect(icons[9]).toBe('👻'); // 對不到：原樣保留
    expect(icons[12]).toBe('banknote-arrow-up');
  });

  it('帳戶補上種類預設圖示、顯示方式為圖示', () => {
    const d = migrate(v6Data());
    for (const a of d.accounts) {
      expect(a.icon).toBe(ACCOUNT_KIND_ICON[a.kind]);
      expect(a.iconStyle).toBe('icon');
    }
  });

  it('升版前後：帳戶、分類數量、紀錄、餘額完全一致', () => {
    const raw = v6Data() as unknown as AppData;
    const d = migrate(v6Data());
    expect(d.transactions).toEqual(raw.transactions);
    expect(d.accounts.map((a) => [a.id, a.name, a.kind, a.initialBalance, a.order])).toEqual(
      raw.accounts.map((a) => [a.id, a.name, a.kind, a.initialBalance, a.order]),
    );
    expect(d.categories.map((c) => [c.id, c.name, c.color])).toEqual(raw.categories.map((c) => [c.id, c.name, c.color]));
    expect([...allBalances(d)]).toEqual([...allBalances(raw)]);
  });

  it('第 6 版完整備份與「只有設定」備份都能匯入', () => {
    const full = readBackup(JSON.stringify({ app: 'ledger-app', type: 'full', fileVersion: 2, data: v6Data() }));
    expect(full.data.version).toBe(DATA_VERSION);
    const { transactions: _t, ...settingsOnly } = v6Data();
    const st = readBackup(JSON.stringify({ app: 'ledger-app', type: 'settings', fileVersion: 2, data: settingsOnly }));
    expect(st.type).toBe('settings');
    expect(st.data.accounts.every((a) => isIconName(a.icon))).toBe(true);
    expect(st.data.categories[1].icon).toBe('utensils');
  });
});

describe('資料第 7 版', () => {
  function v7(): AppData {
    const d = migrate(v6Data());
    d.accounts[1] = { ...d.accounts[1], iconStyle: 'badge' };
    d.accounts[2] = { ...d.accounts[2], icon: 'building-2' };
    d.categories[3] = { ...d.categories[3], icon: 'cuffs' };
    return d;
  }

  it('完整備份匯出再匯入完全一致（含徽章、自選圖示、自繪圖示、保留的 emoji）', () => {
    const d = v7();
    const back = readBackup(exportJson(d, 'full'));
    expect(back.data).toEqual(d);
    expect(readBackup(exportJson(back.data as AppData, 'full')).data).toEqual(d);
  });

  it('只匯出設定也帶 icon 與 iconStyle', () => {
    const d = v7();
    const obj = JSON.parse(exportJson(d, 'settings'));
    expect(obj.data.accounts[1].iconStyle).toBe('badge');
    expect(obj.data.accounts[2].icon).toBe('building-2');
    expect(obj.data.categories[3].icon).toBe('cuffs');
    const { transactions: _t, ...rest } = d;
    expect(readBackup(JSON.stringify(obj)).data).toEqual(rest);
  });

  it('缺 icon、圖示名稱不認得、顯示方式亂填時用預設；分類缺圖示補問號', () => {
    const d = v7();
    const { icon: _i, ...noIcon } = d.accounts[0];
    const raw = {
      ...d,
      accounts: [noIcon, { ...d.accounts[1], icon: 'no-such-icon', iconStyle: 'weird' }, ...d.accounts.slice(2)],
      categories: [{ ...d.categories[0], icon: '' }, ...d.categories.slice(1)],
    };
    const m = migrate(raw);
    expect(m.accounts[0].icon).toBe(ACCOUNT_KIND_ICON[m.accounts[0].kind]);
    expect(m.accounts[1].icon).toBe(ACCOUNT_KIND_ICON[m.accounts[1].kind]);
    expect(m.accounts[1].iconStyle).toBe('icon');
    expect(m.categories[0].icon).toBe(MISSING_ICON);
  });

  it('新增帳戶沒選圖示：依種類補預設', () => {
    const d = upsertAccount(v7(), { id: 'a-new', name: '新錢包', kind: 'ewallet', initialBalance: 0, order: 9 });
    const a = d.accounts.find((x) => x.id === 'a-new')!;
    expect(a.icon).toBe('wallet');
    expect(a.iconStyle).toBe('icon');
  });
});
