@echo off
cd /d %~dp0
title MapsShield Pro - Google Maps Review Reporter
set ELECTRON_ENABLE_LOGGING=0
set ELECTRON_NO_ATTACH_CONSOLE=1
echo ===================================================
echo   MapsShield Pro - Desktop Application Launcher
echo ===================================================
echo Starting Electron Desktop App...
if exist "node_modules\.bin\electron.cmd" (
  call "node_modules\.bin\electron.cmd" .
) else (
  npm run app
)
if errorlevel 1 (
  echo.
  echo [ERROR] Failed to start. Make sure dependencies are installed.
  pause
)
