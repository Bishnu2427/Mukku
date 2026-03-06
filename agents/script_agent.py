"""
Script Generation Agent.

Uses a local Ollama LLM to convert a structured prompt analysis
into a professional video narration script.
"""

import os
import logging
import requests

logger = logging.getLogger(__name__)

OLLAMA_URL   = os.getenv("OLLAMA_URL",   "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")


def generate_script(prompt: str, analysis: dict) -> str:
    """
    Generate a professional narration script.

    Parameters
    ----------
    prompt   : original user prompt
    analysis : structured dict from prompt_agent

    Returns
    -------
    str  - plain narration text (no stage directions)
    """
    duration      = analysis.get("duration", 60)
    topic         = analysis.get("topic", prompt)
    audience      = analysis.get("target_audience", "general audience")
    tone          = analysis.get("tone", "educational")
    key_points    = analysis.get("key_points", [])
    word_estimate = int(duration * 2.5)  # ~150 wpm speaking pace

    system_msg = (
        "You are a professional video scriptwriter. "
        "Write engaging, natural-sounding video narration scripts. "
        "Rules:\n"
        "  - Write ONLY the spoken narration text.\n"
        "  - Do NOT include scene numbers, stage directions, or visual descriptions.\n"
        "  - Keep sentences short and conversational.\n"
        "  - Match the requested tone exactly.\n"
        f"  - Target approximately {word_estimate} words."
    )

    key_points_str = "\n".join(f"  - {kp}" for kp in key_points) if key_points else "  - Cover the topic thoroughly"

    user_msg = (
        f"Write a {duration}-second video narration script about:\n\n"
        f"Topic:           {topic}\n"
        f"Target Audience: {audience}\n"
        f"Tone:            {tone}\n"
        f"Key Points:\n{key_points_str}\n\n"
        f"Original Request: {prompt}\n\n"
        "Write the complete narration script now:"
    )

    try:
        script = _call_ollama(system_msg, user_msg).strip()
        logger.debug("Script generated (%d chars)", len(script))
        return script
    except Exception as exc:
        logger.warning("Script agent failed (%s). Using fallback script.", exc)
        return _fallback_script(topic, key_points)


# ──────────────────────────────────────────────────────────────────────────────

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


def _fallback_script(topic: str, key_points: list) -> str:
    points_text = " ".join(
        f"Let's talk about {kp.lower()}." for kp in key_points
    )
    return (
        f"Welcome! Today we're going to explore {topic}. "
        f"{points_text} "
        "I hope you found this helpful. Thanks for watching, and don't forget to like and subscribe!"
    )
