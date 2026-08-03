@echo off
cd /d "%~dp0site"

echo Starting AniStash Play Server...
echo.

REM Get local IP address
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do set IP=%%a
set IP=%IP:~1%

echo ========================================
echo   AniStash Play is starting...
echo ========================================
echo.
echo   Local:    http://localhost:4321
echo   Network:  http://%IP%:4321
echo.
echo   You can open this on your phone too!
echo   Just use the Network URL above.
echo ========================================
echo.

start /min cmd /c "npm start"
timeout /t 3 /nobreak > nul
start http://localhost:4321
