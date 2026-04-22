import pyaudio
import numpy as np
import openwakeword
from openwakeword.model import Model
import socketio
import speech_recognition as sr
import asyncio
import time
import tempfile
import os
import threading
import ctypes

# ── CONFIG ──────────────────────────────────────────────
SERVER_URL  = "https://venvis.orvexautomation.com"
SESSION_ID  = "agus"
WAKE_MODEL  = "hey_jarvis"
THRESHOLD   = 0.5
TRIGGER_HITS = 2   # chunks consecutivos por encima del umbral para activar
SAMPLE_RATE = 16000
CHUNK       = 1280   # 80ms @ 16kHz

VOICE       = "es-AR-TomasNeural"
TTS_RATE    = "-5%"
TTS_PITCH   = "-2Hz"

STOP_WORDS  = {"detente", "para", "stop", "salir", "adiós", "adios", "chau"}

SILENCE_THRESHOLD = 500   # energía mínima para considerar voz
SILENCE_SECS      = 0.7   # segundos de silencio para cortar
WAIT_SECS         = 3     # máximo esperando que empiece a hablar
MAX_RECORD_SECS   = 12
# ────────────────────────────────────────────────────────

sio        = socketio.Client(logger=False, engineio_logger=False)
recognizer = sr.Recognizer()

print("Descargando/verificando modelo wake word...")
openwakeword.utils.download_models([WAKE_MODEL])
print("Cargando modelo wake word...")
oww = Model(wakeword_models=[WAKE_MODEL], inference_framework="onnx")
print("Modelo listo.")


# ── AUDIO PLAYBACK ───────────────────────────────────────

def _play_mp3_winmm(path):
    """Reproduce MP3 usando Windows MCI (sin dependencias externas)."""
    mci = ctypes.windll.winmm
    alias = "venvis_mp3"
    abs_path = os.path.abspath(path).replace("/", "\\")
    mci.mciSendStringW(f'close {alias}', None, 0, None)
    err = mci.mciSendStringW(f'open "{abs_path}" type mpegvideo alias {alias}', None, 0, None)
    if err:
        raise RuntimeError(f"MCI open error: {err}")
    mci.mciSendStringW(f'play {alias} wait', None, 0, None)
    mci.mciSendStringW(f'close {alias}', None, 0, None)


def play_beep():
    try:
        import winsound
        winsound.Beep(880, 120)
    except Exception:
        pass


# ── TTS LOCAL ────────────────────────────────────────────

async def _tts_async(text):
    import edge_tts
    clean = text.replace('\n', ' ').strip()[:500]
    communicate = edge_tts.Communicate(clean, VOICE, rate=TTS_RATE, pitch=TTS_PITCH)
    with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as f:
        tmp = f.name
    await communicate.save(tmp)
    return tmp


def speak(text):
    """Genera y reproduce TTS localmente usando edge-tts."""
    tmp = None
    try:
        tmp = asyncio.run(_tts_async(text))
        _play_mp3_winmm(tmp)
    except Exception as e:
        print(f"[TTS] Error: {e}")
    finally:
        if tmp and os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except Exception:
                pass


# ── SOCKET EVENTS ────────────────────────────────────────

@sio.on("connect")
def on_connect():
    print(f"Conectado a {SERVER_URL}")

@sio.on("disconnect")
def on_disconnect():
    print("Desconectado.")

@sio.on("venvis_chunk")
def on_chunk(data):
    pass

@sio.on("venvis_done")
def on_done(data):
    text = data.get('text', '')
    print(f"\nVENVIS: {text}\n")
    threading.Thread(target=speak, args=(text,), daemon=True).start()
    print('Escuchando... (decí "hey jarvis")')

@sio.on("venvis_audio")
def on_audio(data):
    pass  # TTS se hace localmente ahora

@sio.on("venvis_error")
def on_error(data):
    print(f"[Error] {data.get('message', '')}")


# ── GRABACIÓN Y STT ──────────────────────────────────────

def record_until_silence(stream):
    """Graba desde el stream existente usando VAD por energía."""
    frames = []
    silence_chunks = 0
    max_silence    = int(SILENCE_SECS * SAMPLE_RATE / CHUNK)
    max_wait       = int(WAIT_SECS * SAMPLE_RATE / CHUNK)
    max_total      = int(MAX_RECORD_SECS * SAMPLE_RATE / CHUNK)
    speech_started = False

    for _ in range(max_wait):
        data = stream.read(CHUNK, exception_on_overflow=False)
        energy = np.abs(np.frombuffer(data, dtype=np.int16)).mean()
        if energy > SILENCE_THRESHOLD:
            speech_started = True
            frames.append(data)
            break

    if not speech_started:
        return None

    for _ in range(max_total):
        data = stream.read(CHUNK, exception_on_overflow=False)
        frames.append(data)
        energy = np.abs(np.frombuffer(data, dtype=np.int16)).mean()
        if energy < SILENCE_THRESHOLD:
            silence_chunks += 1
            if silence_chunks >= max_silence:
                break
        else:
            silence_chunks = 0

    return b''.join(frames)


def transcribe(audio_bytes):
    """Envía audio a Google STT y retorna el texto."""
    audio_data = sr.AudioData(audio_bytes, SAMPLE_RATE, 2)
    try:
        return recognizer.recognize_google(audio_data, language="es-AR")
    except sr.UnknownValueError:
        return None
    except sr.RequestError as e:
        print(f"[STT] Error de red: {e}")
        return None


# ── MAIN ─────────────────────────────────────────────────

def main():
    print(f"Conectando a {SERVER_URL}...")
    try:
        sio.connect(SERVER_URL, transports=["websocket"])
    except Exception as e:
        print(f"Error de conexión: {e}")
        return

    pa     = pyaudio.PyAudio()
    stream = pa.open(rate=SAMPLE_RATE, channels=1,
                     format=pyaudio.paInt16,
                     input=True, frames_per_buffer=CHUNK)

    print('Escuchando... (decí "hey jarvis" para activar)\n')

    hits = 0
    try:
        while True:
            chunk = np.frombuffer(
                stream.read(CHUNK, exception_on_overflow=False),
                dtype=np.int16
            )
            pred  = oww.predict(chunk)
            score = list(pred.values())[0] if pred else 0.0

            if score > 0.2:
                print(f"  score: {score:.3f}", end="\r")

            if score >= THRESHOLD:
                hits += 1
            else:
                hits = 0

            if hits < TRIGGER_HITS:
                continue

            hits = 0
            print(f"\n[Wake word! score={score:.2f}]")
            oww.reset()
            play_beep()

            print("Escuchando tu mensaje...")
            audio_bytes = record_until_silence(stream)

            if not audio_bytes:
                print("No se detectó voz.")
                print('Escuchando... (decí "hey jarvis")')
                continue

            print("Transcribiendo...")
            text = transcribe(audio_bytes)

            if not text:
                print("No se entendió.")
                print('Escuchando... (decí "hey jarvis")')
                continue

            print(f"Vos: {text}")

            if any(w in text.lower() for w in STOP_WORDS):
                print("Hasta luego.")
                break

            sio.emit("user_message", {"text": text, "sessionId": SESSION_ID, "voiceMode": True})

    except KeyboardInterrupt:
        print("\nDeteniendo...")
    finally:
        stream.stop_stream()
        stream.close()
        pa.terminate()
        sio.disconnect()


if __name__ == "__main__":
    main()
