@echo off
rem Double-clic : lance Quick Cooking en local sur http://localhost:3000 (données d'exemple ou data\export.json).
cd /d "%~dp0"
where node >nul 2>nul || (echo Installez Node.js 22 LTS depuis https://nodejs.org puis relancez. & pause & exit /b 1)
start "" http://localhost:3000
node server.mjs --port 3000
pause
