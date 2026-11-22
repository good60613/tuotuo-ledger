// 設定（右二）：只放讓其他功能能運作的項目。
import { advanceOwedOn, recurringOn, glassOn, detailHome, prevBalanceOn, notifBarOn, notifHideLockOn, entryAccountMode, dailyAvgOn } from '../features';
import type { ComponentChildren } from 'preact';
import type { Settings } from '../data/types';
import { fontById, DEFAULT_APP_FONT } from '../fonts';
import { FontPicker, confirmAndDownload } from '../components/FontPicker';
import { checkImport, importSummary, normalizeImport, AI_PROMPT } from '../data/aiImport';
import { copyText, shareToAi } from '../aiShare';
import { scrollInPage } from '../scrollInPage';
import { HelpPage } from '../components/HelpPage';
import { requestNotifPermission, isNative, setAppIcon } from '../widget';
import { RecurringPanel } from './RecurringSettings';
import { useEffect, useRef, useState } from 'preact/hooks';
import { COINS, coinLabel, type CoinId } from '../coins';
import { getAppVersion } from '../appVersion';
import { checkUpdateNow } from '../updateFlow';

/** 2.5 拖拖硬幣：一排可點的硬幣（auto＝多一個「自動」＝跟著心情換）。2.6 起放在第二層彈窗裡 */
function CoinStrip({ value, onPick, auto, note }: { value: string; onPick: (v: string) => void; auto?: boolean; note?: string }) {
  return (
    <div class="coin-pick">
      <div class="coin-strip wrap">
        {auto && (
          <button class={`coin-opt auto${value === 'auto' ? ' on' : ''}`} onClick={() => onPick('auto')}>
            自動
          </button>
        )}
        {COINS.map((c) => (
          <button key={c.id} class={`coin-opt${value === c.id ? ' on' : ''}`} onClick={() => onPick(c.id)} aria-label={c.label}>
            <img src={c.src} alt="" />
          </button>
        ))}
      </div>
      {note && <p class="muted small">{note}</p>}
    </div>
  );
}

const coinText = (v: string) => (v === 'auto' ? '跟著心情換' : coinLabel(v as CoinId));

/** 2.6 開／關按鈕框（樣式同「外觀：亮色／暗色／跟隨系統」） */
function OnOff({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div class="mini-seg">
      <button class={on ? 'on' : ''} onClick={() => !on && onChange(true)}>開</button>
      <button class={on ? '' : 'on'} onClick={() => on && onChange(false)}>關</button>
    </div>
  );
}

/** 2.6 一列：名稱（可加一行小字說明）＋右邊的按鈕框 */
function Row({ label, note, children }: { label: string; note?: string; children: ComponentChildren }) {
  return (
    <div class="setting-row">
      <span class="row-label">
        {label}
        {note && <span class="muted small row-note">{note}</span>}
      </span>
      {children}
    </div>
  );
}
import { useBackLayer } from '../backNav';
import { PAGES } from '../store';
import { useAppState, getState, updateData, showToast, ask, confirmDanger, setState, replaceData, goPage, pageIndex } from '../store';
import {
  byOrder, reorder, uid, upsertAccount, removeAccount, countAccountRecords,
  removeCategory, countCategoryRecords, OpError, editAccount, moveTargets,
} from '../data/ops';
import { SMALL_KINDS, KIND_LABEL, type Account, type AccountKind, type Category, type CategoryType } from '../data/types';
import { allBalances } from '../data/calc';
import { accountName, accountsOfKind, bankAccounts, categoriesOf } from '../selectors';
import { ACCOUNT_KIND_ICON } from '../icons';
import LUCIDE_LICENSE from '../../LICENSE-lucide.txt?raw';
import { applySettingsImport, checkSettingsImport, exportJson, readBackup, saveBackupFile, type SettingsImportMapping } from '../data/backup';
import { sampleData, blankData } from '../data/seed';
import { clearRecords } from '../data/reset';
import type { SnapshotReason } from '../data/snapshots';
import { SnapshotList } from '../components/SnapshotList';
import { Sheet } from '../components/Sheet';
import { AccountPicker } from '../components/AccountPicker';
import { CategoryForm, TagManager } from '../components/Editors';
import { CatIcon } from '../components/CatIcon';
import { Sortable, TRASH_ID, type DragState } from '../gestures/Sortable';
import { sortedCategories } from '../data/notes';

/** 拖曳中的樣式：拿起的那格、手指底下那格 */
const dragCls = (id: string, drag: DragState | null) =>
  !drag ? '' : drag.id === id ? ' lifted' : drag.over === id ? ' over' : '';
import { money } from '../format';
import { pinnedCount } from '../data/notes';
import { SETTLE, ICON } from '../config';
import { AccountIcon } from '../components/AccountIcon';
import { Icon } from '../components/Icon';
import { ACCOUNT_ICONS, ICON_LABELS } from '../icons';
import { accountIconOf, accountIconStyleOf } from '../categoryStyle';
import { carrierError, isValidCarrier, normalizeCarrier } from '../data/carrier';
import { Barcode } from '../components/Barcode';
import { applyTheme, themeOf, resolveTheme, THEME_LABEL, type ThemeMode } from '../theme';
import { applyUiStyle, styleOf } from '../uiStyle';
import { StylePicker } from '../components/StylePicker';
import { WhatsNew } from '../whatsNew';

/** 可以有多個帳戶的小帳戶類型（其他類型固定一個） */
const MULTI_KINDS: AccountKind[] = ['ewallet', 'invest', 'saving', 'other'];

/** 設定目錄的項目（首頁只列項目，點了才進入子頁） */
type View = 'menu' | 'accounts' | 'small' | 'categories' | 'recurring' | 'backup' | 'demo' | 'help';

type SheetState =
  | null
  | { k: 'account'; kind: AccountKind; existing?: Account }
  | { k: 'category'; type: CategoryType; existing?: Category }
  | { k: 'tags' }
  | { k: 'license' }
  | { k: 'defaultReimb' }
  | { k: 'settle' }
  | { k: 'carrier' }
  | { k: 'moveAccount'; from: Account }
  | { k: 'moveCategory'; from: Category }
  | { k: 'snapshots' }
  | { k: 'whatsNew' }
  | { k: 'font' }
  | { k: 'coin'; which: 'coinHome' | 'coinWidget' | 'appIcon' };

export function SettingsPage() {
  const s = useAppState();
  const d = s.data;
  const bal = allBalances(d);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [view, setView] = useState<View>('menu');
  // 在設定的二級頁按返回：回到設定目錄
  useBackLayer(s.page === PAGES.indexOf('設定') && view !== 'menu', () => setView('menu'));
  const [catType, setCatType] = useState<CategoryType>('expense');
  const fileRef = useRef<HTMLInputElement>(null);
  // 3.0 從其他軟體匯入：選好的舊 App 檔案
  const oldRef = useRef<HTMLInputElement>(null);
  const [oldFiles, setOldFiles] = useState<File[]>([]);
  // App 圖示只有 APK 版能換
  const [native, setNative] = useState(false);
  useEffect(() => {
    isNative().then(setNative);
  }, []);
  // 3.0 版本號：APK 版讀 Android 的 versionName；網頁版（開發用）顯示「網頁版」
  const [appVersion, setAppVersion] = useState('');
  useEffect(() => {
    // 3.3 版本號來源改在 src/appVersion.ts（更新檢查共用）
    getAppVersion().then((v) => setAppVersion(v ? `v${v}` : '網頁版')).catch(() => setAppVersion(''));
  }, []);

  // 3.0：別頁要求打開某個畫面（教學、首頁範例提示）
  useEffect(() => {
    const it = s.settingsIntent;
    if (!it) return;
    setState({ settingsIntent: null });
    if (it === 'add-account') {
      setView('accounts');
      setSheet({ k: 'account', kind: 'bank' });
    } else if (it === 'import-other') {
      setView('backup');
      setTimeout(() => { const el = document.getElementById('import-other'); if (el) scrollInPage(el, 'start', true); }, 350);
    } else if (it === 'help') {
      setView('help');
    }
  }, [s.settingsIntent]);

  /** 改一個或幾個設定值 */
  const setSetting = (patch: Partial<Settings>) => updateData((x) => ({ ...x, settings: { ...x.settings, ...patch } }));

  // 2.6 字體：appFont 有值且不是 system＝用 App 字體
  const fontOn = !!fontById(d.settings.appFont);
  const useAppFont = async () => {
    const f = fontById(DEFAULT_APP_FONT)!;
    if (await confirmAndDownload(f)) setSetting({ appFont: f.id });
  };

  /** 圖示第二層：選好就關掉回第一層 */
  const pickCoin = async (which: 'coinHome' | 'coinWidget' | 'appIcon', v: string) => {
    if (which === 'appIcon') {
      if (v !== (d.settings.appIcon ?? 'original')) {
        if (!(await setAppIcon(v))) {
          showToast('換圖示失敗');
          return;
        }
        setSetting({ appIcon: v });
        showToast(`App 圖示換成「${coinLabel(v as CoinId)}」`);
      }
    } else {
      setSetting({ [which]: v });
    }
    setSheet(null);
  };

  const sortAccounts = (ids: string[]) => updateData((x) => ({ ...x, accounts: reorder(x.accounts, ids) }));
  const sortCategories = (ids: string[]) => updateData((x) => ({ ...x, categories: reorder(x.categories, ids) }));
  const toggleAutoSort = async (on: boolean) => {
    if (on && !(await confirmDanger('開啟自動排序？', '自動排序會打亂現在的排序，確定要嗎？\n關掉後會回到你現在的手動排序。', '開啟'))) return;
    updateData((x) => ({ ...x, settings: { ...x.settings, autoSortCategories: on } }));
  };

  // ---- 刪除帳戶 ----
  const deleteAccount = async (a: Account) => {
    const n = countAccountRecords(d, a.id);
    if (n === 0) {
      if (await confirmDanger(`刪除「${a.name}」？`, '這個帳戶沒有任何紀錄。')) {
        updateData((x) => removeAccount(x, a.id, { mode: 'deleteRecords' }));
        showToast('已刪除帳戶');
      }
      return;
    }
    // 紀錄只能移到同種類帳戶；沒有同種類的就不提供「移過去」
    const canMove = moveTargets(d, a.id).length > 0;
    const kindName = a.kind === 'invest' ? (a.subtype === 'holding' ? '投資標的' : '待投入') : KIND_LABEL[a.kind];
    const v = await ask(
      `「${a.name}」底下有 ${n} 筆紀錄`,
      canMove
        ? `要怎麼處理這些紀錄？\n紀錄只能移到同種類（${kindName}）的帳戶。`
        : `要怎麼處理這些紀錄？\n沒有其他${kindName}帳戶可以移過去（紀錄只能移到同種類，避免本月支出、剩餘可用跟著變）。`,
      [
        ...(canMove ? [{ label: '紀錄移到另一個帳戶', value: 'move', style: 'primary' as const }] : []),
        { label: '連同紀錄一起刪除', value: 'del', style: 'danger' },
        { label: '取消', value: 'no', style: 'secondary' },
      ],
    );
    if (v === 'move') setSheet({ k: 'moveAccount', from: a });
    else if (v === 'del') {
      // 第二次確認
      if (await confirmDanger('真的要連同紀錄一起刪除？', `「${a.name}」和底下 ${n} 筆紀錄都會刪除，無法復原。\n相關的報帳批次會自動調整。`, '確定刪除')) {
        updateData((x) => removeAccount(x, a.id, { mode: 'deleteRecords' }));
        showToast(`已刪除「${a.name}」和 ${n} 筆紀錄`);
      }
    }
  };

  // ---- 刪除分類 ----
  const deleteCategory = async (c: Category) => {
    const n = countCategoryRecords(d, c.id);
    if (n === 0) {
      if (await confirmDanger(`刪除分類「${c.name}」？`, '這個分類沒有任何紀錄。')) {
        updateData((x) => removeCategory(x, c.id, { mode: 'deleteRecords' }));
      }
      return;
    }
    const v = await ask(`「${c.name}」底下有 ${n} 筆紀錄`, '要怎麼處理這些紀錄？', [
      { label: '紀錄移到另一個分類', value: 'move', style: 'primary' },
      { label: '連同紀錄一起刪除', value: 'del', style: 'danger' },
      { label: '取消', value: 'no', style: 'secondary' },
    ]);
    if (v === 'move') setSheet({ k: 'moveCategory', from: c });
    else if (v === 'del') {
      if (await confirmDanger('真的要連同紀錄一起刪除？', `「${c.name}」和底下 ${n} 筆紀錄都會刪除，帳戶餘額會跟著改變，無法復原。`, '確定刪除')) {
        updateData((x) => removeCategory(x, c.id, { mode: 'deleteRecords' }));
        showToast(`已刪除「${c.name}」和 ${n} 筆紀錄`);
      }
    }
  };

  // ---- 備份 ----
  const doExport = (type: 'full' | 'settings') => {
    const stamp = new Date().toISOString().slice(0, 10);
    const name = type === 'full' ? `記帳備份-${stamp}.json` : `記帳設定-${stamp}.json`;
    saveBackupFile(name, exportJson(getState().data, type))
      .then((msg) => msg && showToast(msg))
      .catch(() => showToast('匯出失敗'));
  };
  const resetFilters = { detail: { accountId: null, categoryId: null, day: null, period: null }, statsAccountId: null, statsPeriod: null, statsMode: 'month' as const, statsYear: null, statsCustom: null };
  const doImport = async (file: File) => {
    try {
      const parsed = readBackup(await file.text());
      if (parsed.type === 'full') {
        // 3.0：先檢查（AI 做的檔案可能有錯），錯誤可以複製貼回給 AI；自己匯出的備份一定通過
        const errs = checkImport(parsed.data);
        if (errs.length > 0) {
          const v = await ask('這個檔案有問題', `${errs.slice(0, 6).join('\n')}${errs.length > 6 ? `\n…共 ${errs.length} 個問題` : ''}\n\n如果是 AI 做的檔案：按〔複製錯誤〕貼給 AI，請它修正後重新給你檔案。`, [
            { label: '複製錯誤', value: 'copy', style: 'primary' },
            { label: '取消', value: 'no', style: 'secondary' },
            { label: '仍要匯入', value: 'force', style: 'danger' },
          ]);
          if (v === 'copy') {
            const ok = await copyText(`拖拖記帳匯入時出現這些錯誤，請修正後重新給我完整的 .json 檔：\n${errs.join('\n')}`);
            showToast(ok ? '已複製，貼給 AI 就好' : '複製失敗');
            return;
          }
          if (v !== 'force') return;
        }
        const next = normalizeImport({ ...parsed.data, settings: { ...parsed.data.settings, sample: false } });
        const ok = await confirmDanger(
          '用這個檔案取代目前資料？',
          `匯入後：\n${importSummary(next)}\n\n請跟原本的 App 核對金額。目前手機上的資料會被整個取代（會先自動存檔）。`,
          '取代',
        );
        if (!ok) return;
        await replaceData(next, 'pre-import');
        setState({ ...resetFilters });
        showToast('已從備份還原（原本的資料已自動存檔）');
        return;
      }
      // 只有設定：紀錄保留，找不到的帳戶、分類一個一個問要移到哪裡
      const cur = getState().data;
      const inc = parsed.data;
      const check = checkSettingsImport(cur, inc);
      const mapping: SettingsImportMapping = { accounts: {}, categories: {} };
      const total = check.missingAccounts.length + check.missingCategories.length;
      if (total > 0) {
        const lines = [
          ...check.missingAccounts.map((m) => `・帳戶「${m.name}」：${m.count} 筆`),
          ...check.missingCategories.map((m) => `・分類「${m.name}」：${m.count} 筆`),
        ];
        const go = await ask(
          '有紀錄對不上新設定',
          `下面這些帳戶或分類在新設定裡找不到，但現有紀錄還在用：\n${lines.join('\n')}\n\n要匯入的話，需要一個一個選紀錄要移到哪裡。不會直接刪除紀錄。`,
          [
            { label: '取消匯入', value: 'no', style: 'secondary' },
            { label: '逐一選擇去處', value: 'yes' },
          ],
        );
        if (go !== 'yes') return;
        for (const m of check.missingAccounts) {
          if (m.candidates.length === 0) {
            await ask('沒有可以移過去的帳戶', `新設定裡沒有跟「${m.name}」同種類的帳戶，這次無法匯入。`, [{ label: '知道了', value: 'ok' }]);
            return;
          }
          const v = await ask(`「${m.name}」的 ${m.count} 筆紀錄要移到哪個帳戶？`, undefined, [
            ...m.candidates.map((a) => ({ label: a.name, value: a.id, style: 'secondary' as const })),
            { label: '取消匯入', value: '__cancel', style: 'danger' },
          ]);
          if (!v || v === '__cancel') return;
          mapping.accounts[m.id] = v;
        }
        for (const m of check.missingCategories) {
          if (m.candidates.length === 0) {
            await ask('沒有可以移過去的分類', `新設定裡沒有${m.type === 'income' ? '收入' : '支出'}分類，這次無法匯入。`, [{ label: '知道了', value: 'ok' }]);
            return;
          }
          const v = await ask(`「${m.name}」的 ${m.count} 筆紀錄要移到哪個分類？`, undefined, [
            ...m.candidates.map((c) => ({ label: `${c.icon} ${c.name}`, value: c.id, style: 'secondary' as const })),
            { label: '取消匯入', value: '__cancel', style: 'danger' },
          ]);
          if (!v || v === '__cancel') return;
          mapping.categories[m.id] = v;
        }
      }
      const { data: next, removedSelfTransfers } = applySettingsImport(cur, inc, mapping);
      const ok = await confirmDanger(
        '只取代設定？',
        `帳戶、小帳戶、分類、備註標籤、結算日等會換成備份檔裡的（${inc.accounts.length} 個帳戶、${inc.categories.length} 個分類）。\n` +
          `現有的 ${next.transactions.length} 筆紀錄保留${total > 0 ? '，對不上的已照你選的移過去' : ''}。` +
          (removedSelfTransfers > 0 ? `\n其中 ${removedSelfTransfers} 筆轉帳移完後變成「自己轉給自己」，會移除。` : '') +
          '\n建議先匯出一份完整備份。',
        '取代設定',
      );
      if (!ok) return;
      await replaceData(next, 'pre-settings-import');
      setState({ ...resetFilters });
      showToast('已匯入設定，紀錄保留');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '匯入失敗');
    }
  };
  /** 第一步確認：取消／先匯出完整備份／繼續。回傳 true＝繼續 */
  const firstConfirm = async (title: string, body: string, okLabel: string): Promise<boolean> => {
    const v = await ask(title, body, [
      { label: '先匯出完整備份', value: 'export', style: 'secondary' },
      { label: okLabel, value: 'yes', style: 'danger' },
      { label: '取消', value: 'no', style: 'secondary' },
    ]);
    if (v === 'export') doExport('full');
    return v === 'yes';
  };
  /** 清空、載入範例：先自動存檔（失敗就不執行），再取代 */
  const applyReset = async (next: (x: typeof d) => typeof d, reason: SnapshotReason, msg: string) => {
    try {
      await replaceData(next(getState().data), reason);
    } catch (e) {
      showToast(e instanceof Error ? e.message : '處理失敗');
      return;
    }
    setState({ ...resetFilters });
    showToast(msg);
  };
  const loadSample = async () => {
    if (!(await firstConfirm(
      '載入範例資料？',
      '目前的帳戶和設定都會被蓋掉，紀錄也會全部換成範例資料，無法復原。\n建議先匯出完整備份。',
      '繼續',
    ))) return;
    if (!(await confirmDanger('再確認一次', '帳戶和設定都會被蓋掉，整個換成範例資料。確定嗎？', '換成範例'))) return;
    await applyReset(() => sampleData(), 'pre-sample', '已載入範例資料（原本的資料已自動存檔）');
  };
  const clearRecordsOnly = async () => {
    const n = getState().data.transactions.length;
    if (!(await firstConfirm(
      '清空紀錄？',
      `會刪除全部 ${n} 筆記帳紀錄（含校正、報帳、轉帳），無法復原。\n帳戶、小帳戶、分類、備註標籤、結算日等設定都會保留，帳戶金額回到初始餘額。\n建議先匯出完整備份。`,
      '清空紀錄',
    ))) return;
    await applyReset((x) => clearRecords(x), 'pre-clear-records', '已清空紀錄，設定保留（原本的資料已自動存檔）');
  };
  const clearAll = async () => {
    if (!(await firstConfirm(
      '清空所有資料？',
      '所有帳戶、紀錄、設定都會刪除（分類與標籤恢復預設），無法復原。\n建議先匯出完整備份。',
      '繼續',
    ))) return;
    if (!(await confirmDanger('再確認一次', '帳戶、紀錄、設定全部清除，無法復原。確定嗎？', '全部清除'))) return;
    await applyReset(() => blankData(), 'pre-clear-all', '已清空所有資料（原本的資料已自動存檔）');
  };

  const banks = bankAccounts(d);
  const cats = categoriesOf(d, catType);

  const accRow = (a: Account, canDelete: boolean, bind: (id: string) => object, drag: DragState | null) => (
    <div class={`list-row sort-row${dragCls(a.id, drag)}`} key={a.id} {...bind(a.id)}>
      <button class="row-main" onClick={() => setSheet({ k: 'account', kind: a.kind, existing: a })}>
        <span>{a.name}</span>
        <span class="muted small">目前 {money(bal.get(a.id) ?? 0)}</span>
      </button>
      {canDelete && <button class="icon-btn danger" onClick={() => deleteAccount(a)} aria-label="刪除"><Icon name="trash-2" /></button>}
    </div>
  );
  const accList = (list: Account[], canDelete: (a: Account) => boolean) => (
    <Sortable ids={list.map((a) => a.id)} enabled={list.length > 1} onReorder={sortAccounts}>
      {(bind, drag) => list.map((a) => accRow(a, canDelete(a), bind, drag))}
    </Sortable>
  );

  return (
    <div class="page-pad settings">
      {view === 'menu' ? (
        <>
          <h1 class="page-title">設定</h1>
          {/* 2.6 依用途分五類；選項短的用按鈕框，長的進下一層或彈窗 */}
          <section class="panel">
            <h3>外觀</h3>
            <div class="setting-row">
              <span>外觀</span>
              <div class="mini-seg">
                {(['light', 'dark', 'system'] as ThemeMode[]).map((m) => (
                  <button
                    key={m}
                    class={themeOf(d.settings) === m ? 'on' : ''}
                    onClick={() => {
                      applyTheme(m); // 立即套用
                      updateData((x) => ({ ...x, settings: { ...x.settings, theme: m } }));
                    }}
                  >
                    {THEME_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>
            <StylePicker
              current={styleOf(d.settings)}
              theme={resolveTheme(themeOf(d.settings))}
              onPick={(id) => {
                applyUiStyle(id); // 立即套用
                setSetting({ uiStyle: id });
              }}
            />
            {(styleOf(d.settings) === 'glass' || styleOf(d.settings) === 'liquid') && (
              <Row label="毛玻璃" note="關閉讓手機更順，開啟畫面更有質感">
                <OnOff on={glassOn(d.settings)} onChange={(on) => setSetting({ glass: on })} />
              </Row>
            )}
            <div class="setting-row">
              <span>字體</span>
              <div class="mini-seg">
                <button class={!fontOn ? 'on' : ''} onClick={() => fontOn && setSetting({ appFont: 'system' })}>跟隨系統</button>
                <button class={fontOn ? 'on' : ''} onClick={() => !fontOn && useAppFont()}>App 字體</button>
              </div>
            </div>
            {fontOn && (
              <button class="setting-row" onClick={() => setSheet({ k: 'font' })}>
                <span>選擇字體</span>
                <span class="muted">{fontById(d.settings.appFont)?.label} ›</span>
              </button>
            )}
          </section>

          <section class="panel">
            <h3>圖示</h3>
            <button class="setting-row" onClick={() => setSheet({ k: 'coin', which: 'coinHome' })}>
              <span>首頁小語圖示</span>
              <span class="muted">{coinText(d.settings.coinHome ?? 'auto')} ›</span>
            </button>
            <button class="setting-row" onClick={() => setSheet({ k: 'coin', which: 'coinWidget' })}>
              <span>桌面小工具圖示</span>
              <span class="muted">{coinText(d.settings.coinWidget ?? 'auto')} ›</span>
            </button>
            {native && (
              <button class="setting-row" onClick={() => setSheet({ k: 'coin', which: 'appIcon' })}>
                <span>手機桌面 App 圖示</span>
                <span class="muted">{coinText(d.settings.appIcon ?? 'original')} ›</span>
              </button>
            )}
          </section>

          <section class="panel">
            <h3>記帳</h3>
            <div class="setting-row">
              <span>首頁使用</span>
              <div class="mini-seg">
                {([['accounts', '帳戶頁'], ['detail', '明細頁']] as const).map(([k, label]) => (
                  <button
                    key={k}
                    class={(detailHome(d.settings) ? 'detail' : 'accounts') === k ? 'on' : ''}
                    onClick={() => setSetting({ homePage: k })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Row label="首頁平均／日" note="剩餘可用 ÷ 離結算日天數">
              <OnOff on={dailyAvgOn(d.settings)} onChange={(on) => setSetting({ dailyAvg: on })} />
            </Row>
            <div class="setting-row">
              <span>記帳預設帳戶</span>
              <div class="mini-seg">
                {([['last', '上一筆用的'], ['first', '第一個']] as const).map(([k, label]) => (
                  <button key={k} class={entryAccountMode(d.settings) === k ? 'on' : ''} onClick={() => setSetting({ entryAccount: k })}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Row label="明細顯示記帳前餘額">
              <OnOff on={prevBalanceOn(d.settings)} onChange={(on) => setSetting({ showPrevBalance: on })} />
            </Row>
            <Row label="先付／先欠">
              <OnOff
                on={advanceOwedOn(d.settings)}
                onChange={(on) => {
                  setSetting({ advanceOwedEnabled: on });
                  showToast(on ? '已開啟先付／先欠' : '已關閉先付／先欠（已記的照常顯示與計算）');
                }}
              />
            </Row>
            <button class="setting-row" onClick={() => setView('recurring')}>
              <span>定期扣款</span>
              <span class="muted">{recurringOn(d.settings) ? `${d.recurring.length} 項` : '關閉'} ›</span>
            </button>
            <button class="setting-row" data-tour="settle" onClick={() => setSheet({ k: 'settle' })}>
              <span>結算日</span>
              <span class="muted">每月 {d.settings.settleDay} 號 ›</span>
            </button>
            <button class="setting-row" onClick={() => setSheet({ k: 'defaultReimb' })}>
              <span>預設報帳帳戶</span>
              <span class="muted">{d.settings.defaultReimburseAccountId ? accountName(d, d.settings.defaultReimburseAccountId) : '不設定'} ›</span>
            </button>
          </section>

          <section class="panel">
            <h3>通知與隱私</h3>
            <Row label="通知欄快捷列">
              <OnOff
                on={notifBarOn(d.settings)}
                onChange={async (on) => {
                  // 打開時 Android 13 以上要先向使用者要通知權限；被拒絕就維持關閉並說明原因
                  if (on && !(await requestNotifPermission())) {
                    showToast('沒有通知權限，快捷列無法顯示。要用的話，請到手機設定 → 應用程式 → 拖拖記帳 → 通知，允許通知');
                    return;
                  }
                  setSetting({ notifBar: on });
                }}
              />
            </Row>
            <Row label="鎖定畫面隱藏金額">
              <OnOff on={notifHideLockOn(d.settings)} onChange={(on) => setSetting({ notifHideOnLock: on })} />
            </Row>
          </section>

          <section class="panel">
            <h3>說明</h3>
            <button class="setting-row" onClick={() => setView('help')}>
              <span>使用說明</span>
              <span class="muted">13 篇 ›</span>
            </button>
            <button class="setting-row" onClick={() => { setState({ tutorial: true }); goPage(pageIndex('首頁')); }}>
              <span>重看新手教學</span>
              <span class="muted">›</span>
            </button>
          </section>

          <section class="panel">
            <h3>管理</h3>
            <button class="setting-row" onClick={() => setView('accounts')}><span>帳戶管理</span><span class="muted">{banks.length} 個 ›</span></button>
            <button class="setting-row" onClick={() => setView('small')}><span>小帳戶管理</span><span class="muted">錢包、投資、儲蓄 ›</span></button>
            <button class="setting-row" onClick={() => setView('categories')}>
              <span>分類管理</span>
              <span class="muted">{d.settings.autoSortCategories ? '自動排序' : '手動排序'} ›</span>
            </button>
            <button class="setting-row" onClick={() => setSheet({ k: 'tags' })}>
              <span>備註標籤</span>
              <span class="muted">已釘選 {pinnedCount(d)} 個 ›</span>
            </button>
            <button class="setting-row" onClick={() => setSheet({ k: 'carrier' })}>
              <span>手機條碼載具</span>
              <span class="muted">{d.settings.carrierCode || '未設定'} ›</span>
            </button>
          </section>
        </>
      ) : (
        <div class="sub-head">
          <button class="icon-btn" onClick={() => setView('menu')} aria-label="返回設定"><Icon name="chevron-left" /></button>
          <h1 class="page-title">{{ accounts: '帳戶管理', small: '小帳戶管理', categories: '分類管理', recurring: '定期扣款', backup: '資料備份', demo: '清空或範例', help: '說明' }[view]}</h1>
        </div>
      )}

      {view === 'accounts' && <section class="panel">
        <h3>首頁卡片</h3>
        {banks.length > 1 && <p class="muted small">點一下修改，長按拖曳換位置</p>}
        {accList(banks, () => true)}
        <button class="add-row" onClick={() => setSheet({ k: 'account', kind: 'bank' })}><Icon name="plus" size={16} /> 新增帳戶</button>
      </section>}

      {view === 'small' && <section class="panel">
        <h3>五顆球</h3>
        {SMALL_KINDS.map((kind) => {
          const list = accountsOfKind(d, kind);
          const multi = MULTI_KINDS.includes(kind);
          return (
            <div key={kind} class="kind-group">
              <div class="kind-title"><Icon name={ACCOUNT_KIND_ICON[kind]} size={18} /> {KIND_LABEL[kind]}{multi && <span class="muted small">（可以有多個）</span>}</div>
              {accList(list, (a) => (multi || list.length > 1) && !(a.kind === 'invest' && a.subtype !== 'holding'))}
              {(multi || list.length === 0) && (
                <button class="add-row" onClick={() => setSheet({ k: 'account', kind })}><Icon name="plus" size={16} /> 新增{KIND_LABEL[kind]}</button>
              )}
            </div>
          );
        })}
      </section>}

      {view === 'categories' && <section class="panel">
        <div class="panel-head">
          <h3>分類</h3>
          <div class="mini-seg">
            <button class={catType === 'expense' ? 'on' : ''} onClick={() => setCatType('expense')}>支出</button>
            <button class={catType === 'income' ? 'on' : ''} onClick={() => setCatType('income')}>收入</button>
          </div>
        </div>
        <p class="muted small">
          {d.settings.autoSortCategories ? '自動排序開著，不能拖曳。點一下修改。' : '點一下修改，長按拖曳換位置；拖到右下角的叉叉＝刪除。'}
        </p>
        <Sortable
          class="cat-grid manage"
          ids={cats.map((c) => c.id)}
          enabled={!d.settings.autoSortCategories}
          onReorder={sortCategories}
          onTrash={(id) => {
            const c = cats.find((x) => x.id === id);
            if (c) deleteCategory(c);
          }}
        >
          {(bind, drag) => (
            <>
              {(d.settings.autoSortCategories ? sortedCategories(d, catType) : cats).map((c) => (
                <button key={c.id} class={`cat${dragCls(c.id, drag)}`} {...bind(c.id)} onClick={() => setSheet({ k: 'category', type: catType, existing: c })}>
                  <CatIcon icon={c.icon} color={c.color} />
                  <span class="cat-name">{c.name}</span>
                </button>
              ))}
              {drag ? (
                <div class={`cat trash${drag.over === TRASH_ID ? ' over' : ''}`} data-sort={TRASH_ID}>
                  <span class="cat-icon"><Icon name="x" /></span>
                  <span class="cat-name">刪除</span>
                </div>
              ) : (
                <button class="cat add" onClick={() => setSheet({ k: 'category', type: catType })}>
                  <span class="cat-icon"><Icon name="plus" /></span>
                  <span class="cat-name">新增</span>
                </button>
              )}
            </>
          )}
        </Sortable>
        <label class="setting-row">
          <span>自動排序<span class="muted small"> 常用的排前面（最近 90 天）</span></span>
          <input
            type="checkbox"
            checked={d.settings.autoSortCategories}
            onChange={(e) => {
              const on = e.currentTarget.checked;
              e.currentTarget.checked = d.settings.autoSortCategories; // 等確認後再由資料決定
              toggleAutoSort(on);
            }}
          />
        </label>
      </section>}

      {view === 'recurring' && <RecurringPanel />}

      {(view === 'backup' || view === 'menu') && <section class="panel">
        <h3>匯出與匯入</h3>
        <p class="muted small">資料只存在這支手機上。換手機或清除瀏覽器資料前，請先匯出完整備份。</p>
        <div class="btn-row">
          <button class="btn" onClick={() => doExport('full')}>匯出完整備份</button>
          <button class="btn secondary" onClick={() => doExport('settings')}>匯出設定</button>
        </div>
        <p class="muted small">完整備份：記帳紀錄＋所有設定值。<br />匯出設定：帳戶、小帳戶、分類及所有設定值，不含記帳紀錄。</p>
        <div class="btn-row">
          <button class="btn secondary" onClick={() => fileRef.current?.click()}>匯入備份</button>
        </div>
        <p class="muted small">會自動判斷備份類型。要匯入其他軟體的紀錄，請用下面的〔從其他軟體匯入〕。</p>
        <div class="btn-row">
          <button class="btn secondary" onClick={() => setSheet({ k: 'snapshots' })}>自動存檔</button>
        </div>
        <p class="muted small">每天自動暫存一份在這支手機上。要換手機、重灌，請用完整備份。</p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (f) doImport(f);
          }}
        />
      </section>}

      {(view === 'backup' || view === 'menu') && <section class="panel" id="import-other">
        <h3>從其他軟體匯入</h3>
        <p class="muted small">用過別的記帳 App？把它的備份檔交給你常用的 AI（ChatGPT、Gemini、Claude…），請它轉成拖拖記帳的格式。</p>
        <ol class="steps">
          <li>
            <span>在舊 App 匯出備份檔，選起來</span>
            <button class="btn secondary" onClick={() => oldRef.current?.click()}>
              {oldFiles.length ? `已選 ${oldFiles.length} 個檔案（重選）` : '選擇舊檔案'}
            </button>
            {oldFiles.length > 0 && <span class="muted small">{oldFiles.map((f) => f.name).join('、')}</span>}
          </li>
          <li>
            <span>交給 AI：會一起附上格式說明、範本和提示詞</span>
            <button
              class="btn"
              onClick={() =>
                shareToAi(getState().data, oldFiles)
                  .then((msg) => msg && showToast(msg))
                  .catch(() => showToast('分享失敗'))
              }
            >
              交給我的 AI
            </button>
            <button class="link-btn small" onClick={async () => showToast((await copyText(AI_PROMPT)) ? '提示詞已複製' : '複製失敗')}>
              只複製提示詞
            </button>
          </li>
          <li>
            <span>AI 做好 .json 檔後存到手機，按上面的〔匯入備份〕。匯入前會列出各帳戶餘額，請跟舊 App 核對。</span>
          </li>
        </ol>
        <input
          ref={oldRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            setOldFiles([...(e.currentTarget.files ?? [])]);
            e.currentTarget.value = '';
          }}
        />
      </section>}

      {(view === 'demo' || view === 'menu') && <section class="panel">
        <h3>清空或範例</h3>
        <div class="btn-row three">
          <button class="btn secondary" onClick={loadSample}>載入範例</button>
          <button class="btn warn" onClick={clearRecordsOnly}>清空紀錄</button>
          <button class="btn danger" onClick={clearAll}>清空所有資料</button>
        </div>
        <p class="muted small">由左到右越來越危險。清空紀錄只刪記帳紀錄，帳戶與設定保留。</p>
      </section>}

      {view === 'help' && <HelpPage />}

      {/* 3.0：最下面顯示版本號（APK 讀 App 本身的版本，改版不用另外改這裡） */}
      {view === 'menu' && (
        <button class="setting-row license-row" onClick={() => setSheet({ k: 'license' })}>
          <span>開放原始碼授權</span>
          <span class="muted">Lucide ›</span>
        </button>
      )}

      {view === 'menu' && (
        <section class="panel">
          <h3>更新</h3>
          <Row label="自動檢查更新" note="開 App 時看看有沒有新版，只會連到 GitHub">
            <OnOff on={d.settings.autoUpdateCheck !== false} onChange={(on) => setSetting({ autoUpdateCheck: on })} />
          </Row>
          <button class="setting-row" onClick={() => void checkUpdateNow()}>
            <span>現在檢查</span>
            <span class="muted">{appVersion} ›</span>
          </button>
        </section>
      )}

      {view === 'menu' && (
        <p class="app-version muted small">
          拖拖記帳 {appVersion}
          <button class="link-btn whats-new" onClick={() => setSheet({ k: 'whatsNew' })}>更新了什麼？</button>
        </p>
      )}

      {sheet?.k === 'account' && <AccountForm kind={sheet.kind} existing={sheet.existing} onClose={() => setSheet(null)} />}
      {sheet?.k === 'category' && <CategoryForm type={sheet.type} existing={sheet.existing} onClose={() => setSheet(null)} />}
      {sheet?.k === 'settle' && <SettleForm onClose={() => setSheet(null)} />}
      {sheet?.k === 'font' && <FontPicker value={d.settings.appFont} onPick={(id) => setSetting({ appFont: id })} onClose={() => setSheet(null)} />}
      {sheet?.k === 'coin' && (
        <Sheet
          title={{ coinHome: '首頁小語圖示', coinWidget: '桌面小工具圖示', appIcon: '手機桌面 App 圖示' }[sheet.which]}
          onClose={() => setSheet(null)}
        >
          <CoinStrip
            auto={sheet.which !== 'appIcon'}
            value={sheet.which === 'appIcon' ? d.settings.appIcon ?? 'original' : d.settings[sheet.which] ?? 'auto'}
            note={sheet.which === 'appIcon' ? '有些手機換完會拿掉桌面舊圖示，請從 App 列表再拖一次。' : '「自動」＝跟著心情換。'}
            onPick={(v) => void pickCoin(sheet.which, v)}
          />
        </Sheet>
      )}
      {sheet?.k === 'carrier' && <CarrierForm onClose={() => setSheet(null)} />}
      {sheet?.k === 'tags' && <TagManager onClose={() => setSheet(null)} />}
      {sheet?.k === 'license' && (
        <Sheet title="開放原始碼授權" onClose={() => setSheet(null)}>
          <p class="muted small">圖示來自 Lucide（ISC 授權）。</p>
          <pre class="license-text">{LUCIDE_LICENSE}</pre>
        </Sheet>
      )}
      {sheet?.k === 'whatsNew' && (
        <Sheet title="更新了什麼？" onClose={() => setSheet(null)}>
          <WhatsNew />
        </Sheet>
      )}
      {sheet?.k === 'snapshots' && (
        <Sheet title="自動存檔" onClose={() => setSheet(null)}>
          <p class="muted small">點一份還原。還原前會先把目前資料再留一份，按錯可以還原回來。</p>
          <SnapshotList onRestored={() => {
            setSheet(null);
            setState({ ...resetFilters });
          }} />
        </Sheet>
      )}
      {sheet?.k === 'defaultReimb' && (
        <AccountPicker
          title="預設報帳帳戶"
          noneLabel="不設定（用當初扣款的帳戶）"
          value={d.settings.defaultReimburseAccountId}
          onPick={(id) => updateData((x) => ({ ...x, settings: { ...x.settings, defaultReimburseAccountId: id } }))}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.k === 'moveAccount' && (
        <AccountPicker
          title={`「${sheet.from.name}」的紀錄要移到哪裡？`}
          exclude={sheet.from.id}
          only={moveTargets(d, sheet.from.id).map((a) => a.id)}
          value={null}
          onPick={async (id) => {
            if (!id) return;
            const from = sheet.from;
            const ok = await confirmDanger(
              `刪除「${from.name}」並移動紀錄？`,
              `紀錄和初始餘額會併入「${accountName(getState().data, id)}」，總金額不變。`,
              '確定',
            );
            if (!ok) return;
            try {
              updateData((x) => removeAccount(x, from.id, { mode: 'move', targetId: id }));
              showToast(`已刪除「${from.name}」，紀錄已移到「${accountName(getState().data, id)}」`);
            } catch (e) {
              showToast(e instanceof OpError ? e.message : '處理失敗');
            }
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.k === 'moveCategory' && (
        <Sheet title={`「${sheet.from.name}」的紀錄要移到哪個分類？`} onClose={() => setSheet(null)}>
          {categoriesOf(d, sheet.from.type)
            .filter((c) => c.id !== sheet.from.id)
            .map((c) => (
              <button
                key={c.id}
                class="pick-row"
                onClick={() => {
                  const from = sheet.from;
                  setSheet(null);
                  updateData((x) => removeCategory(x, from.id, { mode: 'move', targetId: c.id }));
                  showToast(`已刪除「${from.name}」，紀錄已移到「${c.name}」`);
                }}
              >
                <span class="pick-icon"><Icon name={c.icon} /></span>
                <span class="pick-name">{c.name}</span>
              </button>
            ))}
        </Sheet>
      )}
    </div>
  );
}

function AccountForm({ kind, existing, onClose }: { kind: AccountKind; existing?: Account; onClose: () => void }) {
  const d = useAppState().data;
  const [name, setName] = useState(existing?.name ?? (kind === 'bank' ? '' : KIND_LABEL[kind]));
  // 投資標的的金額走「更新市值」，這裡不給改
  const isHolding = kind === 'invest' && (existing ? existing.subtype === 'holding' : true);
  const curBal = existing ? allBalances(d).get(existing.id) ?? 0 : 0;
  // 新增：填初始餘額；修改：填目前金額（從紀錄推算）
  const [init, setInit] = useState(existing ? String(curBal) : '0');
  const [target, setTarget] = useState(existing?.target ? String(existing.target) : '');
  const [iconStyle, setIconStyle] = useState<'icon' | 'badge'>(accountIconStyleOf(existing ?? {}));
  const [icon, setIcon] = useState(accountIconOf(existing ?? { kind }));
  const parsed = Number(init.replace(/,/g, ''));
  const showAmount = !(existing && isHolding);
  const ok = name.trim() !== '' && (!showAmount || (init.trim() !== '' && Number.isFinite(parsed)));
  const save = () => {
    if (!ok) return;
    if (existing) {
      const acc: Account = { ...existing, name: name.trim(), icon, iconStyle };
      if (kind === 'saving') acc.target = Math.round(Number(target.replace(/,/g, ''))) || 0;
      const newCur = showAmount ? Math.round(parsed) : null;
      try {
        updateData((x) => editAccount(x, acc, newCur));
      } catch (e) {
        showToast(e instanceof OpError ? e.message : '儲存失敗');
        return;
      }
      showToast(newCur !== null && newCur !== curBal ? `已更新，並產生一筆校正（${newCur > curBal ? '+' : '-'}${money(Math.abs(newCur - curBal))}）` : '已更新帳戶');
      onClose();
      return;
    }
    const acc: Account = existing
      ? existing
      : {
          id: uid('a'),
          name: name.trim(),
          kind,
          initialBalance: Math.round(parsed),
          icon,
          iconStyle,
          order: d.accounts.filter((a) => a.kind === kind).sort(byOrder).length,
          ...(kind === 'invest' ? { subtype: 'holding' } : {}),
        };
    if (kind === 'saving') acc.target = Math.round(Number(target.replace(/,/g, ''))) || 0;
    updateData((x) => upsertAccount(x, acc));
    showToast(existing ? '已更新帳戶' : '已新增帳戶');
    onClose();
  };
  return (
    <Sheet title={existing ? `修改「${existing.name}」` : `新增${kind === 'bank' ? '帳戶' : KIND_LABEL[kind]}`} onClose={onClose}>
      <label class="field">
        <span>名稱</span>
        <input value={name} maxLength={12} onInput={(e) => setName(e.currentTarget.value)} placeholder="例如：薪轉帳戶" />
      </label>
      <div class="field">
        <span>顯示方式</span>
        <div class="acc-style-row">
          <AccountIcon account={{ name, kind, icon, iconStyle }} />
          <div class="mini-seg">
            <button class={iconStyle === 'icon' ? 'on' : ''} onClick={() => setIconStyle('icon')}>圖示</button>
            <button class={iconStyle === 'badge' ? 'on' : ''} onClick={() => setIconStyle('badge')}>縮寫徽章</button>
          </div>
        </div>
        {iconStyle === 'icon' && (
          <div class="icon-picker acc-icon-picker" data-no-swipe>
            <div class="icon-grid">
              {ACCOUNT_ICONS.map((ic) => (
                <button key={ic} class={`icon-cell${ic === icon ? ' on' : ''}`} onClick={() => setIcon(ic)} aria-label={ICON_LABELS[ic] ?? ic}>
                  <Icon name={ic} size={ICON.pickerPx} />
                </button>
              ))}
            </div>
          </div>
        )}
        {iconStyle === 'badge' && <span class="muted small">徽章會顯示名稱的第一個字</span>}
      </div>
      {showAmount && (
        <label class="field">
          <span>{existing ? '目前金額（元，可以是負數）' : '初始餘額（開始記帳那天帳戶裡的錢，可以是負數）'}</span>
          <input value={init} inputMode="numeric" onInput={(e) => setInit(e.currentTarget.value)} />
        </label>
      )}
      {existing && showAmount && (
        <p class="muted small">改了目前金額，會自動產生一筆「校正」紀錄補上差額，不算當月收支。</p>
      )}
      {existing && !showAmount && <p class="muted small">投資標的的金額請到投資畫面用「更新市值」。</p>}
      {kind === 'saving' && (
        <label class="field">
          <span>目標金額（元）</span>
          <input value={target} inputMode="numeric" onInput={(e) => setTarget(e.currentTarget.value)} />
        </label>
      )}
      <button class="btn block" disabled={!ok} onClick={save}>儲存</button>
    </Sheet>
  );
}

function SettleForm({ onClose }: { onClose: () => void }) {
  const cur = useAppState().data.settings.settleDay;
  const [v, setV] = useState(String(cur));
  const n = Number(v);
  const ok = Number.isInteger(n) && n >= SETTLE.minDay && n <= SETTLE.maxDay;
  return (
    <Sheet title="結算日" onClose={onClose}>
      <p class="muted small">
        每月幾號開始新的一期。例如 5 號：「十月」＝10/5～11/4。明細、統計只看當期，帳戶餘額照常累積。
        該月沒有這一天時（例如 31 號遇到 2 月），改從月底開始。
      </p>
      <label class="field">
        <span>每月幾號（{SETTLE.minDay}～{SETTLE.maxDay}）</span>
        <input value={v} inputMode="numeric" onInput={(e) => setV(e.currentTarget.value)} />
      </label>
      <button
        class="btn block"
        disabled={!ok}
        onClick={() => {
          updateData((x) => ({ ...x, settings: { ...x.settings, settleDay: n } }));
          showToast('已更新結算日');
          onClose();
        }}
      >
        儲存
      </button>
    </Sheet>
  );
}

function CarrierForm({ onClose }: { onClose: () => void }) {
  const cur = useAppState().data.settings.carrierCode ?? '';
  const [v, setV] = useState(cur);
  const code = normalizeCarrier(v);
  const err = carrierError(code);
  const ok = code === '' || isValidCarrier(code);
  return (
    <Sheet title="手機條碼載具" onClose={onClose}>
      <p class="muted small">
        財政部手機條碼：斜線「/」開頭，共 8 碼（例：/ABC1234）。存好後會顯示在桌面小工具上，結帳時給店員掃。清空再儲存＝取消設定。
      </p>
      <label class="field">
        <span>載具號碼</span>
        <input
          value={v}
          autoCapitalize="characters"
          autoComplete="off"
          spellcheck={false}
          maxLength={10}
          placeholder="/ABC1234"
          onInput={(e) => setV(normalizeCarrier(e.currentTarget.value))}
        />
      </label>
      {err && <p class="field-error">{err}</p>}
      {isValidCarrier(code) && (
        <div class="carrier-preview">
          <div class="muted small">預覽條碼</div>
          <Barcode code={code} />
        </div>
      )}
      <button
        class="btn block"
        disabled={!ok}
        onClick={() => {
          updateData((x) => {
            const settings = { ...x.settings };
            if (code) settings.carrierCode = code;
            else delete settings.carrierCode;
            return { ...x, settings };
          });
          showToast(code ? '已儲存載具號碼' : '已取消載具號碼');
          onClose();
        }}
      >
        儲存
      </button>
    </Sheet>
  );
}
