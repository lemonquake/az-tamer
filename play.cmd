@echo off
title AZ Tamer Launcher
echo ========================================================
echo                  AZ Tamer Launcher                     
echo ========================================================
echo.

:: Ensure we are in the script's directory
cd /d "%~dp0"

:: Check if Node.js is installed
echo [1/3] Checking Node.js installation...
node -v >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not added to your system's PATH.
    echo Please download and install Node.js from: https://nodejs.org/
    echo After installation, restart this script.
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js is installed.

:: Check if npm is installed
call npm -v >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm is not installed or not added to your system's PATH.
    echo Please download and install Node.js from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Check if node_modules exists, if not run npm install
echo [2/3] Checking dependencies...
if not exist "node_modules\" (
    echo [INFO] node_modules folder is missing. Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed. Please check your internet connection and try again.
        pause
        exit /b %errorlevel%
    )
) else (
    echo [OK] Dependencies are already installed.
)

:: Run the dev server and open in browser
echo [3/3] Starting the local game server...
echo.
echo The game will automatically open in your default browser.
echo Leave this window open while playing the game.
echo Press Ctrl+C in this window to stop the server when you are done.
echo --------------------------------------------------------
echo.

call npm run dev -- --open

if %errorlevel% neq 0 (
    echo.
    echo [WARNING] npm run dev exited with code %errorlevel%.
    pause
)
