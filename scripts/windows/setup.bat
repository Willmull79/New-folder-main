@echo off
echo Setting up Fantasy Dynasty Central...
echo.

echo Installing frontend dependencies...
npm install

echo.
echo Installing backend dependencies...
cd backend
npm install
cd ..

echo.
echo Creating backend configuration...
if not exist "backend\config.env" (
    copy "backend\config.env.example" "backend\config.env"
    echo Backend configuration file created. Please update backend\config.env with your settings.
) else (
    echo Backend configuration already exists.
)

echo.
echo Checking for required files...
if exist "webpack.config.js" (
    echo ✓ Webpack configuration found
) else (
    echo ✗ Webpack configuration missing
)

if exist "src\index.js" (
    echo ✓ Frontend entry point found
) else (
    echo ✗ Frontend entry point missing
)

if exist "backend\server.js" (
    echo ✓ Backend server found
) else (
    echo ✗ Backend server missing
)

echo.
echo Setup complete! You can now run the application with:
echo   start-full-app.bat
echo.
echo Or manually:
echo   npm run dev          (frontend)
echo   cd backend && npm start  (backend)
echo.
pause 