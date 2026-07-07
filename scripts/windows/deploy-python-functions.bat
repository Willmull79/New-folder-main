@echo off
echo ========================================
echo Deploying Enhanced Fantasy Football App
echo with Python Draft Engine Integration
echo ========================================

echo.
echo [1/5] Installing Python dependencies...
cd functions
py -m pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo ERROR: Failed to install Python dependencies
    echo Please ensure Python 3.8+ is installed and pip is available
    pause
    exit /b 1
)

echo.
echo [2/5] Testing Python draft engine...
py -c "from draftEngine import DraftEngine; engine = DraftEngine(); print('Python engine loaded successfully')"
if %errorlevel% neq 0 (
    echo ERROR: Python draft engine test failed
    echo Please check Python installation and dependencies
    pause
    exit /b 1
)

echo.
echo [3/5] Building and deploying Firebase Functions...
firebase deploy --only functions
if %errorlevel% neq 0 (
    echo ERROR: Firebase deployment failed
    pause
    exit /b 1
)

echo.
echo [4/5] Verifying deployment...
firebase functions:list
if %errorlevel% neq 0 (
    echo WARNING: Could not list functions
)

echo.
echo [5/5] Starting development server...
cd ..
npm run dev

echo.
echo ========================================
echo Deployment Complete!
echo ========================================
echo.
echo Enhanced Features Available:
echo - Python-powered draft analysis
echo - Advanced player value calculations
echo - Optimal pick recommendations
echo - Risk factor analysis
echo - Draft strategy recommendations
echo.
echo Access your app at: http://localhost:3000
echo.
pause 