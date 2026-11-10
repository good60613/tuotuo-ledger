@echo off
chcp 65001 >nul
rem One-click release APK: build web, sync to Android, sign and package.
rem Java is the one bundled with Android Studio, installed at D drive folder 1.
set "JAVA_HOME=D:\1\jbr"
cd /d "%~dp0"
call npm run build || goto :fail
call npx cap sync android || goto :fail
cd android
call .\gradlew.bat assembleRelease || goto :fail
cd /d "%~dp0"
rem Copy the APK into the APK folder with the version in its name.
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
