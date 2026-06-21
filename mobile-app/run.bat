@echo off
cd /d "%~dp0"
echo.
echo  =========================================
echo   Sentra Mobile App + Backend Server
echo  =========================================
echo.

if not exist node_modules (
  echo Installing mobile app dependencies...
  npm install
)

if not exist "..\backend\node_modules" (
  echo Installing backend dependencies...
  cd "..\backend"
  npm install
  cd /d "%~dp0"
)

echo Starting Backend Server on Port 5000...
start "Sentra Backend" cmd /c "cd ..\backend && npm run start"

echo.
echo Starting Mobile App on Port 3001 (HTTP)...
echo.
echo  On your phone: open http://YOUR-PC-IP:3001
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Job { Set-Location '%~dp0'; npm run dev } | Out-Null; Start-Sleep 6; Start-Process 'http://localhost:3001'"
npm run dev
