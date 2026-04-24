@echo off
cd /d "%~dp0"
echo Iniciando VENVIS Wake Word...
echo Di "Hey Jarvis" para activar.
echo Presiona Ctrl+C para detener.
echo.
python wake_word.py
pause
