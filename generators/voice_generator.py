"""
Voice Generation Engine.

Priority order (first one that works is used):
  1. pyttsx3  – built-in OS TTS, offline, Windows/Linux/macOS (default)
  2. gTTS     – Google TTS, requires internet, last resort

Note: Coqui TTS is incompatible with Python 3.12+ and is excluded.
"""

import os
import logging
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

ROOT      = Path(__file__).resolve().parent.parent
AUDIO_DIR = ROOT / "media" / "audio"

TTS_ENGINE = os.getenv("TTS_ENGINE", "pyttsx3")  # pyttsx3 | gtts | auto


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

def generate_voice(text: str, project_id: str, scene_number: int) -> str:
    """
    Convert text to a WAV audio file.

    Returns
    -------
    str  - absolute path to the saved WAV file
    """
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{project_id}_scene{scene_number:02d}.wav"
    filepath = str(AUDIO_DIR / filename)

    text = text.strip()
    if not text:
        text = f"Scene {scene_number}."

    engine = TTS_ENGINE.lower()

    if engine in ("auto", "pyttsx3"):
        if _try_pyttsx3(text, filepath):
            return filepath

    if engine in ("auto", "gtts"):
        if _try_gtts(text, filepath):
            return filepath

    raise RuntimeError("All TTS engines failed. Check logs for details.")


# ──────────────────────────────────────────────────────────────────────────────
# Engine implementations
# ──────────────────────────────────────────────────────────────────────────────

def _try_pyttsx3(text: str, filepath: str) -> bool:
    try:
        import pyttsx3

        engine = pyttsx3.init()
        engine.setProperty("rate", 160)   # words per minute
        engine.setProperty("volume", 1.0)

        # Prefer a female voice when available
        voices = engine.getProperty("voices")
        for v in voices:
            if "female" in v.name.lower() or "zira" in v.id.lower():
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

        # Convert MP3 → WAV with ffmpeg
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", mp3_path, filepath],
            capture_output=True,
        )
        if result.returncode == 0:
            os.remove(mp3_path)
            logger.info("gTTS generated: %s", filepath)
            return True
        else:
            # Keep the MP3 and rename as WAV (player still works)
            os.rename(mp3_path, filepath)
            logger.info("gTTS generated (mp3 renamed): %s", filepath)
            return True
    except Exception as exc:
        logger.warning("gTTS failed: %s", exc)
        return False
