@echo off
echo Starting Iron & Steel Management System...
echo.

echo [1/3] Installing backend dependencies...
cd backend
call npm install
if errorlevel 1 goto error

echo.
echo [2/3] Installing frontend dependencies...
cd ..\frontend
call npm install
if errorlevel 1 goto error

echo.
echo [3/3] Starting servers...
cd ..

start "Backend Server" cmd /k "cd backend && npm run dev"
timeout /t 3 /nobreak >nul
start "Frontend Server" cmd /k "cd frontend && npm run dev"

echo.
echo ✅ Servers starting!
echo    Backend:  http://localhost:5000
echo    Frontend: http://localhost:3000
echo.
echo To seed the database with initial data (users + machines), run:
echo   cd backend
echo   node src/services/seedData.js
echo.
pause
goto end

:error
echo ❌ An error occurred. Check the output above.
pause

:end
