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

echo [4/4] Instalando Porcupine (wake word)...
pip install pvporcupine

echo.
echo Instalacion completa.
echo.
echo SIGUIENTE PASO: configura tu PORCUPINE_KEY en el archivo .env
echo Lee SETUP.md para las instrucciones.
pause
