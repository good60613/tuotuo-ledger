// 2.6 App 字體：選用時才下載（PK 定案），存在手機裡，之後不用網路。
// - 設定只存選了哪一套（settings.appFont）；字體檔不進備份，換手機要再下載一次。
// - 字體都是 SIL Open Font License 1.1（免費、可商用）。
// - 下載來源：各字體官方 GitHub（raw.githubusercontent.com，允許 App 直接下載）。
import { Capacitor } from '@capacitor/core';
import { FONT } from './config';

export type FontId = 'noto-sans' | 'huninn' | 'wenkai' | 'cubic';

interface FontFile {
  weight: number;
  url: string;
}
export interface AppFont {
  id: FontId;
  label: string;
  /** 一句話特色（設定頁小字） */
  desc: string;
  /** CSS 字型名稱（加前綴避免跟手機裝的同名字體混在一起） */
  family: string;
  files: FontFile[];
  /** 下載大小（MB，設定頁顯示用） */
  mb: number;
}

const GH = 'https://raw.githubusercontent.com';
export const FONTS: AppFont[] = [
  {
    id: 'noto-sans', label: '思源黑體', desc: '最清楚', family: 'TT Noto Sans TC', mb: 11.5,
    files: [
      { weight: 400, url: `${GH}/notofonts/noto-cjk/main/Sans/SubsetOTF/TC/NotoSansTC-Regular.otf` },
      { weight: 700, url: `${GH}/notofonts/noto-cjk/main/Sans/SubsetOTF/TC/NotoSansTC-Bold.otf` },
    ],
  },
  {
    id: 'huninn', label: '粉圓', desc: '圓圓的，可愛親切', family: 'TT jf openhuninn', mb: 4.9,
    files: [{ weight: 400, url: `${GH}/justfont/open-huninn-font/master/font/jf-openhuninn-2.1.ttf` }],
  },
  {
    // 文楷只下載一般粗細：它的「粗」只是 Medium，跟一般差不多，卻要多 15 MB
    id: 'wenkai', label: '霞鶩文楷', desc: '有書寫感，偏文青', family: 'TT LXGW WenKai TC', mb: 15.3,
    files: [{ weight: 400, url: `${GH}/lxgw/LxgwWenkaiTC/main/fonts/TTF/LXGWWenKaiTC-Regular.ttf` }],
  },
  {
    id: 'cubic', label: '俐方體 11 號', desc: '像素風，像老遊戲的字', family: 'TT Cubic 11', mb: 2.8,
    files: [{ weight: 400, url: `${GH}/ACh-K/Cubic-11/main/fonts/ttf/Cubic_11.ttf` }],
  },
];

/** 切到「App 字體」時第一個選好的（PK 定案：黑體） */
export const DEFAULT_APP_FONT: FontId = 'noto-sans';

export const fontById = (id: string | undefined) => FONTS.find((f) => f.id === id);

const native = () => Capacitor.isNativePlatform();
const filePath = (f: AppFont, w: number) => `${FONT.dir}/${f.id}-${w}.font`;

async function fsApi() {
  return import('@capacitor/filesystem');
}

/** 這套字體檔是否都已經在手機裡（網頁版沒有存檔，一律當作有，直接從網路載入） */
export async function isDownloaded(f: AppFont): Promise<boolean> {
  if (!native()) return true;
  const { Filesystem, Directory } = await fsApi();
  for (const file of f.files) {
    try {
      await Filesystem.stat({ path: filePath(f, file.weight), directory: Directory.Data });
    } catch {
      return false;
    }
  }
  return true;
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

/**
 * 下載一套字體存進手機。onProgress 給 0～1。
 * 先寫成暫存檔、全部成功才改成正式檔名，中途失敗不會留下壞掉的半個檔。
 */
export async function downloadFont(f: AppFont, onProgress?: (p: number) => void): Promise<void> {
  if (!native()) return;
  const { Filesystem, Directory } = await fsApi();
  let done = 0;
  for (const file of f.files) {
    const resp = await fetch(file.url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const tmp = `${filePath(f, file.weight)}.part`;
    await Filesystem.writeFile({ path: tmp, data: await toBase64(blob), directory: Directory.Data, recursive: true });
    await Filesystem.rename({ from: tmp, to: filePath(f, file.weight), directory: Directory.Data, toDirectory: Directory.Data });
    done += 1;
    onProgress?.(done / f.files.length);
  }
}

/** 刪掉一套已下載的字體（換別套時不自動刪，留著下次切回來不用再下載） */
export async function removeFont(f: AppFont): Promise<void> {
  if (!native()) return;
  const { Filesystem, Directory } = await fsApi();
  for (const file of f.files) {
    try {
      await Filesystem.deleteFile({ path: filePath(f, file.weight), directory: Directory.Data });
    } catch {
      /* 本來就沒有 */
    }
  }
}

/** 每套只載入一次（同時有兩處要載入時共用同一個，失敗就清掉讓下次重試） */
const loading = new Map<FontId, Promise<void>>();

function loadFaces(f: AppFont): Promise<void> {
  let p = loading.get(f.id);
  if (!p) {
    p = loadFacesOnce(f).catch((e) => {
      loading.delete(f.id);
      throw e;
    });
    loading.set(f.id, p);
  }
  return p;
}

async function loadFacesOnce(f: AppFont): Promise<void> {
  for (const file of f.files) {
    let src = file.url;
    if (native()) {
      const { Filesystem, Directory } = await fsApi();
      const { uri } = await Filesystem.getUri({ path: filePath(f, file.weight), directory: Directory.Data });
      src = Capacitor.convertFileSrc(uri);
    }
    const face = new FontFace(f.family, `url("${src}")`, { weight: String(file.weight), display: 'swap' });
    await face.load();
    document.fonts.add(face);
  }
}

/** 已下載的字體先載入（選字體彈窗的範例要用該字體顯示） */
export async function ensureFontLoaded(f: AppFont): Promise<void> {
  await loadFaces(f);
}

/**
 * 套用字體：'system' 或沒下載的字體 → 回到手機字體。回傳實際有沒有套上 App 字體。
 * 換字體不動任何資料，只改 <html> 上的 --app-font。
 */
export async function applyAppFont(id: string | undefined): Promise<boolean> {
  const root = document.documentElement;
  const f = fontById(id);
  if (!f || !(await isDownloaded(f))) {
    root.style.removeProperty('--app-font');
    return false;
  }
  try {
    await loadFaces(f);
    root.style.setProperty('--app-font', `'${f.family}'`);
    return true;
  } catch {
    root.style.removeProperty('--app-font');
    return false;
  }
}
