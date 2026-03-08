"""Text-to-speech generation. Tries pyttsx3 first (English only), falls back to gTTS.

Note: Coqui TTS is excluded — incompatible with Python 3.12+.
"""

import os
import logging
import subprocess
import threading
from pathlib import Path

# pyttsx3 uses Windows COM — serialise all calls to prevent inter-thread deadlocks
# that could hang the pipeline thread and make Flask appear unresponsive.
_pyttsx3_lock = threading.Lock()

logger = logging.getLogger(__name__)

ROOT      = Path(__file__).resolve().parent.parent
AUDIO_DIR = ROOT / "media" / "audio"

TTS_ENGINE = os.getenv("TTS_ENGINE", "pyttsx3")  # pyttsx3 | gtts | auto

# gTTS language codes for supported Indian languages
_GTTS_LANG = {
    "en": "en", "hi": "hi", "bn": "bn", "te": "te", "mr": "mr",
    "ta": "ta", "gu": "gu", "kn": "kn", "ml": "ml", "pa": "pa",
    "or": "or", "as": "as",
}


def _ffmpeg_bin() -> str:
    """Return path to bundled FFmpeg binary."""
    try:
        from imageio_ffmpeg import get_ffmpeg_exe
        return get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def generate_voice(text: str, project_id: str, scene_number: int,
                   voice_gender: str = "auto", language: str = "en") -> str:
    """Convert text to a WAV file and return its path."""
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{project_id}_scene{scene_number:02d}.wav"
    filepath = str(AUDIO_DIR / filename)

    text = text.strip()
    if not text:
        text = f"Scene {scene_number}."

    engine = TTS_ENGINE.lower()

    # pyttsx3 only supports languages installed in the Windows TTS engine.
    # For any non-English language, skip it and use gTTS directly.
    if language == "en" and engine in ("auto", "pyttsx3"):
        if _try_pyttsx3(text, filepath, voice_gender):
            return filepath

    if engine in ("auto", "gtts") or language != "en":
        gtts_lang = _GTTS_LANG.get(language, "en")
        if _try_gtts(text, filepath, gtts_lang):
            return filepath

    raise RuntimeError("All TTS engines failed. Check logs for details.")


def _try_pyttsx3(text: str, filepath: str, voice_gender: str = "auto") -> bool:
    with _pyttsx3_lock:  # serialise COM calls — prevents inter-thread deadlocks
        try:
            # Initialise COM apartment for this thread (Windows only)
            try:
                import pythoncom
                pythoncom.CoInitialize()
            except ImportError:
                pass

            import pyttsx3
            engine = pyttsx3.init()
            engine.setProperty("rate", 160)
            engine.setProperty("volume", 1.0)

            voices = engine.getProperty("voices")
            want_female = voice_gender in ("female", "auto")
            for v in voices:
                name = v.name.lower()
                vid  = v.id.lower()
                if want_female and ("female" in name or "zira" in vid or "hazel" in vid):
                    engine.setProperty("voice", v.id)
                    break
                if voice_gender == "male" and ("male" in name or "david" in vid or "mark" in vid):
                    engine.setProperty("voice", v.id)
                    break

            engine.save_to_file(text, filepath)
            engine.runAndWait()
            engine.stop()
            logger.info("pyttsx3 generated: %s", filepath)
            return True
        except Exception as exc:
            logger.warning("pyttsx3 failed: %s", exc)
            return False
        finally:
            try:
                import pythoncom
                pythoncom.CoUninitialize()
            except ImportError:
                pass


def _try_gtts(text: str, filepath: str, lang: str = "en") -> bool:
    try:
        from gtts import gTTS

        mp3_path = filepath.replace(".wav", ".mp3")
        tts = gTTS(text=text, lang=lang, slow=False)
        tts.save(mp3_path)

        # Convert MP3 → WAV using bundled FFmpeg
        ff = _ffmpeg_bin()
        result = subprocess.run(
            [ff, "-y", "-i", mp3_path, filepath],
            capture_output=True,
        )
        if result.returncode == 0:
            os.remove(mp3_path)
            logger.info("gTTS [%s] generated: %s", lang, filepath)
            return True
        else:
            # ffmpeg unavailable — keep mp3 (most audio decoders handle it fine)
            os.rename(mp3_path, filepath)
            logger.info("gTTS [%s] generated (mp3 kept): %s", lang, filepath)
            return True
    except Exception as exc:
        logger.warning("gTTS [%s] failed: %s", lang, exc)
        return False
