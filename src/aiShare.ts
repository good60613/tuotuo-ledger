// 3.0 從其他軟體匯入：把「舊檔案＋格式說明＋範本＋提示詞」一起交給使用者的 AI。
// APK：存到暫存資料夾，跳出 Android 分享選單（選 ChatGPT、Gemini、Claude…）。
// 網頁版：下載格式說明與範本（舊檔案本來就在使用者手上）。
// 有些 AI App 收檔案時不收文字，所以提示詞一律先複製到剪貼簿。
import { AI_PROMPT, formatDoc, templateData } from './data/aiImport';
import { exportJson, downloadText } from './data/backup';
import type { AppData } from './data/types';

const DOC_NAME = '拖拖記帳-格式說明.md';
const TEMPLATE_NAME = '拖拖記帳-範本.json';

/** 複製文字；成功回傳 true */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

/**
 * 分享給 AI。回傳給使用者看的提示；使用者關掉分享選單回傳 null。
 * oldFiles 可以是空的（使用者打算在 AI 那邊自己附檔）。
 */
export async function shareToAi(data: AppData, oldFiles: File[]): Promise<string | null> {
  const copied = await copyText(AI_PROMPT);
  const doc = formatDoc();
  const tpl = exportJson(templateData(data), 'full');
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) {
    downloadText(DOC_NAME, doc);
    downloadText(TEMPLATE_NAME, tpl);
    return copied ? '已下載格式說明與範本，提示詞已複製' : '已下載格式說明與範本';
  }
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const dir = 'ai-import';
  const uris: string[] = [];
  for (const f of oldFiles) {
    // 檔名只留安全字元，避免某些 App 讀不到
    const name = f.name.replace(/[\\/:*?"<>|]/g, '_') || 'old-backup';
    const r = await Filesystem.writeFile({ path: `${dir}/${name}`, data: await toBase64(f), directory: Directory.Cache, recursive: true });
    uris.push(r.uri);
  }
  uris.push((await Filesystem.writeFile({ path: `${dir}/${DOC_NAME}`, data: doc, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true })).uri);
  uris.push((await Filesystem.writeFile({ path: `${dir}/${TEMPLATE_NAME}`, data: tpl, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true })).uri);
  try {
    await Share.share({ title: '搬家到拖拖記帳', text: AI_PROMPT, files: uris, dialogTitle: '交給哪個 AI？' });
  } catch {
    return null;
  }
  return copied ? '提示詞已複製，如果 AI 那邊沒有出現文字，貼上就好' : '已分享';
}
