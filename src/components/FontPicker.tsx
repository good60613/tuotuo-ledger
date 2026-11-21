// 2.6 選字體的彈窗：每套顯示一行範例（已下載的用該字體顯示）、大小、是否已下載。
import { useEffect, useState } from 'preact/hooks';
import { Sheet } from './Sheet';
import { FONTS, isDownloaded, downloadFont, ensureFontLoaded, type AppFont } from '../fonts';
import { ask, showToast } from '../store';

/** 下載（要先問，會用到網路）；成功回傳 true */
export async function confirmAndDownload(f: AppFont, onProgress?: (p: number) => void): Promise<boolean> {
  if (await isDownloaded(f)) return true;
  const v = await ask(`下載「${f.label}」？`, `約 ${f.mb} MB，建議連 Wi-Fi。下載後存在手機裡，之後不用網路。`, [
    { label: '下載', value: 'yes', style: 'primary' },
    { label: '取消', value: 'no', style: 'secondary' },
  ]);
  if (v !== 'yes') return false;
  try {
    showToast(`正在下載「${f.label}」…`);
    await downloadFont(f, onProgress);
    return true;
  } catch {
    showToast('下載失敗，請檢查網路後再試一次');
    return false;
  }
}

export function FontPicker({ value, onPick, onClose }: { value: string | undefined; onPick: (id: string) => void; onClose: () => void }) {
  const [have, setHave] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<{ id: string; p: number } | null>(null);

  const refresh = async () => {
    const next: Record<string, boolean> = {};
    for (const f of FONTS) {
      next[f.id] = await isDownloaded(f);
      if (next[f.id]) await ensureFontLoaded(f).catch(() => undefined);
    }
    setHave(next);
  };
  useEffect(() => {
    void refresh();
  }, []);

  const pick = async (f: AppFont) => {
    if (busy) return;
    if (!have[f.id]) {
      setBusy({ id: f.id, p: 0 });
      const ok = await confirmAndDownload(f, (p) => setBusy({ id: f.id, p }));
      setBusy(null);
      if (!ok) return;
      await refresh();
    }
    onPick(f.id);
    onClose();
  };

  return (
    <Sheet title="選擇字體" onClose={onClose}>
      <div class="font-list">
        {FONTS.map((f) => (
          <button key={f.id} class={`font-opt${value === f.id ? ' on' : ''}`} onClick={() => pick(f)}>
            <span class="font-opt-head">
              <b>{f.label}</b>
              <span class="muted small">
                {busy?.id === f.id ? `下載中 ${Math.round(busy.p * 100)}%` : have[f.id] ? '已下載' : `需下載 ${f.mb} MB`}
              </span>
            </span>
            <span class="font-sample" style={have[f.id] ? { fontFamily: `'${f.family}'` } : undefined}>
              拖拖記帳 $12,345 11/21
            </span>
            <span class="muted small">{f.desc}</span>
          </button>
        ))}
      </div>
      <p class="muted small">字體都是免費、可商用的開源字體。缺少的字會自動用手機字體顯示。</p>
    </Sheet>
  );
}
