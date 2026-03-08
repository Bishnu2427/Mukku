"""Analyzes raw user prompts and extracts structured video parameters via Ollama."""

import os
import json
import logging
import requests

logger = logging.getLogger(__name__)

OLLAMA_URL   = os.getenv("OLLAMA_URL",   "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")


def understand_prompt(prompt: str) -> dict:
    """Run the prompt through Ollama and return a structured analysis dict."""
    system_msg = (
        "You are a professional video content strategist. "
        "Analyze the user's video request and extract the following fields as JSON:\n"
        "  topic          - main subject of the video\n"
        "  target_audience - who the video is for\n"
        "  duration       - estimated duration in SECONDS (integer, e.g. 60)\n"
        "  tone           - one of: professional, casual, educational, entertaining\n"
        "  key_points     - list of 3–5 main points to cover\n\n"
        "Respond ONLY with valid JSON. No extra text."
    )

    user_msg = f"Analyze this video request and return JSON:\n\n{prompt}"

    try:
        raw = _call_ollama(system_msg, user_msg)
        logger.debug("Prompt agent raw response: %s", raw)
        result = _extract_json(raw)
        result["duration"] = int(result.get("duration", 60))
        return result
    except Exception as exc:
        logger.warning("Prompt agent failed (%s). Using defaults.", exc)
        return _fallback(prompt)


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
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()["message"]["content"]


def _extract_json(text: str) -> dict:
    start = text.find("{")
    end   = text.rfind("}") + 1
    if start < 0 or end <= start:
        raise ValueError("No JSON object found in LLM response.")
    return json.loads(text[start:end])


def _fallback(prompt: str) -> dict:
    return {
        "topic":           prompt[:120],
        "target_audience": "general audience",
        "duration":        60,
        "tone":            "educational",
        "key_points":      ["Introduction", "Main content", "Key takeaways", "Conclusion"],
    }
