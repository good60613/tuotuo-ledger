# GitHub 使用說明（給非工程師）

倉庫：https://github.com/good60613/tuotuo-ledger

這份說明講三件事：用手機請 Claude 改程式並試用、第一次要做的一次性設定、怎麼發正式版讓 App 自動提醒更新。

## 一、在手機上用 Claude 改程式、試用、發版

整個流程是一條線：

1. **開分支**：請 Claude 開一個新分支，名字要用 `v` 開頭，例如 `v3.4`、`v3.4-試做`。（只有 `v` 開頭的分支會自動打包。）
2. **改程式、push**：Claude 改完後 push 到 GitHub。
3. **Actions 自動出 APK**：push 之後 GitHub 會自動在雲端打包（約 5～10 分鐘）。
4. **下載來裝**：手機瀏覽器開倉庫 → 上方〔Actions〕→ 點最新那一筆（綠色勾勾＝成功）→ 拉到最下面〔Artifacts〕→ 下載 `tuotuo-ledger-版本-b編號.apk`（下載下來是 zip，解壓縮後裝裡面的 apk）。這個 APK 用的是同一把正式金鑰，可以直接覆蓋安裝，資料不會掉。試用檔只保留 14 天。
5. **滿意才合併**：試用沒問題，再把分支合併進 `main`。不滿意就繼續請 Claude 改，不用合併。
6. **打 tag 發正式版**：在電腦或手機打一個 `v3.x.x` 的 tag（做法見第三段）。GitHub 會自動打包、建立 Release、附上 APK。
7. **App 自動提醒**：使用者的 App 開啟時會檢查有沒有新版，發現就跳出視窗，按〔下載更新〕就能裝。

## 二、第一次要做的一次性設定

到倉庫網頁：**Settings → Secrets and variables → Actions → New repository secret**，新增下面四個（名稱要一模一樣）：

| 名稱 | 用途 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | 簽章金鑰檔（.jks）轉成文字後的內容 |
| `ANDROID_KEYSTORE_PASSWORD` | 金鑰檔的密碼 |
| `ANDROID_KEY_ALIAS` | 金鑰的別名 |
| `ANDROID_KEY_PASSWORD` | 金鑰本身的密碼 |

做法重點：

- 在電腦上把金鑰檔轉成文字，例如用 PowerShell：`[Convert]::ToBase64String([IO.File]::ReadAllBytes("金鑰檔的完整路徑"))`，把印出來的一長串整段複製，貼到 `ANDROID_KEYSTORE_BASE64`。
- 另外三個的值，就是電腦打包時用的那份 `keystore.properties` 裡的密碼與別名。
- Secrets 存進去之後網頁上看不到內容，也不會出現在打包紀錄裡（GitHub 會自動遮住）。
- 沒設定就去打包的話，Actions 會直接失敗，並顯示「還沒設定簽章金鑰 Secrets」。

## 三、打 tag 發正式版

先確認 `android/app/build.gradle` 裡的 `versionCode`（要比上一版大）和 `versionName`（要跟 tag 同一個數字，例如 tag 是 `v3.4.0` 就是 `"3.4.0"`）已經改好、也已經合併進 `main`。不一致的話打包會直接失敗，免得 App 以為永遠有新版。

可選：在 `release-notes/v3.4.0.md` 寫更新說明（白話幾行），App 的更新視窗會顯示它的前 10 行。沒寫就由 GitHub 自動產生。

在電腦（切到 `main`、已經是最新）：

```
git tag v3.4.0
git push origin v3.4.0
```

打錯想重來（還沒有人更新的話）：

```
git tag -d v3.4.0
git push origin :refs/tags/v3.4.0
```

然後到倉庫〔Releases〕把失敗或打錯的那筆刪掉，再重打。

手機上沒有指令列時，也可以直接請 Claude 幫你打 tag。

## 四、注意事項

- **金鑰絕對不能進 git。** `.jks`、`keystore.properties`、任何密碼都不要放進專案、不要貼進對話或 Issue。倉庫是公開的，放上去就等於公開。金鑰只存在你電腦的專案外資料夾，以及 GitHub 的 Secrets。
- **金鑰遺失就無法更新。** 電腦那份金鑰檔請另外備份；換了金鑰的 APK，手機會拒絕覆蓋安裝。
- **`versionCode` 每次必須遞增。** 手機看這個數字判斷能不能覆蓋安裝，沒比上一版大就裝不上去。試用版也一樣，每次要裝的新 APK 都要比手機上現有的大。
- 打包要先通過型別檢查與測試，不過的話不會出 APK，請 Claude 看失敗原因。
- 更新檢查只會連到 GitHub 查最新版本，不會傳送你的任何資料。想關掉可以到設定關閉〔自動檢查更新〕。
