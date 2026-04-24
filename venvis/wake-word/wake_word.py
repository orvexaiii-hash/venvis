#!/usr/bin/env python3
"""VENVIS Voice Client — siempre activo, barge-in, conversación fluida."""

import pyaudio
import numpy as np
import socketio
import speech_recognition as sr
import asyncio
import tempfile
import os
import threading
import ctypes
import time
from collections import deque

# ── CONFIG ──────────────────────────────────────────────
SERVER_URL  = "https://venvis.orvexautomation.com"
SESSION_ID  = "charly"
SAMPLE_RATE = 16000
CHUNK       = 512          # 32ms por chunk — respuesta rápida

VOICE       = "es-AR-TomasNeural"
TTS_RATE    = "-5%"
TTS_PITCH   = "-2Hz"

# VAD
ENERGY_TH      = 280       # umbral de energía (bajar si no detecta)
ONSET_CHUNKS   = 4         # ~128ms sostenidos para empezar a grabar
SILENCE_CHUNKS = 14        # ~450ms de silencio para cortar
BARGE_CHUNKS   = 5         # ~160ms de voz para interrumpir TTS
PRE_BUFFER     = 12        # chunks guardados antes del onset (no perder inicio)
MIN_FRAMES     = 6         # mínimo de frames para enviar (~192ms)

STOP_PHRASES   = {"detente venvis", "cerrar venvis", "apagar venvis"}
# ────────────────────────────────────────────────────────

mci       = ctypes.windll.winmm
TTS_ALIAS = "venvis_tts"

# ── ESTADO GLOBAL ────────────────────────────────────────
_lock     = threading.Lock()
_speaking = False      # True mientras TTS reproduce
_tts_file = None       # path del mp3 en reproducción


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
    """Bloquea hasta que termina o stop_tts() lo interrumpe."""
    abs_path = os.path.abspath(path).replace("/", "\\")
    mci.mciSendStringW(f'close {TTS_ALIAS}', None, 0, None)
    err = mci.mciSendStringW(
        f'open "{abs_path}" type mpegvideo alias {TTS_ALIAS}',
        None, 0, None
    )
    if err:
        return
    mci.mciSendStringW(f'play {TTS_ALIAS} wait', None, 0, None)
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
    """Genera y reproduce TTS en hilo separado. Interrumpible."""
    def _run():
        tmp = None
        try:
            tmp = asyncio.run(_tts_async(text))
            set_speaking(True, path=tmp)
            _play_mp3(tmp)
        except Exception as e:
            print(f"[TTS] {e}")
        finally:
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
    print("  [conectado]            ")


@sio.on("disconnect")
def _on_disconnect():
    print("  [reconectando...]      ")


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


# ── STT ──────────────────────────────────────────────────

recognizer = sr.Recognizer()
recognizer.energy_threshold    = 300
recognizer.dynamic_energy_threshold = False


def transcribe(audio_bytes):
    data = sr.AudioData(audio_bytes, SAMPLE_RATE, 2)
    for lang in ("es-AR", "en-US"):
        try:
            return recognizer.recognize_google(data, language=lang)
        except sr.UnknownValueError:
            continue
        except sr.RequestError as e:
            print(f"[STT] {e}")
            return None
    return None


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

    pa  = pyaudio.PyAudio()
    mic = pick_mic(pa)

    kw = dict(rate=SAMPLE_RATE, channels=1,
              format=pyaudio.paInt16,
              input=True, frames_per_buffer=CHUNK)
    if mic is not None:
        kw['input_device_index'] = mic
        name = pa.get_device_info_by_index(mic)['name']
    else:
        name = pa.get_default_input_device_info()['name']
    print(f"Micrófono: {name}\n")

    stream   = pa.open(**kw)
    pre_buf  = deque(maxlen=PRE_BUFFER)
    frames   = []
    recording = False
    onset     = 0
    silence   = 0
    barge_cnt = 0

    print("VENVIS listo — hablá cuando quieras.\n")

    try:
        while True:
            raw    = stream.read(CHUNK, exception_on_overflow=False)
            chunk  = np.frombuffer(raw, dtype=np.int16)
            energy = int(np.abs(chunk).mean())

            # ── BARGE-IN: interrumpir TTS si el user habla ──
            if is_speaking():
                if energy >= ENERGY_TH:
                    barge_cnt += 1
                    if barge_cnt >= BARGE_CHUNKS:
                        stop_tts()
                        barge_cnt = 0
                        recording = False
                        onset     = 0
                        frames    = []
                        pre_buf.clear()
                        print("  [interrumpido]         ")
                else:
                    barge_cnt = max(0, barge_cnt - 2)
                continue

            barge_cnt = 0

            # Reconectar si se cayó
            if not sio.connected:
                connect_loop()

            print(f"  vol: {energy:<5}", end="\r")
            pre_buf.append(raw)

            # ── IDLE → RECORDING ──────────────────────────
            if not recording:
                if energy >= ENERGY_TH:
                    onset += 1
                    if onset >= ONSET_CHUNKS:
                        recording = True
                        frames    = list(pre_buf)  # incluir pre-buffer
                        silence   = 0
                        onset     = 0
                        print("  [grabando...]          ", end="\r")
                else:
                    onset = max(0, onset - 1)

            # ── RECORDING ────────────────────────────────
            else:
                frames.append(raw)

                if energy < ENERGY_TH:
                    silence += 1
                else:
                    silence = 0

                too_long = len(frames) > int(MAX_RECORD_S * SAMPLE_RATE / CHUNK)
                end_of_speech = silence >= SILENCE_CHUNKS

                if end_of_speech or too_long:
                    recording = False
                    onset     = 0
                    captured  = frames[:]
                    frames    = []
                    pre_buf.clear()

                    if len(captured) < MIN_FRAMES:
                        continue  # muy corto, ignorar

                    audio_bytes = b''.join(captured)

                    def _process(ab):
                        print("  transcribiendo...      ", end="\r")
                        text = transcribe(ab)
                        if not text:
                            print("  ...                    ", end="\r")
                            return

                        print(f"  oído: '{text}'           ")

                        if any(p in text.lower() for p in STOP_PHRASES):
                            print("Hasta luego.")
                            os._exit(0)

                        words = [w for w in text.split() if len(w) > 1]
                        if not words:
                            return

                        print(f"Vos: {text}")
                        beep()
                        sio.emit("user_message", {
                            "text": text,
                            "sessionId": SESSION_ID,
                            "voiceMode": True
                        })

                    threading.Thread(target=_process, args=(audio_bytes,),
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


# MAX_RECORD_S definido aquí para evitar referencia antes de asignación
MAX_RECORD_S = 15

if __name__ == "__main__":
    main()
