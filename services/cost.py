"""Per-render cost accounting.

Every provider call is recorded against the project that triggered it, so you
can answer the two questions that decide whether the business works:

    what does one video actually cost?
    which plan tiers are underwater?

Rates are list prices in USD and WILL drift — override any of them from the
environment rather than editing this file, e.g.

    COST_VEO_PER_SECOND=0.40
    COST_LEONARDO_PER_IMAGE=0.011

These are estimates for budgeting, not invoices. Reconcile against your real
provider bills monthly; the point is relative magnitude, and the magnitudes
here differ by three orders of magnitude between the cheapest and dearest path.
"""

import os
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def _rate(env_key: str, default: float) -> float:
    try:
        return float(os.getenv(env_key, default))
    except (TypeError, ValueError):
        return default


# ── Rate card (USD) ──────────────────────────────────────────────────────────
# Veo dominates everything else by a wide margin: one 8-second clip costs more
# than a hundred Leonardo images. That single number is why T3-2 (route
# providers by plan tier) exists.
RATES = {
    "veo_per_second":       lambda: _rate("COST_VEO_PER_SECOND", 0.40),
    "kling_per_clip":       lambda: _rate("COST_KLING_PER_CLIP", 0.28),
    "pollo_per_clip":       lambda: _rate("COST_POLLO_PER_CLIP", 0.20),
    "leonardo_per_image":   lambda: _rate("COST_LEONARDO_PER_IMAGE", 0.011),
    "suno_per_track":       lambda: _rate("COST_SUNO_PER_TRACK", 0.05),
    "groq_per_1k_tokens":   lambda: _rate("COST_GROQ_PER_1K_TOKENS", 0.0007),
    "elevenlabs_per_1k_ch": lambda: _rate("COST_ELEVENLABS_PER_1K_CHARS", 0.30),
}

# Paths that cost nothing but still get recorded, so a cheap render is visibly
# cheap rather than simply missing from the ledger.
FREE_PROVIDERS = {"ken_burns", "placeholder", "gtts", "pyttsx3", "piper", "ollama", "none"}


def estimate(provider: str, *, seconds: float = 0, images: int = 0,
             clips: int = 0, tracks: int = 0, tokens: int = 0,
             characters: int = 0) -> float:
    """Estimated USD for one provider call. Unknown providers cost 0."""
    p = (provider or "").lower()
    if p in FREE_PROVIDERS:
        return 0.0
    if p == "veo":
        return RATES["veo_per_second"]() * seconds
    if p == "kling":
        return RATES["kling_per_clip"]() * max(clips, 1)
    if p == "pollo":
        return RATES["pollo_per_clip"]() * max(clips, 1)
    if p == "leonardo":
        return RATES["leonardo_per_image"]() * max(images, 1)
    if p == "suno":
        return RATES["suno_per_track"]() * max(tracks, 1)
    if p == "groq":
        return RATES["groq_per_1k_tokens"]() * (tokens / 1000.0)
    if p == "elevenlabs":
        return RATES["elevenlabs_per_1k_ch"]() * (characters / 1000.0)
    return 0.0


def record(project_id: str, stage: str, provider: str, **units) -> float:
    """Append one cost line to the project and return the estimated USD.

    Never raises: cost accounting must not be able to fail a render.
    """
    try:
        usd = estimate(provider, **units)
        from database.mongo_connection import _get_db

        entry = {
            "stage":    stage,
            "provider": provider,
            "usd":      round(usd, 6),
            "units":    {k: v for k, v in units.items() if v},
            "at":       datetime.now(timezone.utc),
        }
        _get_db()["projects"].update_one(
            {"project_id": project_id},
            {"$push": {"cost_lines": entry},
             "$inc":  {"cost_usd": round(usd, 6)}},
        )
        return usd
    except Exception as exc:
        logger.debug("Cost record skipped for %s/%s: %s", project_id, stage, exc)
        return 0.0


def summarise(project: dict) -> dict:
    """Roll a project's cost lines up by stage and by provider."""
    lines = project.get("cost_lines") or []
    by_stage: dict[str, float] = {}
    by_provider: dict[str, float] = {}
    for line in lines:
        by_stage[line.get("stage", "?")] = round(
            by_stage.get(line.get("stage", "?"), 0) + line.get("usd", 0), 6)
        by_provider[line.get("provider", "?")] = round(
            by_provider.get(line.get("provider", "?"), 0) + line.get("usd", 0), 6)
    return {
        "total_usd":   round(project.get("cost_usd", 0), 4),
        "by_stage":    by_stage,
        "by_provider": by_provider,
        "line_count":  len(lines),
    }
