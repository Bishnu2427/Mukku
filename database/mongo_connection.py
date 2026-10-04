"""MongoDB connection and CRUD helpers for the AI Content Agent."""

import os
from datetime import datetime, timezone
from pymongo import MongoClient

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
DB_NAME = os.getenv("MONGO_DB", "ai_content_agent")

_client = None
_db = None


def _get_db():
    global _client, _db
    if _client is None:
        # tz_aware=True makes PyMongo return timezone-aware UTC datetimes.
        # Without it, values read back are naive and any comparison against
        # datetime.now(timezone.utc) raises TypeError — which is what made the
        # brute-force lockout in auth.py return 500 instead of 429. It also
        # means isoformat() now carries a +00:00 offset, so the browser stops
        # interpreting stored UTC timestamps as local time.
        _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000, tz_aware=True)
        _db = _client[DB_NAME]
    return _db


def create_project(project_id: str, prompt: str, settings: dict = None,
                   user_id: str = None) -> dict:
    """Insert a new project document and return it."""
    project = {
        "project_id":   project_id,
        "user_id":      user_id,
        "prompt":       prompt,
        "settings":     settings or {},
        "status":       "queued",
        "current_step": "queued",
        "progress":     0,
        "analysis":     None,
        "script":       None,
        "scenes":       [],
        "image_paths":  [],
        "audio_paths":  [],
        "video_path":   None,
        "error":        None,
        "created_at":   datetime.now(timezone.utc),
        "updated_at":   datetime.now(timezone.utc),
    }
    _get_db()["projects"].insert_one(project)
    return project


def get_project(project_id: str) -> dict | None:
    return _get_db()["projects"].find_one(
        {"project_id": project_id}, {"_id": 0}
    )


def update_project(project_id: str, updates: dict) -> None:
    updates["updated_at"] = datetime.now(timezone.utc)
    _get_db()["projects"].update_one(
        {"project_id": project_id},
        {"$set": updates},
    )


def delete_project(project_id: str) -> bool:
    """Remove a project document. Media files are handled by the caller."""
    res = _get_db()["projects"].delete_one({"project_id": project_id})
    return res.deleted_count > 0


def count_active_projects(user_id: str) -> int:
    """Renders currently queued or running for this user.

    Counted against the quota alongside videos_this_month, so firing several
    /generate requests in parallel cannot slip past the plan limit while none
    of them has completed yet.
    """
    return _get_db()["projects"].count_documents({
        "user_id": user_id,
        "status": {"$in": ["queued", "processing"]},
    })


def reconcile_stale_projects(max_idle_minutes: int = 45) -> int:
    """Fail projects that were mid-render when the process died.

    Generation writes progress on every stage transition, so `updated_at` acts
    as a heartbeat. A project still marked queued/processing that has not been
    touched for `max_idle_minutes` has no owner — its worker is gone — and
    would otherwise sit "processing" forever in the user's dashboard.

    The window must stay generous: Veo polls up to 10 minutes per clip, and
    final assembly emits no intermediate updates, so a healthy render can be
    quiet for a long time. Returns the number of projects failed.
    """
    from datetime import timedelta

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=max_idle_minutes)
    result = _get_db()["projects"].update_many(
        {
            "status": {"$in": ["queued", "processing"]},
            "updated_at": {"$lt": cutoff},
        },
        {
            "$set": {
                "status": "failed",
                "current_step": "failed",
                "progress": 0,
                "error": (
                    "Generation was interrupted — the server restarted while this "
                    "video was rendering. Please try again."
                ),
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    return result.modified_count


def list_projects(limit: int = 20) -> list:
    """Return the most recent projects, newest first (admin use)."""
    cursor = (
        _get_db()["projects"]
        .find({}, {"_id": 0})
        .sort("created_at", -1)
        .limit(limit)
    )
    return list(cursor)


def list_projects_for_user(user_id: str, limit: int = 20) -> list:
    """Return only the projects owned by the given user."""
    cursor = (
        _get_db()["projects"]
        .find({"user_id": user_id}, {"_id": 0})
        .sort("created_at", -1)
        .limit(limit)
    )
    return list(cursor)
