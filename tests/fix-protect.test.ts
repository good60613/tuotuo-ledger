// 2.0 修正批第一段：讀檔失敗保護＋自動留底。工單驗證 1～6，另加留底份數與真實儲存層。
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { boot, ensureDailySnapshot, loadSnapshotData, replaceWithSnapshot, takeSnapshot, type Storage } from '../src/data/boot';
import { makeSnapshot, metaOf, prunePlan, type Snapshot } from '../src/data/snapshots';
import { allBalances, periodKey, spendableTotal, totals } from '../src/data/calc';
import { addTransaction } from '../src/data/ops';
import { emptyData, sampleData, blankData } from '../src/data/seed';
import { DATA_VERSION, type AppData } from '../src/data/types';
import * as device from '../src/data/storage';

const NOW = new Date(2026, 10, 10, 9, 0);

/** 記憶體裡的假手機儲存，可以模擬各種失敗 */
function memStorage(initial: unknown = null) {
  const s = {
    main: initial === null ? null : JSON.parse(JSON.stringify(initial)),
    snaps: new Map<string, Snapshot>(),
    locked: true,
    failLoad: false,
    failSnapshot: false,
    writes: 0,
  };
  const st: Storage = {
    async loadRaw() {
      if (s.failLoad) throw new Error('模擬讀取失敗');
      return s.main;
    },
    async saveData(d) {
      if (s.locked) throw new Error('資料保護中，沒有存檔');
      s.writes++;
      s.main = JSON.parse(JSON.stringify(d));
    },
    setWriteLock(l) {
      s.locked = l;
    },
    async listSnapshots() {
      return [...s.snaps.values()].map(metaOf);
    },
    async getSnapshot(id) {
      return s.snaps.get(id);
    },
    async addSnapshot(x) {
      if (s.failSnapshot) throw new Error('模擬留底失敗');
      s.snaps.set(x.id, JSON.parse(JSON.stringify(x)));
    },
    async deleteSnapshots(ids) {
      ids.forEach((id) => s.snaps.delete(id));
    },
  };
  return { s, st };
}

/** 一本有內容的帳：現金 10,000，記一筆支出 300 */
function ledger(): AppData {
  const d = emptyData();
  d.accounts = [{ id: 'cash', name: '現金', kind: 'bank', initialBalance: 10000, order: 0 }];
  return addTransaction(d, { type: 'expense', amount: 300, accountId: 'cash', categoryId: 'c-e1', occurredAt: new Date(2026, 10, 9, 12).toISOString() }).data;
}

const numbers = (d: AppData) => ({
  cash: allBalances(d).get('cash'),
  left: spendableTotal(d, NOW),
  month: totals(d, { period: periodKey(NOW, d.settings.settleDay) }).expense,
});

describe('讀檔失敗保護（工單驗證）', () => {
  it('1. 讀取失敗：進保護狀態，不載入範例、不寫入；之後存檔都被擋', async () => {
    const { s, st } = memStorage(ledger());
    s.failLoad = true;
    const r = await boot(st, NOW);
    expect(r.kind).toBe('blocked');
    if (r.kind === 'blocked') expect(r.reason).toBe('read');
    expect(s.writes).toBe(0);
    // 畫面若還是想存（例如記帳）：一律失敗，原本的帳本不變
    await expect(st.saveData(sampleData(NOW))).rejects.toThrow('資料保護中');
    expect(s.main.transactions).toHaveLength(1);
    expect(s.main.accounts[0].id).toBe('cash');
  });

  it('2. 第一次使用（手機上沒有資料、也沒有留底）：正常載入範例並存檔，不誤判', async () => {
    const { s, st } = memStorage(null);
    const r = await boot(st, NOW);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.firstRun).toBe(true);
    expect(s.writes).toBe(1);
    expect(s.locked).toBe(false);
  });

  it('2b. 沒有主資料、但有留底（資料被清掉，不是第一次用）：進保護狀態，不自動換成範例', async () => {
    const { s, st } = memStorage(null);
    await takeSnapshot(st, ledger(), 'daily', NOW, 'x1');
    const r = await boot(st, NOW);
    expect(r.kind).toBe('blocked');
    if (r.kind === 'blocked') expect(r.reason).toBe('missing');
    expect(s.writes).toBe(0);
  });

  it('3. 升級中途出錯：原本的資料沒被改，升級前留了一份；可從之前的留底還原', async () => {
    const good = ledger();
    const { s, st } = memStorage(good);
    await ensureDailySnapshot(st, good, new Date(2026, 10, 9, 8)); // 前一天的每日留底
    // 之後資料被弄壞：版本是舊的、但內容缺欄位，升級會失敗
    const broken = { version: 4, accounts: [], categories: null, noteTags: [], transactions: [], settings: {} };
    s.main = broken;
    const r = await boot(st, NOW);
    expect(r.kind).toBe('blocked');
    if (r.kind === 'blocked') expect(r.reason).toBe('upgrade');
    expect(s.main).toEqual(broken); // 沒有被改動
    const metas = await st.listSnapshots();
    expect(metas.some((m) => m.reason === 'pre-upgrade' && m.version === 4)).toBe(true);
    // 從前一天的留底還原
    const daily = metas.find((m) => m.reason === 'daily')!;
    const restored = await loadSnapshotData(st, daily.id);
    await replaceWithSnapshot(st, r.kind === 'blocked' ? r.raw : null, restored, 'pre-restore', NOW);
    expect(numbers(s.main)).toEqual(numbers(good));
    // 壞掉的那份也留下來了（之後還能救）
    expect((await st.listSnapshots()).some((m) => m.reason === 'pre-restore')).toBe(true);
  });

  it('3b. 正常升級：升級前留一份原樣，升級後存檔', async () => {
    const old = { ...ledger(), version: 5 } as unknown as AppData;
    delete (old as Partial<AppData>).recurring;
    const { s, st } = memStorage(old);
    const r = await boot(st, NOW);
    expect(r.kind).toBe('ok');
    expect(s.main.version).toBe(DATA_VERSION);
    const pre = (await st.listSnapshots()).find((m) => m.reason === 'pre-upgrade')!;
    expect(pre.version).toBe(5);
    expect((await st.getSnapshot(pre.id))!.data).toEqual(JSON.parse(JSON.stringify(old)));
  });

  it('4. 資料版本比 App 新：進保護狀態，不降版、不寫入', async () => {
    const newer = { ...ledger(), version: DATA_VERSION + 1 };
    const { s, st } = memStorage(newer);
    const r = await boot(st, NOW);
    expect(r.kind).toBe('blocked');
    if (r.kind === 'blocked') {
      expect(r.reason).toBe('newer');
      expect(r.message).toContain(`資料版本 ${DATA_VERSION + 1}`);
    }
    expect(s.writes).toBe(0);
    expect(s.main.version).toBe(DATA_VERSION + 1);
  });
});

describe('自動留底（工單驗證）', () => {
  it('5. 還原留底後：帳戶餘額、剩餘可用、本月支出和留底當時一樣', async () => {
    const at = ledger();
    const { s, st } = memStorage(at);
    await boot(st, NOW); // 今天第一次開：留每日留底
    const daily = (await st.listSnapshots()).find((m) => m.reason === 'daily')!;
    expect(daily.transactions).toBe(1);
    // 之後又記了一筆 5,000
    const later = addTransaction(at, { type: 'expense', amount: 5000, accountId: 'cash', categoryId: 'c-e1', occurredAt: NOW.toISOString() }).data;
    await st.saveData(later);
    expect(numbers(s.main).cash).toBe(4700);
    // 還原：先把目前資料再留一份，再寫回留底那份
    const restored = await loadSnapshotData(st, daily.id);
    await replaceWithSnapshot(st, later, restored, 'pre-restore', NOW);
    expect(numbers(s.main)).toEqual(numbers(at));
    expect(numbers(s.main)).toEqual({ cash: 9700, left: 9700, month: 300 });
    // 反悔：剛剛被蓋掉的那份也在
    const pre = (await st.listSnapshots()).find((m) => m.reason === 'pre-restore')!;
    expect(numbers(await loadSnapshotData(st, pre.id)).cash).toBe(4700);
  });

  it('6. 會蓋掉資料的操作（清空、載入範例、匯入取代），執行前都先留一份；留底失敗就不執行', async () => {
    const cur = ledger();
    const { s, st } = memStorage(cur);
    await boot(st, NOW);
    for (const [next, reason] of [
      [blankData(), 'pre-clear-all'],
      [sampleData(NOW), 'pre-sample'],
      [ledger(), 'pre-import'],
      [{ ...ledger(), transactions: [] }, 'pre-clear-records'],
    ] as const) {
      const before = JSON.parse(JSON.stringify(s.main));
      await replaceWithSnapshot(st, before, next as AppData, reason, NOW);
      const snap = (await st.listSnapshots()).find((m) => m.reason === reason)!;
      expect((await st.getSnapshot(snap.id))!.data).toEqual(before);
    }
    // 留底失敗：不取代
    const kept = JSON.parse(JSON.stringify(s.main));
    s.failSnapshot = true;
    await expect(replaceWithSnapshot(st, kept, blankData(), 'pre-clear-all', NOW)).rejects.toThrow('自動存檔失敗');
    expect(s.main).toEqual(kept);
  });

  it('每日留底一天只留一份；份數超過上限刪最舊的（每日 7、事件 5 各自算）', async () => {
    const { st } = memStorage(ledger());
    for (let i = 0; i < 10; i++) {
      const day = new Date(2026, 10, 1 + i, 8);
      expect(await ensureDailySnapshot(st, ledger(), day)).toBe(true);
      expect(await ensureDailySnapshot(st, ledger(), new Date(2026, 10, 1 + i, 20))).toBe(false);
    }
    for (let i = 0; i < 8; i++) await takeSnapshot(st, ledger(), 'pre-import', new Date(2026, 10, 10, 10, i));
    const list = await st.listSnapshots();
    expect(list.filter((m) => m.reason === 'daily')).toHaveLength(7);
    expect(list.filter((m) => m.reason !== 'daily')).toHaveLength(5);
    // 留下的是最新的 7 天（11/4～11/10）
    expect(list.filter((m) => m.reason === 'daily').map((m) => m.at).sort()[0]).toBe(new Date(2026, 10, 4, 8).toISOString());
  });

  it('留底是深拷貝：之後主資料怎麼改都不影響', () => {
    const d = ledger();
    const snap = makeSnapshot(d, 'daily', NOW, 'a');
    d.transactions[0].amount = 9999;
    expect((snap.data as AppData).transactions[0].amount).toBe(300);
    expect(prunePlan([metaOf(snap)])).toEqual([]);
  });
});

describe('真實儲存層（模擬手機資料庫）', () => {
  it('開啟前預設鎖住：沒讀檔成功前存不進去；留底存在另一個資料庫、主資料被清掉也還在', async () => {
    device.setWriteLock(true);
    await expect(device.saveData(ledger())).rejects.toThrow('資料保護中');
    expect(await device.loadRaw()).toBeNull();

    const r = await boot(device.deviceStorage, NOW);
    expect(r.kind).toBe('ok'); // 第一次使用
    await device.saveData(ledger());
    await takeSnapshot(device.deviceStorage, ledger(), 'pre-import', NOW, 'snap-1');
    expect((await device.getSnapshot('snap-1'))!.transactions).toBe(1);

    // 主資料庫整個被清掉（例如系統清除）：留底還在，下次開啟進保護狀態而不是換成範例
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('ledger-app', 1);
      req.onsuccess = () => {
        const tx = req.result.transaction('kv', 'readwrite');
        tx.objectStore('kv').clear();
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      };
    });
    const again = await boot(device.deviceStorage, NOW);
    expect(again.kind).toBe('blocked');
    if (again.kind === 'blocked') expect(again.reason).toBe('missing');
    await expect(device.saveData(sampleData(NOW))).rejects.toThrow('資料保護中');
    expect((await loadSnapshotData(device.deviceStorage, 'snap-1')).transactions).toHaveLength(1);
  });
});
