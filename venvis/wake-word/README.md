# VENVIS Wake Word — Windows

Script Python que escucha el micrófono continuamente y activa VENVIS al detectar "hey jarvis".

## Instalación

1. Doble click en `instalar.bat`
2. Doble click en `iniciar.bat`

## Uso

- Decí **"Hey Jarvis"** → beep corto → hablá tu comando
- VENVIS responde por los parlantes (TTS local, sin pasar por el servidor)
- Decí "para", "stop" o "chau" para detener

## Requisitos

- Windows 10/11
- Python 3.9+
- Micrófono conectado
- Conexión a internet (para Google STT y para conectar al servidor)

## Ajustes en wake_word.py

| Variable | Default | Descripción |
|----------|---------|-------------|
| `SESSION_ID` | `"charly"` | Sesión de VENVIS (misma memoria que la PWA) |
| `THRESHOLD` | `0.5` | Sensibilidad del wake word (0.3 = más sensible, 0.7 = menos) |
| `TRIGGER_HITS` | `2` | Chunks consecutivos sobre el umbral para confirmar activación |
| `SILENCE_SECS` | `0.7` | Segundos de silencio para cortar la grabación |
| `MAX_RECORD_SECS` | `12` | Máximo tiempo de grabación |

## Solución de problemas

**Error `portaudio` al instalar pyaudio:**
Usá el `instalar.bat` que corre `pipwin install pyaudio` automáticamente.

**No detecta el wake word:**
Bajá el `THRESHOLD` a `0.3` o hablá más cerca del micrófono.

**Error de conexión al servidor:**
Verificá que `venvis.orvexautomation.com` esté accesible desde tu red.

**Sin audio en los parlantes:**
El audio usa Windows MCI directamente, no necesita instalación extra.
