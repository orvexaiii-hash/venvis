#!/usr/bin/env python3
"""VENVIS Voice Client — faster-whisper + webrtcvad"""

import pyaudio
import numpy as np
import webrtcvad
import socketio
import asyncio
import tempfile
import os
import threading
import ctypes
import time
import sys
import signal
from collections import deque
from faster_whisper import WhisperModel

# ── INSTANCIA ÚNICA ──────────────────────────────────────
_LOCK_FILE = os.path.join(os.path.dirname(__file__), ".venvis.pid")

def _enforce_single_instance():
    if os.path.exists(_LOCK_FILE):
        try:
            with open(_LOCK_FILE) as f:
                old_pid = int(f.read().strip())
            import psutil
            try:
                p = psutil.Process(old_pid)
                p.kill()
                print(f"  [instancia anterior (PID {old_pid}) terminada]")
                time.sleep(0.5)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        except Exception:
            pass
    with open(_LOCK_FILE, 'w') as f:
        f.write(str(os.getpid()))

def _cleanup_lock():
    try:
        os.unlink(_LOCK_FILE)
    except Exception:
        pass

_enforce_single_instance()
import atexit
atexit.register(_cleanup_lock)
# ─────────────────────────────────────────────────────────

# ── CONFIG ───────────────────────────────────────────────
SERVER_URL  = "https://venvis.orvexautomation.com"
SESSION_ID  = "charly"
SAMPLE_RATE = 16000
FRAME_MS    = 30
FRAME_SAMP  = int(SAMPLE_RATE * FRAME_MS / 1000)   # 480 samples
FRAME_BYTES = FRAME_SAMP * 2                         # 960 bytes

VOICE       = "es-AR-TomasNeural"
TTS_RATE    = "-5%"
TTS_PITCH   = "-2Hz"

VAD_MODE       = 2    # 0-3 agresividad (2 = equilibrado)
ONSET_FRAMES   = 5    # ~150ms de voz para iniciar grabación
SILENCE_FRAMES = 25   # ~750ms de silencio para cortar
PRE_FRAMES     = 10   # frames guardados antes del onset
MIN_FRAMES     = 8    # mínimo para procesar
MAX_FRAMES     = 600  # ~18s máximo

STOP_PHRASES = {"detente venvis", "cerrar venvis", "apagar venvis"}
# ─────────────────────────────────────────────────────────

mci       = ctypes.windll.winmm
TTS_ALIAS = "venvis_tts"

# ── ESTADO GLOBAL ────────────────────────────────────────
_lock     = threading.Lock()
_speaking = False
_tts_file = None
_tts_gen  = 0
_tts_stop = threading.Event()


def is_speaking():
    with _lock:
        return _speaking


def set_speaking(val, path=None):
    global _speaking, _tts_file
    with _lock:
        _speaking = val
        if path is not None:
            _tts_file = path


# ── TTS ──────────────────────────────────────────────────

def stop_tts():
    global _tts_file
    _tts_stop.set()
    mci.mciSendStringW(f'stop {TTS_ALIAS}',  None, 0, None)
    mci.mciSendStringW(f'close {TTS_ALIAS}', None, 0, None)
    with _lock:
        f = _tts_file
        _tts_file = None
    if f and os.path.exists(f):
        try:
            os.unlink(f)
        except OSError:
            pass
    set_speaking(False)


def _play_mp3(path):
    """Reproduce MP3. Polling non-bloqueante — se corta si _tts_stop se setea."""
    abs_path = os.path.abspath(path).replace("/", "\\")
    mci.mciSendStringW(f'close {TTS_ALIAS}', None, 0, None)
    err = mci.mciSendStringW(
        f'open "{abs_path}" type mpegvideo alias {TTS_ALIAS}',
        None, 0, None
    )
    if err:
        return
    mci.mciSendStringW(f'play {TTS_ALIAS}', None, 0, None)
    buf = ctypes.create_unicode_buffer(128)
    while not _tts_stop.is_set():
        mci.mciSendStringW(f'status {TTS_ALIAS} mode', buf, 128, None)
        if buf.value not in ('playing', 'seeking'):
            break
        time.sleep(0.05)
    mci.mciSendStringW(f'stop {TTS_ALIAS}',  None, 0, None)
    mci.mciSendStringW(f'close {TTS_ALIAS}', None, 0, None)


async def _tts_async(text):
    import edge_tts
    clean = text.replace('\n', ' ').strip()[:600]
    comm  = edge_tts.Communicate(clean, VOICE, rate=TTS_RATE, pitch=TTS_PITCH)
    with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as f:
        tmp = f.name
    await comm.save(tmp)
    return tmp


def speak(text):
    """Genera y reproduce TTS. Generación counter evita overlap entre hilos."""
    global _tts_gen, _tts_stop
    _tts_gen += 1
    my_gen = _tts_gen
    _tts_stop.clear()

    def _run():
        tmp = None
        try:
            tmp = asyncio.run(_tts_async(text))
            set_speaking(True, path=tmp)
            _play_mp3(tmp)
        except Exception as e:
            print(f"[TTS] {e}")
        finally:
            if _tts_gen == my_gen:
                stop_tts()

    threading.Thread(target=_run, daemon=True).start()


def beep(freq=800, ms=80):
    try:
        import winsound
        winsound.Beep(freq, ms)
    except Exception:
        pass


# ── SOCKET.IO ────────────────────────────────────────────

sio = socketio.Client(
    logger=False, engineio_logger=False,
    reconnection=True, reconnection_attempts=0, reconnection_delay=2
)


@sio.on("connect")
def _on_connect():
    print("  [conectado]")


@sio.on("disconnect")
def _on_disconnect():
    print("  [reconectando...]")


@sio.on("venvis_done")
def _on_done(data):
    text = (data.get('text') or '').strip()
    if not text:
        return
    print(f"\nVENVIS: {text}\n")
    speak(text)


@sio.on("venvis_error")
def _on_error(data):
    print(f"[Error] {data.get('message', '')}")


def connect_loop():
    while True:
        try:
            if not sio.connected:
                sio.connect(SERVER_URL, transports=["websocket"])
            return
        except Exception as e:
            print(f"  [sin conexión: {e}  reintentando en 3s...]")
            time.sleep(3)


# ── STT (faster-whisper local) ───────────────────────────

def load_model():
    print("Cargando modelo Whisper (primera vez tarda ~30s)...")
    m = WhisperModel("small", device="cpu", compute_type="int8")
    print("Modelo listo.\n")
    return m


def transcribe(whisper, frames):
    audio_bytes = b''.join(frames)
    audio_np    = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    segments, _ = whisper.transcribe(audio_np, language="es", beam_size=5)
    text = " ".join(seg.text for seg in segments).strip()
    return text or None


# ── MICRÓFONO ────────────────────────────────────────────

def pick_mic(pa):
    mics = [
        (i, pa.get_device_info_by_index(i)['name'])
        for i in range(pa.get_device_count())
        if pa.get_device_info_by_index(i)['maxInputChannels'] > 0
        and pa.get_device_info_by_index(i)['hostApi'] == 0
    ]
    print("\nMicrófonos disponibles:")
    for idx, (dev_i, name) in enumerate(mics):
        print(f"  [{idx}] {name}")
    default = pa.get_default_input_device_info()['name']
    print(f"\nDefault: {default}")
    print("Enter = default  |  número = elegir:")
    choice = input("> ").strip()
    if not choice:
        return None
    try:
        return mics[int(choice)][0]
    except Exception:
        return None


# ── MAIN LOOP ────────────────────────────────────────────

def main():
    print(f"Conectando a {SERVER_URL}...")
    connect_loop()

    whisper = load_model()
    vad     = webrtcvad.Vad(VAD_MODE)
    pa      = pyaudio.PyAudio()
    mic     = pick_mic(pa)

    kw = dict(rate=SAMPLE_RATE, channels=1,
              format=pyaudio.paInt16,
              input=True, frames_per_buffer=FRAME_SAMP)
    if mic is not None:
        kw['input_device_index'] = mic
        name = pa.get_device_info_by_index(mic)['name']
    else:
        name = pa.get_default_input_device_info()['name']
    print(f"Micrófono: {name}\n")

    stream    = pa.open(**kw)
    pre_buf   = deque(maxlen=PRE_FRAMES)
    frames    = []
    recording = False
    voiced    = 0
    silence   = 0

    print("VENVIS listo — hablá cuando quieras.\n")

    try:
        while True:
            raw = stream.read(FRAME_SAMP, exception_on_overflow=False)

            # Hard suppression: ignorar todo mientras VENVIS habla
            if is_speaking():
                pre_buf.clear()
                voiced    = 0
                silence   = 0
                recording = False
                frames    = []
                continue

            # Reconectar si se cayó
            if not sio.connected:
                connect_loop()

            if len(raw) != FRAME_BYTES:
                continue

            try:
                is_speech = vad.is_speech(raw, SAMPLE_RATE)
            except Exception:
                continue

            # ── IDLE → RECORDING ──────────────────────────
            if not recording:
                pre_buf.append(raw)
                if is_speech:
                    voiced += 1
                    if voiced >= ONSET_FRAMES:
                        recording = True
                        frames    = list(pre_buf)
                        silence   = 0
                        voiced    = 0
                        print("  [grabando...]   ", end="\r")
                else:
                    voiced = max(0, voiced - 1)

            # ── RECORDING ────────────────────────────────
            else:
                frames.append(raw)
                if not is_speech:
                    silence += 1
                else:
                    silence = 0

                if silence >= SILENCE_FRAMES or len(frames) >= MAX_FRAMES:
                    recording = False
                    voiced    = 0
                    captured  = frames[:]
                    frames    = []
                    pre_buf.clear()

                    if len(captured) < MIN_FRAMES:
                        continue

                    def _process(fs):
                        print("  transcribiendo...", end="\r")
                        text = transcribe(whisper, fs)
                        if not text:
                            print("  ...              ", end="\r")
                            return

                        print(f"  oído: '{text}'")

                        if any(p in text.lower() for p in STOP_PHRASES):
                            print("Hasta luego.")
                            os._exit(0)

                        words = [w for w in text.split() if len(w) > 1]
                        if not words:
                            return

                        print(f"Vos: {text}")
                        beep()
                        sio.emit("user_message", {
                            "text":      text,
                            "sessionId": SESSION_ID,
                            "voiceMode": True
                        })

                    threading.Thread(target=_process, args=(captured,),
                                     daemon=True).start()

    except KeyboardInterrupt:
        print("\nDeteniendo...")
    finally:
        stop_tts()
        stream.stop_stream()
        stream.close()
        pa.terminate()
        if sio.connected:
            sio.disconnect()


if __name__ == "__main__":
    main()
