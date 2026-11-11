// 2.2 D 段：設定「首頁使用」放進完整備份與只匯出設定；舊備份沒有這欄＝帳戶頁
import { describe, expect, it } from 'vitest';
import { exportJson, readBackup } from '../src/data/backup';
import { sampleData } from '../src/data/seed';
import { detailHome } from '../src/features';
import { pageOrder, navLabel } from '../src/store';

describe('首頁使用', () => {
  it('完整備份、只匯出設定都帶著這個欄位', () => {
    const d = sampleData();
    d.settings = { ...d.settings, homePage: 'detail' };
    for (const type of ['full', 'settings'] as const) {
      const r = readBackup(exportJson(d, type));
      expect(r.type).toBe(type);
      expect(detailHome(r.data.settings)).toBe(true);
    }
  });
  it('舊備份沒有這個欄位：照常匯入，用預設的帳戶頁', () => {
    const d = sampleData();
    const { homePage: _h, ...old } = d.settings;
    const r = readBackup(exportJson({ ...d, settings: old }, 'full'));
    expect(detailHome(r.data.settings)).toBe(false);
    expect(pageOrder(r.data.settings)).toEqual(['待辦', '統計', '首頁', '明細', '設定']);
  });
  it('選明細頁：明細到中間叫首頁、原首頁叫帳戶放第四格', () => {
    const s = { ...sampleData().settings, homePage: 'detail' as const };
    expect(pageOrder(s)).toEqual(['待辦', '統計', '明細', '首頁', '設定']);
    expect(pageOrder(s).map((id) => navLabel(id, s))).toEqual(['待辦', '統計', '首頁', '帳戶', '設定']);
  });
});
