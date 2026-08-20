@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "NO_PAUSE="
set "DRY_RUN="
set "ESP_PORT="

:parse_args
if "%~1"=="" goto :args_done
if /I "%~1"=="--no-pause" (
    set "NO_PAUSE=1"
) else if /I "%~1"=="--dry-run" (
    set "DRY_RUN=1"
) else if not defined ESP_PORT (
    set "ESP_PORT=%~1"
)
shift
goto :parse_args

:args_done
if not defined ESP_PORT (
    echo Enter the ESP32 serial port, for example COM5.
    echo Leave it blank to let ESP-IDF auto-detect the device.
    set /p "ESP_PORT=Port: "
)

rem Adjust IDF_PATH, or set it in the environment, if ESP-IDF lives elsewhere.
if not defined IDF_PATH set "IDF_PATH=C:\esp\v6.0.1\esp-idf"
if not exist "%IDF_PATH%\tools\idf.py" (
    echo ERROR: ESP-IDF was not found at "%IDF_PATH%".
    echo Set IDF_PATH or install ESP-IDF 6.x, then run this file again.
    set "MONITOR_RC=1"
    goto :finish
)

if not exist "build\stadia-dongle.elf" (
    echo ERROR: build\stadia-dongle.elf was not found.
    echo Run build_firmware.cmd first so log addresses can be decoded.
    set "MONITOR_RC=1"
    goto :finish
)

if defined DRY_RUN (
    if defined ESP_PORT (
        echo Dry run: idf.py -p "%ESP_PORT%" monitor
    ) else (
        echo Dry run: idf.py monitor ^(automatic port detection^)
    )
    set "MONITOR_RC=0"
    goto :finish
)

echo Starting live ESP32 log monitor. Press Ctrl+] to exit.
echo.

rem Activate ESP-IDF when this file is launched from Explorer instead of an
rem ESP-IDF command prompt.
where idf.py >nul 2>&1
if errorlevel 1 call "%IDF_PATH%\export.bat"

where idf.py >nul 2>&1
if errorlevel 1 (
    echo ERROR: The ESP-IDF environment could not be activated.
    echo Open an ESP-IDF command prompt and run "idf.py monitor" there,
    echo or repair the ESP-IDF installation at "%IDF_PATH%".
    set "MONITOR_RC=1"
    goto :finish
)

if defined ESP_PORT (
    call idf.py -p "%ESP_PORT%" monitor
) else (
    call idf.py monitor
)
if errorlevel 1 (set "MONITOR_RC=1") else set "MONITOR_RC=0"

:finish
if not "%MONITOR_RC%"=="0" (
    echo.
    echo Monitor stopped with exit code %MONITOR_RC%.
    echo If the port is busy, close other serial monitors and try again.
)

if not defined NO_PAUSE pause
exit /b %MONITOR_RC%
