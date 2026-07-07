@echo off
echo Starting Fantasy Dynasty Central - Full Application
echo.
echo This will start both the frontend and backend servers
echo Frontend will be available at http://localhost:3000
echo Backend will be available at http://localhost:3001
echo.
echo Press Ctrl+C to stop all servers when you're done.
echo.

REM Start backend server in background
echo Starting backend server...
start "Backend Server" cmd /k "cd backend && npm start"

REM Wait a moment for backend to start
timeout /t 3 /nobreak > nul

REM Start frontend development server
echo Starting frontend development server...
npm run dev

pause 