"""
Music Generation Engine — Suno API (sunoapi.org).

Generates a custom instrumental background track that matches
the video's topic and mood. The track is downloaded as an MP3
and saved to media/audio/.

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


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

def generate_music(topic: str, tone: str, duration: int, project_id: str) -> str | None:
    """
    Generate an instrumental background track for the video.

    Parameters
    ----------
    topic      : video topic (used to craft the music prompt)
    tone       : video tone — e.g. educational, motivational, calm
    duration   : target video duration in seconds
    project_id : used for the output filename

    Returns
    -------
    str  - path to saved MP3 file, or None if generation failed
    """
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


# ──────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ──────────────────────────────────────────────────────────────────────────────

def _build_prompt(topic: str, tone: str, duration: int) -> str:
    """Craft a music prompt from the video metadata."""
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
        f"Style: {style}. No lyrics. "
        f"Duration approximately {duration} seconds. "
        "Smooth, non-distracting, suitable for voice-over narration."
    )


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {SUNO_API_KEY}",
        "Content-Type":  "application/json",
    }


def _submit(prompt: str) -> str:
    """Submit music generation job. Returns task_id."""
    body = {
        "prompt":           prompt,
        "make_instrumental": True,
        "wait_audio":        False,
    }
    resp = requests.post(
        f"{SUNO_BASE}/api/v1/generate",
        json=body,
        headers=_headers(),
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()

    # sunoapi.org returns task_id or data.task_id
    task_id = (
        data.get("task_id")
        or data.get("data", {}).get("task_id")
        or (data.get("data", [{}])[0].get("id") if isinstance(data.get("data"), list) else None)
    )
    if not task_id:
        raise RuntimeError(f"Suno API did not return task_id: {data}")

    logger.info("Suno task queued: %s", task_id)
    return str(task_id)


def _poll(task_id: str) -> str:
    """Poll until the audio is ready. Returns the audio URL."""
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

        # Response can be a list or wrapped in data key
        items = data if isinstance(data, list) else data.get("data", [])
        if not isinstance(items, list):
            items = [items]

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
