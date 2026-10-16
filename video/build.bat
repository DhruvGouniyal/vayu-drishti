@echo off
REM One click: export data, regenerate voiceover, render out\vayu_drishti.mp4
cd /d "%~dp0"
set PY=python
if exist "..\.venv\Scripts\python.exe" set PY=..\.venv\Scripts\python.exe
"%PY%" -m pip install --quiet --disable-pip-version-check edge-tts
"%PY%" scripts\build.py %*
echo.
pause
