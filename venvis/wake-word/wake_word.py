import pyaudio
import numpy as np
import socketio
import speech_recognition as sr
import asyncio
import tempfile
import os
import threading
import ctypes
import wave

# ── CONFIG ──────────────────────────────────────────────
SERVER_URL  = "https://venvis.orvexautomation.com"
SESSION_ID  = "charly"
WAKE_WORDS  = {"jarvis", "venvis", "oye jarvis", "hey jarvis", "hey venvis"}

SAMPLE_RATE = 16000
CHUNK       = 1024

VOICE       = "es-AR-TomasNeural"
TTS_RATE    = "-5%"
TTS_PITCH   = "-2Hz"

VAD_THRESHOLD  = 400   # energía mínima para detectar voz
VAD_ONSET      = 3     # chunks seguidos con voz para empezar a grabar
SILENCE_CHUNKS = 15    # chunks de silencio para cortar la grabación
MAX_CHUNKS     = 200   # máximo de grabación (~13s)

STOP_WORDS  = {"detente venvis", "para venvis", "apagar venvis", "cerrar venvis"}
# ────────────────────────────────────────────────────────

sio        = socketio.Client(logger=False, engineio_logger=False)
recognizer = sr.Recognizer()
recognizer.energy_threshold = 300
recognizer.dynamic_energy_threshold = False
is_speaking = False  # True mientras VENVIS habla, para no captar el TTS


# ── AUDIO PLAYBACK ───────────────────────────────────────

def _play_mp3_winmm(path):
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
    global is_speaking
    is_speaking = True
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
        is_speaking = False


# ── SOCKET EVENTS ────────────────────────────────────────

@sio.on("connect")
def on_connect():
    print(f"Conectado a {SERVER_URL}")

@sio.on("disconnect")
def on_disconnect():
    print("\n[reconectando...]")

@sio.on("venvis_chunk")
def on_chunk(data):
    pass

@sio.on("venvis_done")
def on_done(data):
    text = data.get('text', '')
    print(f"\nVENVIS: {text}\n")
    threading.Thread(target=speak, args=(text,), daemon=True).start()
    print('Escuchando... (decí "hey jarvis")')

@sio.on("venvis_error")
def on_error(data):
    print(f"[Error] {data.get('message', '')}")


# ── GRABACIÓN CON VAD ─────────────────────────────────────

def record_until_silence(stream, first_frame=None):
    """Graba desde que hay voz hasta el silencio. Retorna bytes de audio."""
    frames = [first_frame] if first_frame else []
    silence = 0

    for _ in range(MAX_CHUNKS):
        data  = stream.read(CHUNK, exception_on_overflow=False)
        chunk = np.frombuffer(data, dtype=np.int16)
        energy = int(np.abs(chunk).mean())
        frames.append(data)

        if energy < VAD_THRESHOLD:
            silence += 1
            if silence >= SILENCE_CHUNKS:
                break
        else:
            silence = 0

    return b''.join(frames) if frames else None


def transcribe(audio_bytes, lang="es-AR"):
    audio_data = sr.AudioData(audio_bytes, SAMPLE_RATE, 2)
    try:
        return recognizer.recognize_google(audio_data, language=lang)
    except sr.UnknownValueError:
        return None
    except sr.RequestError as e:
        print(f"[STT] Error: {e}")
        return None


def transcribe_wake(audio_bytes):
    """Intenta en inglés primero (hey jarvis), luego español."""
    text = transcribe(audio_bytes, lang="en-US")
    if text:
        return text
    return transcribe(audio_bytes, lang="es-AR")


def contains_wake_word(text):
    t = text.lower()
    return any(w in t for w in WAKE_WORDS)


# ── SELECCIÓN DE MICRÓFONO ───────────────────────────────

def pick_microphone(pa):
    mics = []
    for i in range(pa.get_device_count()):
        d = pa.get_device_info_by_index(i)
        if d['maxInputChannels'] > 0 and d['hostApi'] == 0:
            mics.append((i, d['name']))

    print("\nMicrófonos disponibles:")
    for idx, (i, name) in enumerate(mics):
        print(f"  [{idx}] {name}")

    default_name = pa.get_default_input_device_info()['name']
    print(f"\nDefault: {default_name}")
    print("Enter = usar default, o escribí el número:")
    choice = input("> ").strip()

    if choice == "":
        return None
    try:
        return mics[int(choice)][0]
    except (ValueError, IndexError):
        return None


# ── MAIN ─────────────────────────────────────────────────

def connect_with_retry():
    """Conecta al servidor, reintentando hasta lograrlo."""
    while True:
        try:
            if not sio.connected:
                sio.connect(SERVER_URL, transports=["websocket"])
            return True
        except Exception as e:
            print(f"  [sin conexión, reintentando en 3s...] {e}")
            import time; time.sleep(3)


def main():
    print(f"Conectando a {SERVER_URL}...")
    connect_with_retry()

    pa        = pyaudio.PyAudio()
    mic_index = pick_microphone(pa)

    open_args = dict(rate=SAMPLE_RATE, channels=1,
                     format=pyaudio.paInt16,
                     input=True, frames_per_buffer=CHUNK)
    if mic_index is not None:
        open_args['input_device_index'] = mic_index
        name = pa.get_device_info_by_index(mic_index)['name']
    else:
        name = pa.get_default_input_device_info()['name']
    print(f"Micrófono: {name}\n")

    stream = pa.open(**open_args)
    print("VENVIS listo. Hablá cuando quieras.\n")

    onset = 0
    try:
        while True:
            data   = stream.read(CHUNK, exception_on_overflow=False)
            chunk  = np.frombuffer(data, dtype=np.int16)
            energy = int(np.abs(chunk).mean())

            # Silenciar captura mientras VENVIS habla
            if is_speaking:
                onset = 0
                continue

            # Reconectar si se cayó
            if not sio.connected:
                connect_with_retry()

            print(f"  vol: {energy:<6}", end="\r")

            if energy >= VAD_THRESHOLD:
                onset += 1
            else:
                onset = 0

            if onset < VAD_ONSET:
                continue

            onset = 0
            print("  [grabando...]         ", end="\r")

            audio_bytes = record_until_silence(stream, first_frame=data)
            if not audio_bytes:
                continue

            print("  transcribiendo...     ", end="\r")
            text = transcribe(audio_bytes, lang="es-AR") or transcribe(audio_bytes, lang="en-US")

            if not text:
                print("  ...                   ", end="\r")
                continue

            print(f"  oído: '{text}'          ")

            tl = text.lower()

            if any(w in tl for w in STOP_WORDS):
                print("Hasta luego.")
                break

            # Ignorar ruido de una sola sílaba
            words = [w for w in tl.split() if len(w) > 1]
            if len(words) < 1:
                continue

            print(f"Vos: {text}")
            play_beep()
            sio.emit("user_message", {"text": text, "sessionId": SESSION_ID, "voiceMode": True})

    except KeyboardInterrupt:
        print("\nDeteniendo...")
    finally:
        stream.stop_stream()
        stream.close()
        pa.terminate()
        if sio.connected:
            sio.disconnect()


if __name__ == "__main__":
    main()
