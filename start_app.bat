@echo off
cd /d %~dp0
title MapsShield Pro - Google Maps Review Reporter
set ELECTRON_ENABLE_LOGGING=0
set ELECTRON_NO_ATTACH_CONSOLE=1
echo ===================================================
echo   MapsShield Pro - Desktop Application Launcher
echo ===================================================

if not exist "node_modules" (
  echo [INFO] Dependencies not found. Installing packages...
  echo This may take a minute...
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] Failed to install dependencies.
    echo Please run "npm install" manually in this directory.
    pause
    exit /b 1
  )
)

echo Starting Electron Desktop App...
if exist "node_modules\.bin\electron.cmd" (
  call "node_modules\.bin\electron.cmd" .
) else (
  call npm run app
)
if errorlevel 1 (
  echo.
  echo [ERROR] Failed to start. Make sure dependencies are installed.
  pause
)

