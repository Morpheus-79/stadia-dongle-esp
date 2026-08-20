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
    echo Leave it blank to let esptool auto-detect the device.
    set /p "ESP_PORT=Port: "
)

rem Adjust IDF_PATH, or set it in the environment, if ESP-IDF lives elsewhere.
if not defined IDF_PATH set "IDF_PATH=C:\esp\v6.0.1\esp-idf"
if not exist "%IDF_PATH%\tools\idf.py" (
    echo ERROR: ESP-IDF was not found at "%IDF_PATH%".
    echo Set IDF_PATH or install ESP-IDF 6.x, then run this file again.
    set "FLASH_RC=1"
    goto :finish
)

if defined DRY_RUN (
    if defined ESP_PORT (
        echo Dry run: idf.py -p "%ESP_PORT%" flash
    ) else (
        echo Dry run: idf.py flash ^(automatic port detection^)
    )
    set "FLASH_RC=0"
    goto :finish
)

rem Activate ESP-IDF when this file is launched from Explorer instead of an
rem ESP-IDF command prompt.
where idf.py >nul 2>&1
if errorlevel 1 call "%IDF_PATH%\export.bat"

where idf.py >nul 2>&1
if errorlevel 1 (
    echo ERROR: The ESP-IDF environment could not be activated.
    echo Open an ESP-IDF command prompt and run "idf.py flash" there,
    echo or repair the ESP-IDF installation at "%IDF_PATH%".
    set "FLASH_RC=1"
    goto :finish
)

echo Building and flashing Stadia dongle firmware...
if defined ESP_PORT (
    call idf.py -p "%ESP_PORT%" flash
) else (
    call idf.py flash
)
if errorlevel 1 (set "FLASH_RC=1") else set "FLASH_RC=0"

:finish
if "%FLASH_RC%"=="0" (
    echo.
    if defined DRY_RUN (
        echo Dry run completed successfully. No device was flashed.
    ) else (
        echo Flash completed successfully.
    )
) else (
    echo.
    echo Flash failed with exit code %FLASH_RC%.
    echo If the port is busy, close serial monitors and try again.
    echo Some boards require holding BOOT while flashing begins.
)

if not defined NO_PAUSE pause
exit /b %FLASH_RC%
