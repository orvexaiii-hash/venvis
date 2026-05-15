@echo off
cd /d "%~dp0"
echo Configurando VENVIS para arrancar con Windows...
echo.

REM Ruta completa al script
set SCRIPT_DIR=%~dp0
set SCRIPT=%SCRIPT_DIR%wake_word.py

REM Buscar python
where python >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python no encontrado en PATH.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('where python') do set PYTHON_PATH=%%i

echo Python: %PYTHON_PATH%
echo Script: %SCRIPT%
echo.

REM Crear tarea en el Programador de tareas de Windows
schtasks /create /tn "VENVIS Wake Word" /tr "\"%PYTHON_PATH%\" \"%SCRIPT%\"" /sc onlogon /rl highest /f

if errorlevel 1 (
    echo ERROR al crear la tarea. Intentando con privilegios de administrador...
    pause
    exit /b 1
)

echo.
echo [OK] VENVIS arrancara automaticamente al iniciar Windows.
echo.
echo Para desactivar el arranque automatico:
echo   schtasks /delete /tn "VENVIS Wake Word" /f
echo.
pause
