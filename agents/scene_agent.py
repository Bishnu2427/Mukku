"""Breaks a narration script into structured scenes using Ollama."""

import os
import json
import math
import logging
import requests

logger = logging.getLogger(__name__)

OLLAMA_URL   = os.getenv("OLLAMA_URL",   "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")


def generate_scenes(script: str, analysis: dict) -> list[dict]:
    """Split a script into scenes, each with narration, a visual prompt, and duration."""
    total_duration = analysis.get("duration", 60)
    num_scenes     = _estimate_scene_count(total_duration)

    system_msg = (
        "You are a professional video director. "
        "Break the provided script into scenes for a video.\n"
        "For each scene output a JSON object with these exact keys:\n"
        "  scene_number  (integer, starting at 1)\n"
        "  narration     (the spoken words for this scene, verbatim from the script)\n"
        "  visual_prompt (a detailed Stable Diffusion image prompt: realistic photography, "
        "professional quality, soft lighting, 4k, high detail)\n"
        "  duration      (integer seconds for this scene)\n\n"
        "Respond ONLY with a valid JSON array. No extra text."
    )

    user_msg = (
        f"Break this script into exactly {num_scenes} scenes.\n"
        f"Total video duration: {total_duration} seconds.\n\n"
        f"SCRIPT:\n{script}\n\n"
        "Return a JSON array now:"
    )

    try:
        raw    = _call_ollama(system_msg, user_msg)
        logger.debug("Scene agent raw response: %s", raw[:500])
        scenes = _extract_json_array(raw)
        scenes = _validate_and_fix(scenes, num_scenes, total_duration)
        return scenes
    except Exception as exc:
        logger.warning("Scene agent failed (%s). Using sentence split fallback.", exc)
        return _fallback_scenes(script, num_scenes, total_duration)


def _estimate_scene_count(duration: int) -> int:
    """Roughly 1 scene per 10 seconds, clamped to [3, 10]."""
    return max(3, min(10, math.ceil(duration / 10)))


def _call_ollama(system_msg: str, user_msg: str) -> str:
    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system_msg},
            {"role": "user",   "content": user_msg},
        ],
        "stream": False,
    }
    resp = requests.post(
        f"{OLLAMA_URL}/api/chat",
        json=payload,
        timeout=180,
    )
    resp.raise_for_status()
    return resp.json()["message"]["content"]


def _extract_json_array(text: str) -> list:
    start = text.find("[")
    end   = text.rfind("]") + 1
    if start < 0 or end <= start:
        raise ValueError("No JSON array found in LLM response.")
    return json.loads(text[start:end])


def _validate_and_fix(scenes: list, num_scenes: int, total_duration: int) -> list:
    per_scene = max(5, total_duration // max(len(scenes), 1))
    fixed = []
    for i, scene in enumerate(scenes):
        fixed.append({
            "scene_number":  scene.get("scene_number",  i + 1),
            "narration":     scene.get("narration",     "").strip(),
            "visual_prompt": scene.get("visual_prompt", f"professional scene {i + 1}, realistic photography, 4k"),
            "duration":      int(scene.get("duration",  per_scene)),
        })
    return fixed


def _fallback_scenes(script: str, num_scenes: int, total_duration: int) -> list:
    """Split script by sentences into equal chunks when the LLM fails."""
    sentences = [s.strip() for s in script.replace("\n", " ").split(".") if s.strip()]
    chunk_size = max(1, math.ceil(len(sentences) / num_scenes))
    per_scene  = max(5, total_duration // num_scenes)
    scenes = []
    for i in range(num_scenes):
        chunk     = sentences[i * chunk_size : (i + 1) * chunk_size]
        narration = ". ".join(chunk).strip()
        if narration and not narration.endswith("."):
            narration += "."
        scenes.append({
            "scene_number":  i + 1,
            "narration":     narration or f"Scene {i + 1} narration.",
            "visual_prompt": f"professional video scene {i + 1}, realistic photography, soft lighting, 4k, high quality",
            "duration":      per_scene,
        })
    return scenes
