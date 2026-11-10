# 一鍵打包 APK（由 打包APK.bat 呼叫）：建網頁 → 同步到 Android → 簽章打包 → 複製到 APK 資料夾。
# 中文都放在這個檔（UTF-8 含 BOM），批次檔只留英文，避免 cmd 讀錯位置。
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
# Java 用 Android Studio 附的那一份（裝在 D:\1）
$env:JAVA_HOME = 'D:\1\jbr'

function Step($name, [scriptblock]$cmd) {
  Write-Host "`n===== $name =====" -ForegroundColor Cyan
  & $cmd
  if ($LASTEXITCODE -ne 0) { throw "$name 失敗" }
}

try {
  Step '建置網頁' { npm run build }
  Step '同步到 Android' { npx cap sync android }
  Set-Location (Join-Path $root 'android')
  # 先停掉上次留在背景的打包程式，避免它佔住暫存資料夾（mergeReleaseAssets 刪不掉）
  & .\gradlew.bat --stop | Out-Null
  Step '簽章打包' { & .\gradlew.bat assembleRelease }
  Set-Location $root
  $ver = (Select-String -Path 'android\app\build.gradle' -Pattern 'versionName\s+"([^"]+)"').Matches[0].Groups[1].Value
  New-Item -ItemType Directory -Force 'APK' | Out-Null
  $out = Join-Path $root "APK\拖拖記帳-$ver.apk"
  Copy-Item 'android\app\build\outputs\apk\release\app-release.apk' $out -Force
  Write-Host "`n===== 打包完成 =====" -ForegroundColor Green
  Write-Host "APK 位置：$out"
  exit 0
} catch {
  Write-Host "`n===== 打包失敗：$($_.Exception.Message) =====" -ForegroundColor Red
  Write-Host '請把上面的錯誤訊息複製給 Claude'
  exit 1
}
