@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 22 or newer from https://nodejs.org then run this again.
 pause
 exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<22)process.exit(1)"
if errorlevel 1 (
 echo Please update to Node.js 22 or newer.
 pause
 exit /b 1
)
node server.mjs --open
pause
