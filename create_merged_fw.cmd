@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "NO_PAUSE="
set "FLASH_SIZE=4MB"

:parse_args
if "%~1"=="" goto :args_done
if /I "%~1"=="--no-pause" (
    set "NO_PAUSE=1"
) else if /I "%~1"=="4MB" (
    set "FLASH_SIZE=4MB"
) else if /I "%~1"=="16MB" (
    set "FLASH_SIZE=16MB"
) else (
    echo ERROR: Unknown argument "%~1".
    echo Usage: create_merged_fw.cmd [4MB^|16MB] [--no-pause]
    set "MERGE_RC=1"
    goto :finish
)
shift
goto :parse_args

:args_done
set "BOOTLOADER=build\bootloader\bootloader.bin"
set "PARTITION_TABLE=build\partition_table\partition-table.bin"
set "OTA_DATA=build\ota_data_initial.bin"
set "APPLICATION=build\stadia-dongle.bin"
set "OUTPUT=docs\firmware-merged.bin"

set "NEED_BUILD="
for %%F in ("%BOOTLOADER%" "%PARTITION_TABLE%" "%OTA_DATA%" "%APPLICATION%") do (
    if not exist "%%~F" set "NEED_BUILD=1"
)

if defined NEED_BUILD (
    echo Build artifacts are missing. Building firmware first...
    call build_firmware.cmd --no-pause
    if errorlevel 1 (
        set "MERGE_RC=1"
        goto :finish
    )
)

for %%F in ("%BOOTLOADER%" "%PARTITION_TABLE%" "%OTA_DATA%" "%APPLICATION%") do (
    if not exist "%%~F" (
        echo ERROR: Required build artifact "%%~F" was not found.
        set "MERGE_RC=1"
        goto :finish
    )
)

set "USE_ESPPY="
where esptool.py >nul 2>&1
if not errorlevel 1 set "USE_ESPPY=1"

set "PYTHON_EXE="
if not defined USE_ESPPY if defined IDF_PYTHON_ENV_PATH if exist "%IDF_PYTHON_ENV_PATH%\Scripts\python.exe" set "PYTHON_EXE=%IDF_PYTHON_ENV_PATH%\Scripts\python.exe"

if defined PYTHON_EXE (
    "%PYTHON_EXE%" -m esptool version >nul 2>&1
    if errorlevel 1 set "PYTHON_EXE="
)

if not defined USE_ESPPY if not defined PYTHON_EXE (
    echo ERROR: esptool was not found.
    echo Run this script from an ESP-IDF command prompt, or run
    echo build_firmware.cmd once so the ESP-IDF environment is activated.
    set "MERGE_RC=1"
    goto :finish
)

rem Offsets must match partitions.csv: ota_0 lives at 0x20000.
echo Creating %FLASH_SIZE% merged firmware image...
if defined USE_ESPPY (
    call esptool.py --chip esp32s3 merge-bin -o "%OUTPUT%" --flash-mode dio --flash-freq 80m --flash-size %FLASH_SIZE% 0x0 "%BOOTLOADER%" 0x8000 "%PARTITION_TABLE%" 0xf000 "%OTA_DATA%" 0x20000 "%APPLICATION%"
) else (
    "%PYTHON_EXE%" -m esptool --chip esp32s3 merge-bin -o "%OUTPUT%" --flash-mode dio --flash-freq 80m --flash-size %FLASH_SIZE% 0x0 "%BOOTLOADER%" 0x8000 "%PARTITION_TABLE%" 0xf000 "%OTA_DATA%" 0x20000 "%APPLICATION%"
)
set "MERGE_RC=%ERRORLEVEL%"

:finish
if "%MERGE_RC%"=="0" (
    echo.
    echo Merged firmware created successfully:
    echo "%CD%\%OUTPUT%"
    for %%F in ("%OUTPUT%") do echo Size: %%~zF bytes
) else (
    echo.
    echo Merged firmware creation failed with exit code %MERGE_RC%.
)

if not defined NO_PAUSE pause
exit /b %MERGE_RC%
