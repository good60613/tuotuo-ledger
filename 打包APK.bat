@echo off
chcp 65001 >nul
rem 一鍵打包正式版 APK：建網頁 → 同步到 Android 專案 → 用正式金鑰簽章打包
rem Java 用 Android Studio 內建的那一份（Android Studio 裝在 D:\1）
set "JAVA_HOME=D:\1\jbr"
cd /d "%~dp0"
call npm run build || goto :fail
call npx cap sync android || goto :fail
cd android
call .\gradlew.bat assembleRelease || goto :fail
cd /d "%~dp0"
rem 複製一份到專案資料夾裡的 APK 資料夾，檔名帶版本號，比較好找
for /f "tokens=2" %%v in ('findstr /c:"versionName" android\app\build.gradle') do set "VER=%%~v"
if not exist APK mkdir APK
copy /y "android\app\build\outputs\apk\release\app-release.apk" "APK\拖拖記帳-%VER%.apk" >nul
echo.
echo ===== 打包完成 =====
echo APK 位置：%~dp0APK\拖拖記帳-%VER%.apk
pause
exit /b 0
:fail
echo.
echo ===== 打包失敗，請把上面的錯誤訊息截圖或複製給 Claude =====
pause
exit /b 1
