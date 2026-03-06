"""
MongoDB connection and CRUD operations for AI Content Agent.
"""

import os
from datetime import datetime
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
DB_NAME = os.getenv("MONGO_DB", "ai_content_agent")

_client = None
_db = None


def _get_db():
    global _client, _db
    if _client is None:
        _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        _db = _client[DB_NAME]
    return _db


def create_project(project_id: str, prompt: str) -> dict:
    """Insert a new project document and return it."""
    project = {
        "project_id": project_id,
        "prompt": prompt,
        "status": "queued",
        "current_step": "queued",
        "progress": 0,
        "analysis": None,
        "script": None,
        "scenes": [],
        "image_paths": [],
        "audio_paths": [],
        "video_path": None,
        "error": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    _get_db()["projects"].insert_one(project)
    return project


def get_project(project_id: str) -> dict | None:
    """Fetch a project by ID, excluding MongoDB internal _id."""
    return _get_db()["projects"].find_one(
        {"project_id": project_id}, {"_id": 0}
    )


def update_project(project_id: str, updates: dict) -> None:
    """Partially update a project document."""
    updates["updated_at"] = datetime.utcnow()
    _get_db()["projects"].update_one(
        {"project_id": project_id},
        {"$set": updates},
    )


def list_projects(limit: int = 20) -> list:
    """Return the most recent projects (for dashboard use)."""
    cursor = (
        _get_db()["projects"]
        .find({}, {"_id": 0})
        .sort("created_at", -1)
        .limit(limit)
    )
    return list(cursor)
