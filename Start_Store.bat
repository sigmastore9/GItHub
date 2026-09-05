@echo off
chcp 65001 > nul
title MY Store
cd /d "%~dp0"

if exist "dist\MY Store-win32-x64\MY Store.exe" (
    start "" "dist\MY Store-win32-x64\MY Store.exe"
) else (
    set "PATH=C:\Program Files\nodejs;%PATH%"
    start "" npx electron .
)
