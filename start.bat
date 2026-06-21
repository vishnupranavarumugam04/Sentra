@echo off
cd /d "%~dp0"
echo Starting Sentra Crisis Damage Reporting Platform...

:: Check Node
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js is not available in PATH. Please install Node.js.
    pause
    exit /b 1
)

:: Install backend deps
if not exist "backend\node_modules\" (
    echo Installing backend dependencies...
    cd backend
    call npm install
    cd ..
)

:: Install frontend deps
if not exist "frontend\node_modules\" (
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

:: Seed database if script exists
if exist "backend\seed.js" (
    echo Seeding backend database ^(if needed^)...
    cd backend
    call npm run seed
    cd ..
)

:: Start backend
echo Starting backend server...
start "Sentra Backend" cmd /k "cd backend && npm start"

:: Start frontend
echo Starting frontend server...
start "Sentra Frontend" cmd /k "cd frontend && npm run dev"

:: Wait 5 seconds for frontend to compile
echo Waiting for servers to initialize...
timeout /t 5 /nobreak >nul

:: Open browser
echo Opening browser...
start http://localhost:3001/

echo.
echo Sentra startup launched successfully!
echo - Frontend: http://localhost:3001
echo - Backend API: http://localhost:5000
echo.
echo Please close the newly spawned command prompt windows when you are finished to stop the servers.
pause
