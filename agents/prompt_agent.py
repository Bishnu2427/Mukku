import os
import json
import logging
import requests

logger = logging.getLogger(__name__)

OLLAMA_URL   = os.getenv("OLLAMA_URL",   "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL   = "llama-3.3-70b-versatile"


def understand_prompt(prompt: str) -> dict:
    system_msg = (
        "You are a professional video content strategist. "
        "Analyze the user's video request and extract the following fields as JSON:\n"
        "  topic           - the specific, detailed main subject of the video\n"
        "  target_audience - who the video is for\n"
        "  duration        - estimated duration in SECONDS (integer, e.g. 60)\n"
        "  tone            - one of: professional, casual, educational, entertaining, motivational\n"
        "  key_points      - list of 4-6 specific main points to cover, directly related to the topic\n\n"
        "The topic must be specific and detailed — not generic. "
        "Respond ONLY with valid JSON. No extra text."
    )
    user_msg = f"Analyze this video request and return JSON:\n\n{prompt}"

    try:
        raw    = _call_llm(system_msg, user_msg)
        result = _extract_json(raw)
        result["duration"] = int(result.get("duration", 60))
        logger.info("Prompt analysis: topic=%s  duration=%ds", result.get("topic"), result.get("duration"))
        return result
    except Exception as exc:
        logger.warning("Prompt agent failed (%s). Using defaults.", exc)
        return _fallback(prompt)


def _call_llm(system_msg: str, user_msg: str) -> str:
    try:
        return _call_ollama(system_msg, user_msg)
    except Exception as e:
        logger.warning("Ollama unavailable (%s). Trying Groq...", e)
        return _call_groq(system_msg, user_msg)


def _call_ollama(system_msg: str, user_msg: str) -> str:
    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system_msg},
            {"role": "user",   "content": user_msg},
        ],
        "stream": False,
    }
    resp = requests.post(f"{OLLAMA_URL}/api/chat", json=payload, timeout=120)
    resp.raise_for_status()
    return resp.json()["message"]["content"]


def _call_groq(system_msg: str, user_msg: str) -> str:
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY not set")
    resp = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        json={
            "model": GROQ_MODEL,
            "messages": [
                {"role": "system", "content": system_msg},
                {"role": "user",   "content": user_msg},
            ],
            "temperature": 0.7,
        },
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
        },
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def _extract_json(text: str) -> dict:
    start = text.find("{")
    end   = text.rfind("}") + 1
    if start < 0 or end <= start:
        raise ValueError("No JSON object found in LLM response.")
    return json.loads(text[start:end])


def _fallback(prompt: str) -> dict:
    return {
        "topic":           prompt[:200],
        "target_audience": "general audience",
        "duration":        60,
        "tone":            "educational",
        "key_points":      ["Introduction", "Step-by-step guide", "Key tips", "Common mistakes to avoid", "Conclusion"],
    }
