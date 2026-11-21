import { Icon } from '../components/Icon';
// 資料保護畫面（2.0 修正批）：讀不到帳本、升級失敗、版本比 App 新、或找不到主資料時顯示。
// 這時不會存任何變更；只提供重試、從自動留底還原、從備份檔匯入（版本太新時只能重試，請更新 App）。
import { useRef, useState } from 'preact/hooks';
import { useAppState, getState, initStore, replaceData, startFresh, confirmDanger, showToast, setState } from '../store';
import { readBackup } from '../data/backup';
import { SnapshotList } from '../components/SnapshotList';

const TITLE = {
  read: '讀不到帳本資料',
  upgrade: '帳本資料升級失敗',
  newer: '需要更新 App',
  missing: '找不到帳本資料',
} as const;

export function BlockedScreen() {
  const s = useAppState();
  const b = s.blocked!;
  const [showSnaps, setShowSnaps] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canRescue = b.reason !== 'newer';

  const retry = async () => {
    setBusy(true);
    await initStore();
    setBusy(false);
    if (getState().blocked) showToast('還是讀不到，資料沒有被改動');
  };

  const importFile = async (file: File) => {
    try {
      const parsed = readBackup(await file.text());
      if (parsed.type !== 'full') {
        showToast('這是「只有設定」的檔案，現在需要完整備份才能還原');
        return;
      }
      const next = parsed.data;
      if (!(await confirmDanger(
        '用這份完整備份還原？',
        `備份內有 ${next.accounts.length} 個帳戶、${next.transactions.length} 筆紀錄。\n手機上原本的資料會先自動留一份，再換成這份備份。`,
        '還原',
      ))) return;
      await replaceData(next, 'pre-import');
      setState({ page: 2 });
      showToast('已從備份還原');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '匯入失敗');
    }
  };

  const fresh = async () => {
    if (!(await confirmDanger('從範例開始？', '會建立一本新的範例帳本。之後要找回舊資料，仍可從設定的「自動留底」還原。', '從範例開始'))) return;
    try {
      await startFresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : '處理失敗');
    }
  };

  return (
    <div class="blocked-screen">
      <h2><Icon name="triangle-alert" size={22} class="blocked-icon" /> {TITLE[b.reason]}</h2>
      <p>{b.message}</p>
      <p class="blocked-safe">為了保護你的資料，<b>目前不會存任何變更</b>。</p>
      {b.reason === 'newer' && <p>請安裝最新版的拖拖記帳，不要用舊版覆蓋，資料才不會不見。</p>}

      <div class="blocked-btns">
        <button class="btn" disabled={busy} onClick={retry}>重試</button>
        {canRescue && <button class="btn secondary" onClick={() => setShowSnaps((v) => !v)}>從自動留底還原</button>}
        {canRescue && <button class="btn secondary" onClick={() => fileRef.current?.click()}>從備份檔匯入</button>}
        {b.reason === 'missing' && <button class="btn secondary" onClick={fresh}>從範例開始</button>}
      </div>
      {showSnaps && (
        <section class="panel">
          <h3>自動留底</h3>
          <SnapshotList onRestored={() => setState({ page: 2 })} />
        </section>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (f) void importFile(f);
        }}
      />
    </div>
  );
}
