"""Text-to-speech generation. Tries pyttsx3 first, falls back to gTTS.

Note: Coqui TTS is excluded — incompatible with Python 3.12+.
"""

import os
import logging
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

ROOT      = Path(__file__).resolve().parent.parent
AUDIO_DIR = ROOT / "media" / "audio"

TTS_ENGINE = os.getenv("TTS_ENGINE", "pyttsx3")  # pyttsx3 | gtts | auto


def generate_voice(text: str, project_id: str, scene_number: int,
                   voice_gender: str = "auto") -> str:
    """Convert text to a WAV file and return its path."""
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{project_id}_scene{scene_number:02d}.wav"
    filepath = str(AUDIO_DIR / filename)

    text = text.strip()
    if not text:
        text = f"Scene {scene_number}."

    engine = TTS_ENGINE.lower()

    if engine in ("auto", "pyttsx3"):
        if _try_pyttsx3(text, filepath, voice_gender):
            return filepath

    if engine in ("auto", "gtts"):
        if _try_gtts(text, filepath):
            return filepath

    raise RuntimeError("All TTS engines failed. Check logs for details.")


def _try_pyttsx3(text: str, filepath: str, voice_gender: str = "auto") -> bool:
    try:
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


def _try_gtts(text: str, filepath: str) -> bool:
    try:
        from gtts import gTTS
        import tempfile

        mp3_path = filepath.replace(".wav", ".mp3")
        tts = gTTS(text=text, lang="en", slow=False)
        tts.save(mp3_path)

        # convert MP3 to WAV with ffmpeg
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", mp3_path, filepath],
            capture_output=True,
        )
        if result.returncode == 0:
            os.remove(mp3_path)
            logger.info("gTTS generated: %s", filepath)
            return True
        else:
            # ffmpeg not available — rename the mp3, most players handle it fine
            os.rename(mp3_path, filepath)
            logger.info("gTTS generated (mp3 renamed): %s", filepath)
            return True
    except Exception as exc:
        logger.warning("gTTS failed: %s", exc)
        return False
