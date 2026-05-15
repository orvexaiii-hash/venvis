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

echo [1/3] Instalando PyAudio...
pip install pipwin --quiet
pipwin install pyaudio
if errorlevel 1 (
    pip install pyaudio
)

echo [2/3] Instalando webrtcvad...
pip install webrtcvad-wheels
if errorlevel 1 (
    pip install webrtcvad
)

echo [3/3] Instalando resto de dependencias...
pip install -r requirements.txt

echo.
echo Instalacion completa.
echo Ejecuta iniciar.bat para arrancar VENVIS.
pause
