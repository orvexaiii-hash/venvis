#!/usr/bin/env python3
"""VENVIS Voice Client — RealtimeSTT + Silero VAD + edge-tts"""

# IMPORTANTE: guard de multiprocessing requerido en Windows para RealtimeSTT
import multiprocessing
if __name__ == '__main__':
    multiprocessing.freeze_support()

import os
import re
import sys
import time
import asyncio
import tempfile
import threading
import ctypes
import msvcrt
import socketio

# ── CONFIG ───────────────────────────────────────────────
SERVER_URL       = "https://venvis.orvexautomation.com"
SESSION_ID       = "charly"
FOLLOWUP_TIMEOUT = 15.0

VOICE     = "es-AR-TomasNeural"
TTS_RATE  = "-5%"
TTS_PITCH = "-2Hz"

EXIT_PHRASES = {"apagar venvis", "cerrar venvis", "venvis apágate"}
IDLE_PHRASES = {"detente venvis", "venvis chau", "venvis para", "venvis gracias"}

WAKE_WORDS = {
    "venvis", "benvis", "bembis", "vénvis", "bemvis", "venvís", "ven vis",
    "bembe", "bembes", "venbi", "bembé",
    "bambi", "bimbi", "wimbi", "wembi", "wambi", "vimbi",
    "venbus", "venis", "venus",
}
_WAKE_RE = re.compile(r'\b[bvw][aeiouáéíóú][mn][bvw][aeiouáéíóú]', re.IGNORECASE)
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


# ── WAKE WORD ─────────────────────────────────────────────

def is_wake_word(text):
    if any(w in text for w in WAKE_WORDS):
        return True
    return bool(_WAKE_RE.search(text))


# ── CALLBACKS RealtimeSTT ────────────────────────────────

def _on_recording_start():
    if is_active():
        print("  [grabando...]                               ", end="\r")

def _on_recording_stop():
    if is_active():
        print("  [transcribiendo...]                         ", end="\r")

def _on_text(text):
    text = (text or '').strip()
    if not text:
        return
    if is_speaking():
        return  # ignorar audio propio del TTS
    tl = text.lower()

    if not is_active():
        print(f"  [escuché: '{tl}']                             ", end="\r")
        if is_wake_word(tl):
            enter_active()
        return

    touch_activity()

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
    beep()
    if not sio.connected:
        connect_loop()
    sio.emit("user_message", {
        "text":      text,
        "sessionId": SESSION_ID,
        "voiceMode": True,
    })


# ── TIMEOUT LOOP ──────────────────────────────────────────

def _timeout_loop():
    while True:
        time.sleep(1)
        if is_active() and not is_speaking() and activity_elapsed() > FOLLOWUP_TIMEOUT:
            enter_idle()


# ── MICRÓFONO ────────────────────────────────────────────

def pick_mic():
    import pyaudio
    pa   = pyaudio.PyAudio()
    mics = [
        (i, pa.get_device_info_by_index(i)['name'])
        for i in range(pa.get_device_count())
        if pa.get_device_info_by_index(i)['maxInputChannels'] > 0
        and pa.get_device_info_by_index(i)['hostApi'] == 0
    ]
    pa.terminate()

    print("\nMicrófonos disponibles:")
    for idx, (dev_i, name) in enumerate(mics):
        print(f"  [{idx}] {name}")

    for i, arg in enumerate(sys.argv):
        if arg == '--mic' and i + 1 < len(sys.argv):
            try:
                choice = int(sys.argv[i + 1])
                dev_i, name = mics[choice]
                print(f"Micrófono: {name}\n")
                return dev_i
            except Exception:
                pass

    if '--default-mic' in sys.argv or not sys.stdin.isatty():
        return None

    import pyaudio as _pa2
    pa2 = _pa2.PyAudio()
    default = pa2.get_default_input_device_info()['name']
    pa2.terminate()
    print(f"\nDefault: {default}")
    print("Enter = default  |  número = elegir:")
    choice = input("> ").strip()
    if not choice:
        return None
    try:
        return mics[int(choice)][0]
    except Exception:
        return None


# ── MAIN ──────────────────────────────────────────────────

def main():
    # Singleton: solo aquí, en el proceso principal
    _LOCK_FILE = os.path.join(os.path.dirname(__file__), ".venvis.pid")
    if os.path.exists(_LOCK_FILE):
        try:
            with open(_LOCK_FILE) as f:
                old_pid = int(f.read().strip())
            import psutil
            try:
                psutil.Process(old_pid).kill()
                print(f"  [instancia anterior (PID {old_pid}) terminada]")
                time.sleep(0.5)
            except Exception:
                pass
        except Exception:
            pass
    with open(_LOCK_FILE, 'w') as f:
        f.write(str(os.getpid()))
    import atexit
    atexit.register(lambda: os.unlink(_LOCK_FILE) if os.path.exists(_LOCK_FILE) else None)

    print(f"Conectando a {SERVER_URL}...")
    connect_loop()

    mic = pick_mic()

    threading.Thread(target=_timeout_loop, daemon=True).start()

    print("═══════════════════════════════════════════════")
    print("  VENVIS listo — decí 'Venvis' para activar   ")
    print("  Enter/Espacio interrumpen mientras habla     ")
    print("═══════════════════════════════════════════════\n")
    enter_idle()

    from RealtimeSTT import AudioToTextRecorder

    recorder_kwargs = dict(
        model                         = "tiny",
        language                      = "es",
        spinner                       = False,
        silero_sensitivity            = 0.3,
        webrtc_sensitivity            = 2,
        post_speech_silence_duration  = 0.6,
        min_length_of_recording       = 0.3,
        pre_recording_buffer_duration = 0.5,
        on_recording_start            = _on_recording_start,
        on_recording_stop             = _on_recording_stop,
        enable_realtime_transcription = False,
        silero_use_onnx               = True,   # más rápido en Windows
    )
    if mic is not None:
        recorder_kwargs['input_device_index'] = mic

    try:
        with AudioToTextRecorder(**recorder_kwargs) as recorder:
            while True:
                if msvcrt.kbhit():
                    key = msvcrt.getch()
                    if key in (b' ', b'\r', b'\n') and is_speaking():
                        stop_tts()
                        print("  [interrumpido]                              ", end="\r")

                recorder.text(_on_text)

    except KeyboardInterrupt:
        print("\nDeteniendo...")
    finally:
        stop_tts()
        if sio.connected:
            sio.disconnect()


if __name__ == '__main__':
    main()
