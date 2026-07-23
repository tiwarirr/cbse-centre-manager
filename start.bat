@echo off
REM Double-click this to start the app — runs start.ps1 without needing to
REM open PowerShell yourself or change its execution policy.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
pause
