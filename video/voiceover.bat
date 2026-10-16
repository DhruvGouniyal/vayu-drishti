@echo off
REM Regenerate the narration MP3s (edge-tts needs internet).
cd /d "%~dp0"
set PY=python
if exist "..\.venv\Scripts\python.exe" set PY=..\.venv\Scripts\python.exe
"%PY%" -m pip install --quiet --disable-pip-version-check edge-tts
"%PY%" scripts\voiceover.py %*
echo.
echo Done. You can close this window.
pause
