@echo off
rem Windows: double-click this file to start the panel.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)

for /f %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 18 (
  echo Node.js 18 or newer is needed. Update it from https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run: installing dependencies...
  call npm install --omit=dev
  if errorlevel 1 (
    echo Install failed.
    pause
    exit /b 1
  )
)

node src\server.js
pause
