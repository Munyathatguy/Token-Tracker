@echo off
cd /d "%~dp0"
if exist "dist\win-unpacked\Token Tracker.exe" (
  start "" "%~dp0dist\win-unpacked\Token Tracker.exe"
) else (
  call npm start
)
