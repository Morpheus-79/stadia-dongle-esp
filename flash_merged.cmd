@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem Flash the merged installer image produced by create_merged_fw.cmd.
rem Usage: flash_merged.cmd [PORT]   e.g.  flash_merged.cmd COM5

set "ESP_PORT=%~1"
if not defined ESP_PORT (
    echo Enter the ESP32 serial port, for example COM5.
    set /p "ESP_PORT=Port: "
)

if not exist "docs\firmware-merged.bin" (
    echo ERROR: docs\firmware-merged.bin was not found.
    echo Run create_merged_fw.cmd first.
    pause
    exit /b 1
)

esptool.py --chip esp32s3 --port "%ESP_PORT%" --baud 460800 write-flash 0x0 docs\firmware-merged.bin
set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (
    echo.
    echo Flash failed with exit code %RC%.
    echo Run this from an ESP-IDF command prompt so esptool is on PATH.
)

pause
exit /b %RC%
