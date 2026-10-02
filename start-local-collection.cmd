@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Python environment missing. See docs\LOCAL-COLLECTION-TEST.md.
  pause
  exit /b 1
)
set DISABLE_SQLALCHEMY_CEXT_RUNTIME=1
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
".venv\Scripts\python.exe" -X utf8 server\local_test_run.py
pause
