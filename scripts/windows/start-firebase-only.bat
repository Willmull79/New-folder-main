@echo off
echo Starting Fantasy Dynasty Central - Firebase Backend Only
echo.
echo This will start the frontend with Firebase as the backend
echo Frontend will be available at http://localhost:3000
echo Firebase handles authentication and database
echo.
echo Press Ctrl+C to stop the server when you're done.
echo.

REM Start frontend development server
echo Starting frontend with Firebase backend...
npm run dev

pause 