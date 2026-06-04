@echo off
title PrintShop — Build
echo Building printshop.exe ...
set CGO_ENABLED=0
go build -ldflags="-s -w" -o printshop.exe ./cmd/printshop
if %errorlevel% neq 0 (
    echo.
    echo BUILD FAILED. Check the error above.
    pause
    exit /b 1
)
echo.
echo Done! Run printshop.exe to start.
pause
