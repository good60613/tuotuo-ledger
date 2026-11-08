// 設定（右二）：只放讓其他功能能運作的項目。
import { useRef, useState } from 'preact/hooks';
import { useAppState, getState, updateData, showToast, ask, confirmDanger, setState } from '../store';
import {
  byOrder, reorder, uid, upsertAccount, removeAccount, countAccountRecords,
  removeCategory, countCategoryRecords, OpError,
} from '../data/ops';
import { SMALL_KINDS, KIND_LABEL, type Account, type AccountKind, type Category, type CategoryType } from '../data/types';
import { allBalances } from '../data/calc';
import { accountName, accountsOfKind, bankAccounts, categoriesOf, KIND_ICON } from '../selectors';
import { exportJson, parseBackup, saveBackupFile } from '../data/backup';
import { sampleData, blankData } from '../data/seed';
import { saveData } from '../data/storage';
import { Sheet } from '../components/Sheet';
import { AccountPicker } from '../components/AccountPicker';
import { CategoryForm, TagManager } from '../components/Editors';
import { money } from '../format';
import { pinnedCount } from '../data/notes';
import { SETTLE } from '../config';

/** 可以有多個帳戶的小帳戶類型（其他類型固定一個） */
const MULTI_KINDS: AccountKind[] = ['ewallet', 'invest', 'saving', 'other'];

/** 設定目錄的項目（首頁只列項目，點了才進入子頁） */
type View = 'menu' | 'accounts' | 'small' | 'categories' | 'backup' | 'demo';

type SheetState =
  | null
  | { k: 'account'; kind: AccountKind; existing?: Account }
  | { k: 'category'; type: CategoryType; existing?: Category }
  | { k: 'tags' }
  | { k: 'defaultReimb' }
  | { k: 'settle' }
  | { k: 'moveAccount'; from: Account }
  | { k: 'moveCategory'; from: Category };

export function SettingsPage() {
  const s = useAppState();
  const d = s.data;
  const bal = allBalances(d);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [view, setView] = useState<View>('menu');
  const [catType, setCatType] = useState<CategoryType>('expense');
  const fileRef = useRef<HTMLInputElement>(null);

  const moveAcc = (list: Account[], i: number, dir: -1 | 1) => {
    const ids = list.map((a) => a.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    updateData((x) => ({ ...x, accounts: reorder(x.accounts, ids) }));
  };
  const moveCat = (list: Category[], i: number, dir: -1 | 1) => {
    const ids = list.map((a) => a.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    updateData((x) => ({ ...x, categories: reorder(x.categories, ids) }));
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
    const v = await ask(`「${a.name}」底下有 ${n} 筆紀錄`, '要怎麼處理這些紀錄？', [
      { label: '紀錄移到另一個帳戶', value: 'move', style: 'primary' },
      { label: '連同紀錄一起刪除', value: 'del', style: 'danger' },
      { label: '取消', value: 'no', style: 'secondary' },
    ]);
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
  const doExport = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    saveBackupFile(`記帳備份-${stamp}.json`, exportJson(getState().data))
      .then((msg) => msg && showToast(msg))
      .catch(() => showToast('匯出失敗'));
  };
  const doImport = async (file: File) => {
    try {
      const next = parseBackup(await file.text());
      const ok = await confirmDanger(
        '用備份檔取代目前資料？',
        `備份內有 ${next.accounts.length} 個帳戶、${next.transactions.length} 筆紀錄。\n目前手機上的資料會被整個取代。建議先匯出一份目前的資料。`,
        '取代',
      );
      if (!ok) return;
      await saveData(next);
      setState({ data: next, detail: { accountId: null, categoryId: null, day: null, period: null }, statsAccountId: null, statsPeriod: null });
      showToast('已從備份還原');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '匯入失敗');
    }
  };
  const resetTo = async (which: 'blank' | 'sample') => {
    const ok = await confirmDanger(
      which === 'blank' ? '清空所有資料？' : '換成範例資料？',
      which === 'blank'
        ? '所有帳戶、紀錄都會刪除（分類與標籤恢復預設），無法復原。建議先匯出備份。'
        : '目前資料會被範例資料取代，無法復原。建議先匯出備份。',
      which === 'blank' ? '清空' : '取代',
    );
    if (!ok) return;
    const next = which === 'blank' ? blankData() : sampleData();
    updateData(() => next);
    setState({ detail: { accountId: null, categoryId: null, day: null }, statsAccountId: null });
    showToast(which === 'blank' ? '已清空' : '已載入範例資料');
  };

  const banks = bankAccounts(d);
  const cats = categoriesOf(d, catType);

  const accRow = (a: Account, list: Account[], i: number, canDelete: boolean) => (
    <div class="list-row" key={a.id}>
      <button class="row-main" onClick={() => setSheet({ k: 'account', kind: a.kind, existing: a })}>
        <span>{a.name}</span>
        <span class="muted small">初始 {money(a.initialBalance)} · 目前 {money(bal.get(a.id) ?? 0)}</span>
      </button>
      {list.length > 1 && (
        <>
          <button class="icon-btn" disabled={i === 0} onClick={() => moveAcc(list, i, -1)} aria-label="上移">↑</button>
          <button class="icon-btn" disabled={i === list.length - 1} onClick={() => moveAcc(list, i, 1)} aria-label="下移">↓</button>
        </>
      )}
      {canDelete && <button class="icon-btn danger" onClick={() => deleteAccount(a)} aria-label="刪除">🗑</button>}
    </div>
  );

  return (
    <div class="page-pad settings">
      {view === 'menu' ? (
        <>
          <h1 class="page-title">設定</h1>
          <section class="panel">
            <button class="setting-row" onClick={() => setView('accounts')}><span>帳戶管理</span><span class="muted">{banks.length} 個 ›</span></button>
            <button class="setting-row" onClick={() => setView('small')}><span>小帳戶管理</span><span class="muted">電子錢包、投資標的、儲蓄目標 ›</span></button>
            <button class="setting-row" onClick={() => setView('categories')}>
              <span>分類管理</span>
              <span class="muted">{d.settings.autoSortCategories ? '自動排序' : '手動排序'} ›</span>
            </button>
            <button class="setting-row" onClick={() => setSheet({ k: 'tags' })}>
              <span>備註標籤</span>
              <span class="muted">自動篩選，已釘選 {pinnedCount(d)} 個 ›</span>
            </button>
            <button class="setting-row" onClick={() => setSheet({ k: 'defaultReimb' })}>
              <span>預設報帳帳戶</span>
              <span class="muted">{d.settings.defaultReimburseAccountId ? accountName(d, d.settings.defaultReimburseAccountId) : '不設定'} ›</span>
            </button>
            <button class="setting-row" onClick={() => setSheet({ k: 'settle' })}>
              <span>結算日</span>
              <span class="muted">每月 {d.settings.settleDay} 號 ›</span>
            </button>
          </section>
        </>
      ) : (
        <div class="sub-head">
          <button class="icon-btn" onClick={() => setView('menu')} aria-label="返回設定">‹</button>
          <h1 class="page-title">{{ accounts: '帳戶管理', small: '小帳戶管理', categories: '分類管理', backup: '資料備份', demo: '試玩資料' }[view]}</h1>
        </div>
      )}

      {view === 'accounts' && <section class="panel">
        <h3>首頁卡片</h3>
        {banks.map((a, i) => accRow(a, banks, i, true))}
        <button class="add-row" onClick={() => setSheet({ k: 'account', kind: 'bank' })}>＋ 新增帳戶</button>
      </section>}

      {view === 'small' && <section class="panel">
        <h3>五顆球</h3>
        {SMALL_KINDS.map((kind) => {
          const list = accountsOfKind(d, kind);
          const multi = MULTI_KINDS.includes(kind);
          return (
            <div key={kind} class="kind-group">
              <div class="kind-title">{KIND_ICON[kind]} {KIND_LABEL[kind]}{multi && <span class="muted small">（可以有多個）</span>}</div>
              {list.map((a, i) => accRow(a, list, i, (multi || list.length > 1) && !(a.kind === 'invest' && a.subtype !== 'holding')))}
              {(multi || list.length === 0) && (
                <button class="add-row" onClick={() => setSheet({ k: 'account', kind })}>＋ 新增{KIND_LABEL[kind]}</button>
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
        {cats.map((c, i) => (
          <div class="list-row" key={c.id}>
            <button class="row-main" onClick={() => setSheet({ k: 'category', type: catType, existing: c })}>
              <span>{c.icon} {c.name}</span>
            </button>
            <button class="icon-btn" disabled={i === 0} onClick={() => moveCat(cats, i, -1)} aria-label="上移">↑</button>
            <button class="icon-btn" disabled={i === cats.length - 1} onClick={() => moveCat(cats, i, 1)} aria-label="下移">↓</button>
            <button class="icon-btn danger" onClick={() => deleteCategory(c)} aria-label="刪除">🗑</button>
          </div>
        ))}
        <button class="add-row" onClick={() => setSheet({ k: 'category', type: catType })}>＋ 新增{catType === 'expense' ? '支出' : '收入'}分類</button>
        <label class="setting-row">
          <span>自動排序<span class="muted small"> 常用的排前面（最近 90 天）</span></span>
          <input
            type="checkbox"
            checked={d.settings.autoSortCategories}
            onChange={(e) => {
              const on = e.currentTarget.checked;
              updateData((x) => ({ ...x, settings: { ...x.settings, autoSortCategories: on } }));
            }}
          />
        </label>
      </section>}

      {(view === 'backup' || view === 'menu') && <section class="panel">
        <h3>匯出與匯入</h3>
        <p class="muted small">資料只存在這支手機上。換手機或清除瀏覽器資料前，請先匯出備份。</p>
        <div class="btn-row">
          <button class="btn" onClick={doExport}>匯出備份</button>
          <button class="btn secondary" onClick={() => fileRef.current?.click()}>從備份匯入</button>
        </div>
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

      {(view === 'demo' || view === 'menu') && <section class="panel">
        <h3>清空或換範例</h3>
        <div class="btn-row">
          <button class="btn danger" onClick={() => resetTo('blank')}>清空所有資料</button>
          <button class="btn secondary" onClick={() => resetTo('sample')}>載入範例資料</button>
        </div>
      </section>}

      {sheet?.k === 'account' && <AccountForm kind={sheet.kind} existing={sheet.existing} onClose={() => setSheet(null)} />}
      {sheet?.k === 'category' && <CategoryForm type={sheet.type} existing={sheet.existing} onClose={() => setSheet(null)} />}
      {sheet?.k === 'settle' && <SettleForm onClose={() => setSheet(null)} />}
      {sheet?.k === 'tags' && <TagManager onClose={() => setSheet(null)} />}
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
                <span class="pick-icon">{c.icon}</span>
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
  const [init, setInit] = useState(existing ? String(existing.initialBalance) : '0');
  const [target, setTarget] = useState(existing?.target ? String(existing.target) : '');
  const parsed = Number(init.replace(/,/g, ''));
  const ok = name.trim() !== '' && init.trim() !== '' && Number.isFinite(parsed);
  const save = () => {
    if (!ok) return;
    const acc: Account = existing
      ? { ...existing, name: name.trim(), initialBalance: Math.round(parsed) }
      : {
          id: uid('a'),
          name: name.trim(),
          kind,
          initialBalance: Math.round(parsed),
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
      <label class="field">
        <span>初始餘額（元，可以是負數）</span>
        <input value={init} inputMode="numeric" onInput={(e) => setInit(e.currentTarget.value)} />
      </label>
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
