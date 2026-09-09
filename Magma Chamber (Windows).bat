@echo off
rem Double-click to run Magma Chamber locally on Windows.
rem Requires Node.js. Closing this window stops the app.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and run this again.
  pause
  exit /b 1
)

start "" http://localhost:8080
node tools\serve.js 8080

pause
