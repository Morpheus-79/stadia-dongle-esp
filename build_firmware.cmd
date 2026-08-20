@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "NO_PAUSE="
if /I "%~1"=="--no-pause" set "NO_PAUSE=1"

rem Adjust IDF_PATH, or set it in the environment, if ESP-IDF lives elsewhere.
if not defined IDF_PATH set "IDF_PATH=C:\esp\v6.0.1\esp-idf"
if not exist "%IDF_PATH%\tools\idf.py" (
    echo ERROR: ESP-IDF was not found at "%IDF_PATH%".
    echo Set IDF_PATH or install ESP-IDF 6.x, then run this file again.
    set "BUILD_RC=1"
    goto :finish
)

rem Activate ESP-IDF when this file is launched from Explorer instead of an
rem ESP-IDF command prompt.
where idf.py >nul 2>&1
if errorlevel 1 call "%IDF_PATH%\export.bat"

where idf.py >nul 2>&1
if errorlevel 1 (
    echo ERROR: The ESP-IDF environment could not be activated.
    echo Open an ESP-IDF command prompt and run "idf.py build" there,
    echo or repair the ESP-IDF installation at "%IDF_PATH%".
    set "BUILD_RC=1"
    goto :finish
)

echo Building Stadia dongle firmware...
call idf.py build
if errorlevel 1 (set "BUILD_RC=1") else set "BUILD_RC=0"

:finish
if "%BUILD_RC%"=="0" (
    echo.
    echo Build completed successfully.
    echo Firmware: "%CD%\build\stadia-dongle.bin"
) else (
    echo.
    echo Build failed with exit code %BUILD_RC%.
)

if not defined NO_PAUSE pause
exit /b %BUILD_RC%
