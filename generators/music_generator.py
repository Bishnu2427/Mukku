"""Background music generation via the Suno API (sunoapi.org).

If Suno is unavailable the pipeline continues without music —
the video will still have voiceover audio.
"""

import os
import time
import logging
import requests
from pathlib import Path

logger = logging.getLogger(__name__)

ROOT      = Path(__file__).resolve().parent.parent
AUDIO_DIR = ROOT / "media" / "audio"

SUNO_API_KEY = os.getenv("SUNO_API_KEY", "").strip()
SUNO_BASE    = "https://apibox.erweima.ai"   # sunoapi.org backend


def generate_music(topic: str, tone: str, duration: int, project_id: str) -> str | None:
    """Generate an instrumental background track. Returns the MP3 path, or None on failure."""
    if not SUNO_API_KEY:
        logger.info("SUNO_API_KEY not set — skipping music generation.")
        return None

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    output_path = str(AUDIO_DIR / f"{project_id}_music.mp3")

    music_prompt = _build_prompt(topic, tone, duration)
    logger.info("Generating Suno music: %s", music_prompt)

    try:
        task_id = _submit(music_prompt)
        audio_url = _poll(task_id)
        _download_file(audio_url, output_path)
        logger.info("Suno music saved: %s", output_path)
        return output_path
    except Exception as exc:
        logger.warning("Suno music generation failed (%s) — continuing without music.", exc)
        return None


def _build_prompt(topic: str, tone: str, duration: int) -> str:
    tone_map = {
        "educational":   "calm, focused, piano and soft strings",
        "professional":  "corporate, uplifting, subtle percussion",
        "motivational":  "inspiring, upbeat, orchestral build",
        "entertaining":  "fun, upbeat, light and energetic",
        "casual":        "relaxed, acoustic, feel-good",
    }
    style = tone_map.get(tone.lower(), "ambient, calm, professional")
    return (
        f"Instrumental background music for a video about {topic}. "
        f"Style: {style}. "
        "No vocals. No lyrics. Purely instrumental. "
        f"Duration approximately {duration} seconds. "
        "Smooth, non-distracting, suitable for voice-over narration."
    )


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {SUNO_API_KEY}",
        "Content-Type":  "application/json",
    }


def _submit(prompt: str) -> str:
    """Submit a music generation job and return the task_id."""
    body = {
        "prompt":       prompt,
        "model":        "V3_5",   # required — API rejects requests without a model value
        "instrumental": True,     # required — API rejects requests without this field
        "wait_audio":   False,
        "customMode":   False,
    }
    resp = requests.post(
        f"{SUNO_BASE}/api/v1/generate",
        json=body,
        headers=_headers(),
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()

    # sunoapi.org response shapes vary — try all known locations
    nested  = data.get("data") or {}
    task_id = (
        data.get("task_id")
        or (nested.get("task_id") if isinstance(nested, dict) else None)
        or (nested[0].get("id") if isinstance(nested, list) and nested and isinstance(nested[0], dict) else None)
    )
    if not task_id:
        raise RuntimeError(f"Suno API did not return task_id: {data}")

    logger.info("Suno task queued: %s", task_id)
    return str(task_id)


def _poll(task_id: str) -> str:
    """Poll until audio is ready and return the download URL."""
    for attempt in range(40):   # max ~6 minutes
        time.sleep(10)
        resp = requests.get(
            f"{SUNO_BASE}/api/v1/get",
            params={"ids": task_id},
            headers=_headers(),
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()

        # response can be a list or wrapped in a data key
        items = data if isinstance(data, list) else data.get("data", [])
        if not isinstance(items, list):
            items = [items]
        items = [i for i in items if isinstance(i, dict)]  # drop None / non-dict entries

        for item in items:
            status    = item.get("status", "")
            audio_url = item.get("audio_url") or item.get("url") or item.get("song_url")

            if audio_url and status in ("complete", "completed", "succeed", "streaming"):
                return audio_url

            if status in ("error", "failed"):
                raise RuntimeError(f"Suno task failed: {item}")

        logger.debug("Suno poll %d — status: %s", attempt + 1,
                     items[0].get("status", "unknown") if items else "unknown")

    raise TimeoutError("Suno music generation timed out after 6 minutes.")


def _download_file(url: str, filepath: str) -> None:
    r = requests.get(url, timeout=120, stream=True)
    r.raise_for_status()
    with open(filepath, "wb") as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
