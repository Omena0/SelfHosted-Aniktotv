@echo off
echo ========================================
echo   AniStash Play - Installation Script
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [1/3] Installing server dependencies...
echo.
cd site\server
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install server dependencies
    cd ..\..
    pause
    exit /b 1
)
cd ..\..

echo.
echo [2/3] Installing client dependencies...
echo.
cd site\client
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install client dependencies
    cd ..\..
    pause
    exit /b 1
)

echo.
echo [3/3] Building client...
echo.
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to build client
    cd ..\..
    pause
    exit /b 1
)
cd ..\..

echo.
echo ========================================
echo   Installation Successful!
echo ========================================
echo.
echo Next steps:
echo   1. Edit config.json to set your anime library path
echo   2. Run 'run.bat' to start the server
echo   3. Open http://localhost:4321 in your browser
echo.
echo Starting server now...
timeout /t 2 /nobreak > nul
call run.bat
