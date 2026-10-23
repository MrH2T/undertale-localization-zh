@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "STUDY_PY=C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if not exist "%STUDY_PY%" set "STUDY_PY=python"
echo Open http://127.0.0.1:8767 in your browser. Close this window to stop the viewer.
"%STUDY_PY%" -X utf8 viewer\launch.py
if errorlevel 1 pause
