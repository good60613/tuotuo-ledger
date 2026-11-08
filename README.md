# 拖拖記帳

> 一拖就記，再也不拖拖拉拉

PK 自用的多帳戶記帳 App（原名「記帳」，網頁試玩版與 Android APK）。規格見 `施工工單.md`。

## 在手機上試玩

1. 手機和電腦連**同一個 Wi-Fi**。
2. 在這個資料夾雙擊 **`start-dev.bat`**，會開一個黑色視窗（試玩時別關，關掉＝停止）。
3. 黑色視窗會印出一行 `Network: http://192.168.x.x:5173/`。
4. 用手機 **Chrome** 打開那個網址。
5. 第一次開時，Windows 若跳出防火牆詢問，請按「允許」。

> 資料存在手機瀏覽器裡，跟著「網址」走。電腦的區網位址如果變了（例如換 Wi-Fi），
> 手機上看到的會是一份新的空資料。換之前請先在「設定 → 匯出備份」。

## 微調手感

所有手勢數值都在 **`src/config.ts`**：長按時間、移動門檻、換頁距離、震動長度、拖曳時卡片大小……
改完存檔，手機重新整理就會生效。

## 常用指令

| 指令 | 用途 |
|---|---|
| `npm run dev` | 開試玩伺服器（同 `start-dev.bat`） |
| `npm test` | 跑自動檢查（計算規則、報帳流程、計算機） |
| `npm run build` | 打包成正式檔案，放在 `dist/`（之後給 Capacitor 用） |

## 資料夾結構

```
src/
  config.ts          手勢與防誤觸設定（要調手感改這裡）
  data/              資料格式、計算規則、記帳/報帳操作、儲存、備份、範例資料
  gestures/          卡片拖曳、左右換頁、震動、防誤觸護盾
  pages/             五個主頁面 + 記帳頁
  components/        卡片、小球、計算機、時間軸、圖表、選單
tests/               自動檢查
```

## 之後包成 Android APK（Capacitor）

程式已預留這個方向：打包輸出在 `dist/`、路徑用相對位置、震動和儲存各自集中在一個檔案。
到時候在這個資料夾大致會做：

```
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/haptics
npx cap init 記帳 com.pk.ledger --web-dir dist
npm run build
npx cap add android
npx cap open android      ← 用 Android Studio 打包 APK
```

要改的地方：
- `src/gestures/haptics.ts` → 改用 `@capacitor/haptics`
- `src/data/storage.ts` → 視需要改成 Capacitor 的儲存方式（IndexedDB 在 APK 裡也能用）

## 已知限制

- iPhone 的瀏覽器不支援震動（視覺回饋仍有）；iPhone 版之後再移植。
- 試玩版不做：小帳戶專屬頁面、預算、月份切換、信用卡、雲端同步、視覺風格定稿。
