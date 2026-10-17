@echo off
cd /d %~dp0
title MapsShield Pro - Google Maps Review Reporter
set ELECTRON_ENABLE_LOGGING=0
set ELECTRON_NO_ATTACH_CONSOLE=1
echo ===================================================
echo   MapsShield Pro - Desktop Application Launcher
echo ===================================================

:: Check if Node.js is installed
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js is not installed or not found in PATH!
  echo Please download and install Node.js (LTS version) from:
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [INFO] Dependencies not found. Installing packages...
  echo This may take a minute...
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] Failed to install dependencies.
    echo Please check your internet connection and run "npm install" manually.
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

