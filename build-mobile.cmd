@echo off
echo ============================================================
echo AZ Tamer - Mobile Build script
echo ============================================================

echo [1/4] Building Vite project...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Vite build failed!
    exit /b %ERRORLEVEL%
)

echo [2/4] Syncing assets to Android wrapper...
if not exist "android\app\src\main\assets" mkdir "android\app\src\main\assets"
if exist "android\app\src\main\assets\dist" rmdir /s /q "android\app\src\main\assets\dist"
xcopy /s /e /i /q dist android\app\src\main\assets\dist
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Assets copy failed!
    exit /b %ERRORLEVEL%
)

echo [3/4] Packaging Android application...
cd android
call gradlew.bat assembleDebug
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Gradle compilation failed!
    cd ..
    exit /b %ERRORLEVEL%
)
cd ..

echo [4/4] Build complete!
echo.
echo Your APK file is ready at:
echo android\app\build\outputs\apk\debug\app-debug.apk
echo ============================================================
pause
