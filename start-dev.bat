@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo.
echo  ===== Ledger App (trial) =====
echo  On your phone, open the "Network" address shown below.
echo  Keep this window open while testing. Close it to stop.
echo.
call npm run dev
pause
