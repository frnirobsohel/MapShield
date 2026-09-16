@echo off
title Google Unified Automation Agent
echo ========================================================
echo   Starting Google Unified Automation System...
echo ========================================================
cd /d "%~dp0"
node agent.js
pause
