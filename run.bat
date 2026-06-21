@echo off
REM Lightweight wrapper to invoke the PowerShell runner (robust)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1"
