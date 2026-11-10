@echo off
rem One-click release APK. Real steps are in tools\pack-apk.ps1 (Chinese text lives there).
rem Keep this file ASCII-only with CRLF line endings, otherwise cmd misreads it.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\pack-apk.ps1"
pause
