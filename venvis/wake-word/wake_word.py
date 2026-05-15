#!/usr/bin/env python3
"""VENVIS Voice Client — Whisper wake word + faster-whisper + webrtcvad"""

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
import msvcrt
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
FRAME_SAMP  = int(SAMPLE_RATE * FRAME_MS / 1000)  # 480 samples
FRAME_BYTES = FRAME_SAMP * 2

VOICE     = "es-AR-TomasNeural"
TTS_RATE  = "-5%"
TTS_PITCH = "-2Hz"

VAD_MODE       = 3
ONSET_FRAMES   = 6    # ~180ms para iniciar grabación
SILENCE_FRAMES = 25   # ~750ms de silencio para cortar
PRE_FRAMES     = 10
MIN_FRAMES     = 12
MAX_FRAMES     = 600  # ~18s

# Wake word
WAKE_WORD      = "venvis"
WAKE_MAX_SAMP  = SAMPLE_RATE * 3   # máx 3s para verificar wake word

# Segundos de inactividad antes de volver a IDLE
FOLLOWUP_TIMEOUT = 15.0

EXIT_PHRASES = {"apagar venvis", "cerrar venvis", "venvis apágate"}
IDLE_PHRASES = {"detente venvis", "venvis chau", "venvis para", "venvis gracias"}
# ─────────────────────────────────────────────────────────

mci       = ctypes.windll.winmm
TTS_ALIAS = "venvis_tts"

# ── ESTADO ───────────────────────────────────────────────
_lock     = threading.Lock()
_speaking = False
_tts_file = None
_tts_gen  = 0
_tts_stop = threading.Event()

_mode_lock          = threading.Lock()
_active             = False
_last_activity_time = 0.0


def is_speaking():
    with _lock:
        return _speaking

def set_speaking(val, path=None):
    global _speaking, _tts_file
    with _lock:
        _speaking = val
        if path is not None:
            _tts_file = path

def is_active():
    with _mode_lock:
        return _active

def enter_active():
    global _active, _last_activity_time
    with _mode_lock:
        _active = True
        _last_activity_time = time.time()
    beep(700, 60)
    beep(900, 80)
    print("\n  [VENVIS activo — hablá]                        ")

def enter_idle():
    global _active
    with _mode_lock:
        _active = False
    print("  [esperando 'Venvis'...]                        ", end="\r")

def touch_activity():
    global _last_activity_time
    with _mode_lock:
        _last_activity_time = time.time()

def activity_elapsed():
    with _mode_lock:
        return time.time() - _last_activity_time


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
    global _tts_gen, _tts_stop
    _tts_gen += 1
    my_gen = _tts_gen
    _tts_stop.clear()

    def _run():
        try:
            tmp = asyncio.run(_tts_async(text))
            set_speaking(True, path=tmp)
            _play_mp3(tmp)
        except Exception as e:
            print(f"[TTS] {e}")
        finally:
            if _tts_gen == my_gen:
                stop_tts()
            touch_activity()

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
    print("  [conectado]                                    ")

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


# ── STT ──────────────────────────────────────────────────

def load_models():
    print("Cargando modelos Whisper...")
    tiny  = WhisperModel("tiny",  device="cpu", compute_type="int8")
    small = WhisperModel("small", device="cpu", compute_type="int8")
    print("Modelos listos.\n")
    return tiny, small

_HALLUCINATIONS = {
    'subtítulos por la comunidad de amara',
    'subtitulos por la comunidad de amara',
    'amara.org', 'suscríbete', 'subcríbete',
    'comparte el video', 'gracias por ver',
    'no olvides suscribirte', 'like y suscríbete',
}

def _transcribe_raw(model, frames, beam_size=3):
    audio_bytes = b''.join(frames)
    audio_np    = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    segments, _ = model.transcribe(
        audio_np, language="es", beam_size=beam_size,
        no_speech_threshold=0.6,
        condition_on_previous_text=False,
        log_prob_threshold=-1.0,
    )
    parts = []
    for seg in segments:
        if seg.no_speech_prob > 0.6:
            continue
        t = seg.text.strip()
        if any(h in t.lower() for h in _HALLUCINATIONS):
            continue
        parts.append(t)
    return " ".join(parts).strip() or None

def has_wake_word(model, frames):
    """True si 'venvis' está en la transcripción del clip."""
    text = _transcribe_raw(model, frames, beam_size=1)
    return text is not None and WAKE_WORD in text.lower()

def transcribe(model, frames):
    return _transcribe_raw(model, frames, beam_size=5)


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

    whisper_tiny, whisper = load_models()
    vad = webrtcvad.Vad(VAD_MODE)
    pa  = pyaudio.PyAudio()
    mic = pick_mic(pa)

    kw = dict(rate=SAMPLE_RATE, channels=1,
              format=pyaudio.paInt16,
              input=True, frames_per_buffer=FRAME_SAMP)
    if mic is not None:
        kw['input_device_index'] = mic
        name = pa.get_device_info_by_index(mic)['name']
    else:
        name = pa.get_default_input_device_info()['name']
    print(f"Micrófono: {name}\n")

    stream = pa.open(**kw)

    # Estado del loop
    pre_buf   = deque(maxlen=PRE_FRAMES)
    frames    = []
    recording = False
    voiced    = 0
    silence   = 0

    # Estado del wake word (modo IDLE)
    wake_frames  = []   # acumula audio del clip de verificación
    wake_voiced  = 0
    wake_silence = 0
    wake_active  = False  # True = estamos grabando un posible wake word

    print("═══════════════════════════════════════════════")
    print("  VENVIS listo — decí 'Venvis' para activar   ")
    print("  Enter/Espacio interrumpen mientras habla     ")
    print("═══════════════════════════════════════════════\n")
    enter_idle()

    try:
        while True:
            raw = stream.read(FRAME_SAMP, exception_on_overflow=False)

            # Teclado: interrumpe TTS en cualquier modo
            if msvcrt.kbhit():
                key = msvcrt.getch()
                if key in (b' ', b'\r', b'\n') and is_speaking():
                    stop_tts()
                    print("  [interrumpido]                              ", end="\r")

            if len(raw) != FRAME_BYTES:
                continue

            try:
                is_speech = vad.is_speech(raw, SAMPLE_RATE)
            except Exception:
                continue

            # ═══════════════════════════════════════════════
            # MODO IDLE — espera wake word
            # ═══════════════════════════════════════════════
            if not is_active():
                if is_speaking():
                    continue

                if not wake_active:
                    # Esperando onset de voz
                    if is_speech:
                        wake_voiced += 1
                        if wake_voiced >= ONSET_FRAMES:
                            wake_active  = True
                            wake_frames  = []
                            wake_silence = 0
                            wake_voiced  = 0
                    else:
                        wake_voiced = max(0, wake_voiced - 1)
                else:
                    # Grabando clip de wake word
                    wake_frames.append(raw)
                    wake_silence = 0 if is_speech else wake_silence + 1

                    total_samples = len(wake_frames) * FRAME_SAMP
                    clip_done = (wake_silence >= 10 or total_samples >= WAKE_MAX_SAMP)

                    if clip_done:
                        clip = wake_frames[:]
                        wake_frames  = []
                        wake_active  = False
                        wake_voiced  = 0
                        wake_silence = 0

                        def _check_wake(c):
                            print("  [verificando...]                          ", end="\r")
                            if has_wake_word(whisper_tiny, c):
                                enter_active()
                            else:
                                print("  [esperando 'Venvis'...]                   ", end="\r")

                        threading.Thread(target=_check_wake, args=(clip,), daemon=True).start()
                continue

            # ═══════════════════════════════════════════════
            # MODO ACTIVE — escucha comandos
            # ═══════════════════════════════════════════════

            # Timeout de inactividad → volver a IDLE
            if not recording and not is_speaking() and activity_elapsed() > FOLLOWUP_TIMEOUT:
                enter_idle()
                wake_frames  = []
                wake_active  = False
                wake_voiced  = 0
                wake_silence = 0
                continue

            # Suprimir mientras VENVIS habla
            if is_speaking():
                pre_buf.clear()
                voiced    = 0
                silence   = 0
                recording = False
                frames    = []
                continue

            if not sio.connected:
                connect_loop()

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
                        touch_activity()
                        print("  [grabando...]                               ", end="\r")
                else:
                    voiced = max(0, voiced - 1)

            # ── RECORDING ────────────────────────────────
            else:
                frames.append(raw)
                silence = 0 if is_speech else silence + 1

                if silence >= SILENCE_FRAMES or len(frames) >= MAX_FRAMES:
                    recording = False
                    voiced    = 0
                    captured  = frames[:]
                    frames    = []
                    pre_buf.clear()

                    if len(captured) < MIN_FRAMES:
                        continue

                    def _process(fs):
                        print("  transcribiendo...                          ", end="\r")
                        text = transcribe(whisper, fs)
                        if not text:
                            print("  ...                                        ", end="\r")
                            return

                        print(f"  oído: '{text}'")
                        tl = text.lower()

                        if any(p in tl for p in EXIT_PHRASES):
                            print("Hasta luego.")
                            os._exit(0)

                        if any(p in tl for p in IDLE_PHRASES):
                            enter_idle()
                            return

                        words = [w for w in text.split() if len(w) > 1]
                        if not words:
                            return

                        print(f"Vos: {text}")
                        touch_activity()
                        beep()
                        sio.emit("user_message", {
                            "text":      text,
                            "sessionId": SESSION_ID,
                            "voiceMode": True
                        })

                    threading.Thread(target=_process, args=(captured,), daemon=True).start()

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
