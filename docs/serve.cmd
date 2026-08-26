@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem Serve the docs/ folder locally for testing config.html and index.html.
rem Browsers refuse to load ES modules from file:// URLs, and WebHID needs a
rem secure context -- http://localhost provides both.

where python >nul 2>&1
if errorlevel 1 (
    echo ERROR: python was not found on PATH.
    pause
    exit /b 1
)

start "" "http://localhost:8000/config.html"
echo Serving %CD% at http://localhost:8000 -- press Ctrl+C to stop.
python -m http.server 8000
