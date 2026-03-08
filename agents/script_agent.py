import os
import logging
import requests

logger = logging.getLogger(__name__)

OLLAMA_URL   = os.getenv("OLLAMA_URL",   "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL   = "llama-3.3-70b-versatile"

_LANG_NAMES = {
    "en": "English",
    "hi": "Hindi",
    "bn": "Bengali",
    "te": "Telugu",
    "mr": "Marathi",
    "ta": "Tamil",
    "gu": "Gujarati",
    "kn": "Kannada",
    "ml": "Malayalam",
    "pa": "Punjabi",
    "or": "Odia",
    "as": "Assamese",
}


def generate_script(prompt: str, analysis: dict, language: str = "en") -> str:
    duration      = analysis.get("duration", 60)
    topic         = analysis.get("topic", prompt)
    audience      = analysis.get("target_audience", "general audience")
    tone          = analysis.get("tone", "educational")
    key_points    = analysis.get("key_points", [])
    word_estimate = int(duration * 2.5)

    lang_name = _LANG_NAMES.get(language, "English")
    lang_rule = (
        f"  - Write the ENTIRE script in {lang_name} language only. Do NOT mix languages.\n"
        if language != "en" else ""
    )

    system_msg = (
        "You are a professional video scriptwriter. "
        "Write engaging, natural-sounding narration scripts that are deeply relevant to the given topic. "
        "Rules:\n"
        "  - Every sentence must be directly about the topic. Stay on topic at all times.\n"
        "  - Write ONLY the spoken narration text. No scene numbers or stage directions.\n"
        "  - Keep sentences short and conversational.\n"
        "  - The script must be specific, practical, and useful — not generic filler content.\n"
        "  - Match the requested tone exactly.\n"
        f"{lang_rule}"
        f"  - Target approximately {word_estimate} words."
    )

    key_points_str = "\n".join(f"  - {kp}" for kp in key_points) if key_points else "  - Cover the topic thoroughly with specific details"

    user_msg = (
        f"Write a {duration}-second video narration script about:\n\n"
        f"Topic:           {topic}\n"
        f"Target Audience: {audience}\n"
        f"Tone:            {tone}\n"
        f"Language:        {lang_name}\n"
        f"Key Points to Cover:\n{key_points_str}\n\n"
        f"Original Request: {prompt}\n\n"
        "IMPORTANT: Every sentence must be specific to the topic. Avoid generic filler content.\n\n"
        "Write the complete narration script now:"
    )

    try:
        script = _call_llm(system_msg, user_msg).strip()
        logger.info("Script generated (%d chars) for topic: %s", len(script), topic)
        return script
    except Exception as exc:
        logger.warning("Script agent failed (%s). Using fallback script.", exc)
        return _fallback_script(topic, key_points)


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
    resp = requests.post(f"{OLLAMA_URL}/api/chat", json=payload, timeout=180)
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
            "temperature": 0.75,
        },
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
        },
        timeout=90,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def _fallback_script(topic: str, key_points: list) -> str:
    points_text = " ".join(
        f"Let's walk through {kp.lower()}." for kp in key_points
    )
    return (
        f"Welcome! Today we're going to cover everything you need to know about {topic}. "
        f"{points_text} "
        "I hope you found this helpful. Thanks for watching!"
    )
