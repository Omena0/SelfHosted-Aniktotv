@echo off
echo ========================================
echo   Preparing AniStash Play for GitHub
echo ========================================
echo.

echo [1/3] Initializing Git repository...
git init
if %ERRORLEVEL% NEQ 0 (
    echo Git repository already initialized
)

echo.
echo [2/3] Adding files to Git...
git add .

echo.
echo [3/3] Creating initial commit...
git commit -m "Initial commit: AniStash Play - Self-hosted anime streaming server"

echo.
echo ========================================
echo   Ready for GitHub!
echo ========================================
echo.
echo Next steps:
echo   1. Create a new repository on GitHub named "AniStash-Play"
echo   2. Run these commands:
echo.
echo      git remote add origin https://github.com/YOUR_USERNAME/AniStash-Play.git
echo      git branch -M main
echo      git push -u origin main
echo.
pause
