@echo off
cd /d "%~dp0"
echo Instalando dependencias de VENVIS Wake Word...
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python no encontrado. Instala Python 3.9+ desde python.org
    pause
    exit /b 1
)

echo [1/3] Instalando pipwin para PyAudio en Windows...
pip install pipwin --quiet

echo [2/3] Instalando PyAudio...
pipwin install pyaudio
if errorlevel 1 (
    echo Intentando instalacion alternativa de PyAudio...
    pip install pyaudio
)

echo [3/3] Instalando resto de dependencias...
pip install -r requirements.txt

echo.
echo Instalacion completa.
echo Ejecuta iniciar.bat para arrancar VENVIS Wake Word.
pause
