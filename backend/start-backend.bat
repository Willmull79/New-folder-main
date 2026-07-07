@echo off
echo ========================================
echo Fantasy Football Backend Server
echo ========================================
echo.

echo Checking Node.js installation...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js version:
node --version

echo.
echo Checking if dependencies are installed...
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

echo.
echo Checking environment file...
if not exist ".env" (
    echo Creating .env file from template...
    copy "config.env.example" ".env"
    echo.
    echo IMPORTANT: Please edit the .env file with your configuration
    echo Press any key to continue...
    pause
)

echo.
echo Starting backend server...
echo.
echo Server will be available at: http://localhost:3001
echo API Documentation: http://localhost:3001/api/docs
echo Health Check: http://localhost:3001/health
echo.
echo Press Ctrl+C to stop the server
echo.

npm run dev 