// 自動存檔清單（設定頁「自動存檔」與資料保護畫面共用）：列出每份的時間、原因、帳戶與紀錄筆數，點一份還原。
import { useEffect, useState } from 'preact/hooks';
import { listSnapshots } from '../data/storage';
import { REASON_LABEL, byNewest, type SnapshotMeta } from '../data/snapshots';
import { ask, confirmDanger, restoreSnapshot, showToast } from '../store';
import { hm } from '../format';

const ymd = (d: Date) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;

export function SnapshotList({ onRestored }: { onRestored?: () => void }) {
  const [list, setList] = useState<SnapshotMeta[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    listSnapshots()
      .then((l) => setList([...l].sort(byNewest)))
      .catch((e) => setErr(e instanceof Error ? e.message : '讀不到自動存檔'));
  useEffect(() => {
    void load();
  }, []);

  const pick = async (m: SnapshotMeta) => {
    if (busy) return;
    const when = `${ymd(new Date(m.at))} ${hm(new Date(m.at))}`;
    const v = await ask(
      `還原 ${when} 的留底？`,
      `${REASON_LABEL[m.reason]}：${m.accounts} 個帳戶、${m.transactions} 筆紀錄。\n目前手機上的資料會被這份取代。還原前會先把目前資料自動留一份，想反悔可以再還原回來。`,
      [
        { label: '取消', value: 'no', style: 'secondary' },
        { label: '繼續', value: 'yes', style: 'danger' },
      ],
    );
    if (v !== 'yes') return;
    if (!(await confirmDanger('再確認一次', `用 ${when} 的留底取代目前資料？`, '還原'))) return;
    setBusy(true);
    try {
      await restoreSnapshot(m.id);
      showToast(`已還原 ${when} 的留底`);
      onRestored?.();
    } catch (e) {
      showToast(e instanceof Error ? e.message : '還原失敗');
    } finally {
      setBusy(false);
      void load();
    }
  };

  if (err) return <p class="muted small">讀不到自動存檔（{err}）</p>;
  if (!list) return <p class="muted small">讀取中…</p>;
  if (list.length === 0) return <p class="muted small">還沒有自動存檔。每天第一次開啟 App 會自動留一份。</p>;
  return (
    <div>
      {list.map((m) => (
        <button key={m.id} class="pick-row" disabled={busy} onClick={() => pick(m)}>
          <span class="pick-name">
            {ymd(new Date(m.at))} {hm(new Date(m.at))}
            <span class="muted small">　{REASON_LABEL[m.reason]}</span>
          </span>
          <span class="pick-amt muted small">{m.accounts} 帳戶・{m.transactions} 筆</span>
        </button>
      ))}
    </div>
  );
}
