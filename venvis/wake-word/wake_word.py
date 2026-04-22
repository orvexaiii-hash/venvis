import pyaudio
import numpy as np
import openwakeword
from openwakeword.model import Model
import socketio
import speech_recognition as sr
import base64
import time
import tempfile
import os
import threading
import subprocess
import sys

# ── CONFIG ──────────────────────────────────────────────
SERVER_URL   = "https://venvis.orvexautomation.com"
SESSION_ID   = "agus"
WAKE_MODEL   = "hey_jarvis"
THRESHOLD    = 0.3
SAMPLE_RATE  = 16000
CHUNK        = 1280   # 80ms @ 16kHz — requerido por openwakeword

STOP_WORDS   = {"detente", "para", "stop", "salir", "adiós", "adios", "chau"}
# ────────────────────────────────────────────────────────

sio        = socketio.Client(logger=False, engineio_logger=False)
recognizer = sr.Recognizer()
recognizer.energy_threshold = 300
recognizer.dynamic_energy_threshold = True

print("Descargando/verificando modelo wake word...")
openwakeword.utils.download_models([WAKE_MODEL])
print("Cargando modelo wake word...")
oww = Model(wakeword_models=[WAKE_MODEL], inference_framework="onnx")
print("Modelo listo.")


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
    print(f"\nVENVIS: {data.get('text', '')}\n")
    print('Escuchando... (decí "hey jarvis")')

@sio.on("venvis_audio")
def on_audio(data):
    threading.Thread(target=_play_audio, args=(data,), daemon=True).start()

@sio.on("venvis_error")
def on_error(data):
    print(f"[Error] {data.get('message', '')}")


# ── HELPERS ──────────────────────────────────────────────

_current_audio_proc = None
_audio_lock = threading.Lock()

def _play_audio(data):
    global _current_audio_proc
    tmp = None
    try:
        audio_bytes = base64.b64decode(data["audioBase64"])
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            f.write(audio_bytes)
            tmp = f.name
        proc = subprocess.Popen(
            ['powershell', '-c',
             f'Add-Type -AssemblyName presentationCore;'
             f'$mp=[System.Windows.Media.MediaPlayer]::new();'
             f'$mp.Open([Uri]::new("{tmp}"));'
             f'$mp.Play();Start-Sleep 30;$mp.Close()'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        with _audio_lock:
            _current_audio_proc = proc
        proc.wait()
    except Exception as e:
        print(f"[Audio] Error: {e}")
    finally:
        with _audio_lock:
            _current_audio_proc = None
        if tmp and os.path.exists(tmp):
            try: os.unlink(tmp)
            except: pass


def stop_audio():
    global _current_audio_proc
    with _audio_lock:
        if _current_audio_proc and _current_audio_proc.poll() is None:
            _current_audio_proc.terminate()
            _current_audio_proc = None


def play_beep():
    try:
        subprocess.Popen(
            ['powershell', '-c', '[console]::beep(880,120)'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        ).wait()
    except Exception:
        pass


def listen_and_transcribe(pa_stream) -> str | None:
    """Pausa el stream de wake word, escucha con VAD, retoma."""
    pa_stream.stop_stream()
    text = None
    try:
        with sr.Microphone(sample_rate=SAMPLE_RATE) as source:
            recognizer.adjust_for_ambient_noise(source, duration=0.2)
            try:
                audio = recognizer.listen(source, timeout=6, phrase_time_limit=12)
            except sr.WaitTimeoutError:
                return None
        text = recognizer.recognize_google(audio, language="es-AR")
    except sr.UnknownValueError:
        pass
    except sr.RequestError as e:
        print(f"[STT] Error: {e}")
    except Exception as e:
        print(f"[STT] Error inesperado: {e}")
    finally:
        pa_stream.start_stream()
    return text


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

    try:
        while True:
            chunk = np.frombuffer(
                stream.read(CHUNK, exception_on_overflow=False),
                dtype=np.int16
            )
            pred  = oww.predict(chunk)
            score = list(pred.values())[0] if pred else 0.0

            if score > 0.1:
                print(f"  score: {score:.3f}", end="\r")

            if score < THRESHOLD:
                continue

            print(f"\n[Wake word! score={score:.2f}]")
            oww.reset()
            stop_audio()
            play_beep()

            print("Escuchando tu mensaje...")
            text = listen_and_transcribe(stream)

            if not text:
                print("No se entendió.")
                print('Escuchando... (decí "hey jarvis")')
                continue

            print(f"Vos: {text}")

            if any(w in text.lower() for w in STOP_WORDS):
                print("Hasta luego.")
                break

            sio.emit("user_message", {"text": text, "sessionId": SESSION_ID})

    except KeyboardInterrupt:
        print("\nDeteniendo...")
    finally:
        stream.stop_stream()
        stream.close()
        pa.terminate()
        sio.disconnect()


if __name__ == "__main__":
    main()
