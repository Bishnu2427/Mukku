import os
import re
import json
import math
import logging
import requests

logger = logging.getLogger(__name__)

OLLAMA_URL   = os.getenv("OLLAMA_URL",   "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL   = "llama-3.3-70b-versatile"


def generate_scenes(script: str, analysis: dict, scene_count_override: int = 0) -> list[dict]:
    total_duration = analysis.get("duration", 60)
    topic          = analysis.get("topic", "")
    num_scenes     = scene_count_override if scene_count_override > 0 else _estimate_scene_count(total_duration)

    system_msg = (
        "You are a professional video director. "
        "Break the provided narration script into scenes for a video.\n\n"
        "For each scene, return a JSON object with these exact keys:\n"
        "  scene_number  (integer, starting at 1)\n"
        "  narration     (the spoken words for this scene, taken verbatim from the script)\n"
        "  visual_prompt (a highly specific image generation prompt — see rules below)\n"
        "  duration      (integer seconds for this scene)\n\n"
        "VISUAL PROMPT RULES — this is critical:\n"
        "  - The visual_prompt MUST show exactly what is happening in the narration.\n"
        "  - It must be directly relevant to the topic and scene content. Never use generic filler.\n"
        "  - WRONG: 'professional photography, soft lighting, 4k'\n"
        "  - WRONG: 'cinematic scene, beautiful lighting'\n"
        "  - RIGHT: 'caring mother gently changing newborn baby diaper on white changing table, "
        "baby wipes and cream nearby, soft nursery room lighting, warm and reassuring atmosphere, "
        "realistic photography, 4k'\n"
        "  - Include: the specific subject, what they are doing, the setting, and the mood.\n"
        "  - End with: realistic photography, natural lighting, 4k, high detail\n\n"
        "Respond ONLY with a valid JSON array. No extra text."
    )

    user_msg = (
        f"Break this script into exactly {num_scenes} scenes.\n"
        f"Total video duration: {total_duration} seconds.\n"
        f"Video topic: {topic}\n\n"
        f"SCRIPT:\n{script}\n\n"
        "Remember: each visual_prompt must SHOW the specific content of that scene — "
        "directly tied to the topic and narration. No generic photography descriptions.\n\n"
        "Return a JSON array now:"
    )

    try:
        raw    = _call_llm(system_msg, user_msg)
        scenes = _extract_json_array(raw)
        scenes = _validate_and_fix(scenes, total_duration, topic)
        logger.info("Scene agent produced %d scenes for topic: %s", len(scenes), topic)
        return scenes
    except Exception as exc:
        logger.warning("Scene agent failed (%s). Using smart fallback.", exc)
        return _fallback_scenes(script, num_scenes, total_duration, topic)


def _estimate_scene_count(duration: int) -> int:
    return max(3, min(10, math.ceil(duration / 10)))


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
            "temperature": 0.7,
        },
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
        },
        timeout=90,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def _extract_json_array(text: str) -> list:
    start = text.find("[")
    end   = text.rfind("]") + 1
    if start < 0 or end <= start:
        raise ValueError("No JSON array found in LLM response.")
    return json.loads(text[start:end])


def _validate_and_fix(scenes: list, total_duration: int, topic: str) -> list:
    per_scene = max(5, total_duration // max(len(scenes), 1))
    fixed = []
    for i, scene in enumerate(scenes):
        narration = scene.get("narration", "").strip()
        vp        = scene.get("visual_prompt", "").strip()

        # If the visual_prompt is too generic (shorter than 60 chars or missing topic keywords),
        # build a better one from the narration + topic.
        if len(vp) < 60 or not _is_topic_relevant(vp, topic):
            vp = _build_visual_prompt(narration, topic)

        fixed.append({
            "scene_number":  scene.get("scene_number", i + 1),
            "narration":     narration,
            "visual_prompt": vp,
            "duration":      int(scene.get("duration", per_scene)),
        })
    return fixed


def _is_topic_relevant(visual_prompt: str, topic: str) -> bool:
    """Check if the visual prompt contains meaningful topic keywords."""
    if not topic:
        return True
    topic_words = set(re.findall(r"\b\w{4,}\b", topic.lower()))
    prompt_words = set(re.findall(r"\b\w{4,}\b", visual_prompt.lower()))
    # At least 1 topic keyword must appear in the prompt
    return bool(topic_words & prompt_words)


def _build_visual_prompt(narration: str, topic: str) -> str:
    """Build a topic-specific visual prompt from the narration and topic."""
    # Take the most descriptive part of the narration
    first_sentence = narration.split(".")[0].strip()
    if len(first_sentence) > 120:
        first_sentence = first_sentence[:120]

    if first_sentence:
        core = f"{topic}, {first_sentence}"
    else:
        core = topic

    return (
        f"{core}, realistic photography, natural soft lighting, "
        "4k ultra-detailed, professional cinematography, high detail"
    )


def _fallback_scenes(script: str, num_scenes: int, total_duration: int, topic: str = "") -> list:
    """Split script by sentences. Visual prompts are derived from narration + topic."""
    sentences  = [s.strip() for s in script.replace("\n", " ").split(".") if s.strip()]
    chunk_size = max(1, math.ceil(len(sentences) / num_scenes))
    per_scene  = max(5, total_duration // num_scenes)
    scenes     = []

    for i in range(num_scenes):
        chunk     = sentences[i * chunk_size : (i + 1) * chunk_size]
        narration = ". ".join(chunk).strip()
        if narration and not narration.endswith("."):
            narration += "."

        if not narration:
            narration = f"Scene {i + 1}."

        scenes.append({
            "scene_number":  i + 1,
            "narration":     narration,
            "visual_prompt": _build_visual_prompt(narration, topic),
            "duration":      per_scene,
        })

    return scenes
