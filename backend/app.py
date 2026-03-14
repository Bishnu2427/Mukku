"""Flask API for the AI Content Agent."""

import os
import sys
import uuid
import json
import logging
import threading
import subprocess
from pathlib import Path

from werkzeug.utils import secure_filename

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from database.mongo_connection import create_project, get_project, list_projects
from services.pipeline_manager import run_pipeline

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

FRONTEND_DIR = ROOT / "frontend"
VIDEOS_DIR   = ROOT / "media" / "videos"
THUMBS_DIR   = ROOT / "media" / "thumbs"

app = Flask(
    __name__,
    static_folder=str(FRONTEND_DIR),
    static_url_path="/static",
)
CORS(app)

VALID_TONES        = {"educational", "professional", "motivational", "casual", "entertaining"}
VALID_STYLES       = {"photorealistic", "cinematic", "documentary"}
VALID_RATIOS       = {"16:9", "9:16", "1:1"}
VALID_VOICES       = {"auto", "female", "male"}
VALID_PLATFORMS    = {"youtube", "youtube_shorts", "tiktok", "instagram_reels",
                      "instagram_post", "linkedin", "twitter", ""}
VALID_LANGUAGES    = {"en", "hi", "bn", "te", "mr", "ta", "gu", "kn", "ml", "pa", "or", "as"}
MAX_DURATION_SECS  = 600   # 10 minutes hard cap


def _ffmpeg_bin() -> str:
    try:
        from imageio_ffmpeg import get_ffmpeg_exe
        return get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


@app.route("/")
def landing():
    return send_file(FRONTEND_DIR / "landing.html")


@app.route("/studio")
def studio():
    return send_file(FRONTEND_DIR / "index.html")


UPLOADS_DIR = ROOT / "media" / "uploads"


@app.route("/generate", methods=["POST"])
def generate():
    # Support both multipart/form-data (with file uploads) and application/json
    if request.content_type and request.content_type.startswith("multipart/form-data"):
        prompt = request.form.get("prompt", "").strip()
        raw_settings = json.loads(request.form.get("settings", "{}") or "{}")
        uploaded_files = request.files.getlist("user_media")
    else:
        data = request.get_json(silent=True) or {}
        prompt = data.get("prompt", "").strip()
        raw_settings = data.get("settings", {}) or {}
        uploaded_files = []

    if not prompt:
        return jsonify({"error": "prompt is required"}), 400
    if len(prompt) < 10:
        return jsonify({"error": "Prompt is too short — please be more descriptive."}), 400
    if len(prompt) > 3000:
        return jsonify({"error": "Prompt is too long (max 3000 characters)."}), 400
    duration = int(raw_settings.get("duration", 60))
    duration = max(15, min(duration, MAX_DURATION_SECS))

    settings = {
        "duration":      duration,
        "tone":          raw_settings.get("tone", "educational")     if raw_settings.get("tone")     in VALID_TONES  else "educational",
        "image_style":   raw_settings.get("image_style", "photorealistic") if raw_settings.get("image_style") in VALID_STYLES else "photorealistic",
        "aspect_ratio":  raw_settings.get("aspect_ratio", "16:9")    if raw_settings.get("aspect_ratio") in VALID_RATIOS else "16:9",
        "voice_gender":  raw_settings.get("voice_gender", "auto")    if raw_settings.get("voice_gender") in VALID_VOICES else "auto",
        "include_music": bool(raw_settings.get("include_music", True)),
        "scene_count":   int(raw_settings.get("scene_count", 0)),
        "platform":      raw_settings.get("platform", "")             if raw_settings.get("platform", "") in VALID_PLATFORMS else "",
        "language":      raw_settings.get("language", "en")            if raw_settings.get("language", "en") in VALID_LANGUAGES else "en",
    }

    project_id = uuid.uuid4().hex[:10]
    create_project(project_id, prompt, settings)

    # Save any user-uploaded media files
    uploaded_paths = []
    if uploaded_files:
        upload_dir = UPLOADS_DIR / project_id
        upload_dir.mkdir(parents=True, exist_ok=True)
        for f in uploaded_files:
            if f and f.filename:
                filename = secure_filename(f.filename)
                dest = upload_dir / filename
                f.save(str(dest))
                uploaded_paths.append(str(dest))
                logger.info("Saved user upload: %s", dest)

    thread = threading.Thread(
        target=run_pipeline,
        args=(project_id, prompt, settings, uploaded_paths),
        daemon=True,
        name=f"pipeline-{project_id}",
    )
    thread.start()

    logger.info("Project %s started — platform=%s  duration=%ds  style=%s  tone=%s  ratio=%s",
                project_id, settings["platform"] or "custom", settings["duration"],
                settings["image_style"], settings["tone"], settings["aspect_ratio"])
    return jsonify({"project_id": project_id, "status": "processing"}), 202


@app.route("/status/<project_id>", methods=["GET"])
def status(project_id: str):
    project = get_project(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404

    return jsonify({
        "project_id":   project_id,
        "status":       project.get("status"),
        "current_step": project.get("current_step"),
        "progress":     project.get("progress", 0),
        "step_detail":  project.get("step_detail", ""),
        "script":       project.get("script"),
        "scenes":       project.get("scenes", []),
        "error":        project.get("error"),
        "prompt":       project.get("prompt", ""),
        "settings":     project.get("settings", {}),
        "created_at":   project.get("created_at", "").isoformat() if project.get("created_at") else None,
    })


@app.route("/video/<project_id>", methods=["GET"])
def get_video(project_id: str):
    project = get_project(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404

    if project.get("status") != "completed":
        return jsonify({"error": "Video is not ready yet.", "status": project.get("status")}), 202

    video_path = project.get("video_path", "")
    if not video_path or not os.path.exists(video_path):
        return jsonify({"error": "Video file not found on disk."}), 404

    download = request.args.get("download", "false").lower() == "true"
    return send_file(
        video_path,
        mimetype="video/mp4",
        as_attachment=download,
        download_name=f"ai_video_{project_id}.mp4",
        conditional=True,
    )


@app.route("/thumbnail/<project_id>", methods=["GET"])
def get_thumbnail(project_id: str):
    """Extract and return a JPEG thumbnail from the first frame of the video."""
    project = get_project(project_id)
    if not project or project.get("status") != "completed":
        return jsonify({"error": "not ready"}), 404

    video_path = project.get("video_path", "")
    if not video_path or not os.path.exists(video_path):
        return jsonify({"error": "video not found"}), 404

    THUMBS_DIR.mkdir(parents=True, exist_ok=True)
    thumb_path = str(THUMBS_DIR / f"{project_id}.jpg")

    if not os.path.exists(thumb_path):
        ff = _ffmpeg_bin()
        r = subprocess.run(
            [ff, "-y", "-i", video_path, "-ss", "0.5",
             "-vframes", "1", "-q:v", "5", "-vf", "scale=480:-1", thumb_path],
            capture_output=True,
        )
        if r.returncode != 0 or not os.path.exists(thumb_path):
            return jsonify({"error": "thumbnail failed"}), 500

    return send_file(thumb_path, mimetype="image/jpeg",
                     max_age=86400)  # cache 24h


@app.route("/projects", methods=["GET"])
def projects():
    limit = min(int(request.args.get("limit", 20)), 50)
    items = list_projects(limit)
    result = []
    for item in items:
        for k in ("created_at", "updated_at"):
            if item.get(k):
                item[k] = item[k].isoformat()
        # Lightweight fields only — omit large arrays
        result.append({
            "project_id":    item.get("project_id"),
            "prompt":        item.get("prompt", ""),
            "status":        item.get("status"),
            "progress":      item.get("progress", 0),
            "settings":      item.get("settings", {}),
            "created_at":    item.get("created_at"),
            "has_video":     bool(item.get("video_path") and os.path.exists(item.get("video_path", ""))),
        })
    return jsonify({"projects": result, "total": len(result)})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "version": "2.0.0"})


if __name__ == "__main__":
    port  = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    logger.info("Starting AI Content Agent on http://0.0.0.0:%d", port)
    # threaded=True ensures each request gets its own thread —
    # prevents pipeline background threads from blocking new API calls.
    app.run(host="0.0.0.0", port=port, debug=debug,
            use_reloader=False, threaded=True)
