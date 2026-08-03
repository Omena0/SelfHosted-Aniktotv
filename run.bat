@echo off
cd /d "%~dp0site"
start /min cmd /c "npm start"
timeout /t 2 /nobreak > nul
start http://localhost:4321
