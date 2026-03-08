"""Flask API for the AI Content Agent."""

import os
import sys
import uuid
import logging
import threading
from pathlib import Path

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
MAX_DURATION_SECS  = 600   # 10 minutes hard cap


@app.route("/")
def index():
    return send_file(FRONTEND_DIR / "index.html")


@app.route("/generate", methods=["POST"])
def generate():
    data   = request.get_json(silent=True) or {}
    prompt = data.get("prompt", "").strip()

    if not prompt:
        return jsonify({"error": "prompt is required"}), 400
    if len(prompt) < 10:
        return jsonify({"error": "Prompt is too short — please be more descriptive."}), 400
    if len(prompt) > 3000:
        return jsonify({"error": "Prompt is too long (max 3000 characters)."}), 400

    # Pull user settings, apply sensible defaults + bounds
    raw_settings = data.get("settings", {}) or {}

    duration = int(raw_settings.get("duration", 60))
    duration = max(15, min(duration, MAX_DURATION_SECS))

    settings = {
        "duration":      duration,
        "tone":          raw_settings.get("tone", "educational")     if raw_settings.get("tone")     in VALID_TONES  else "educational",
        "image_style":   raw_settings.get("image_style", "photorealistic") if raw_settings.get("image_style") in VALID_STYLES else "photorealistic",
        "aspect_ratio":  raw_settings.get("aspect_ratio", "16:9")    if raw_settings.get("aspect_ratio") in VALID_RATIOS else "16:9",
        "voice_gender":  raw_settings.get("voice_gender", "auto")    if raw_settings.get("voice_gender") in VALID_VOICES else "auto",
        "include_music": bool(raw_settings.get("include_music", True)),
        "scene_count":   int(raw_settings.get("scene_count", 0)),     # 0 = auto
    }

    project_id = uuid.uuid4().hex[:10]
    create_project(project_id, prompt)

    thread = threading.Thread(
        target=run_pipeline,
        args=(project_id, prompt, settings),
        daemon=True,
        name=f"pipeline-{project_id}",
    )
    thread.start()

    logger.info("Project %s started — duration=%ds  style=%s  tone=%s",
                project_id, settings["duration"], settings["image_style"], settings["tone"])
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
        "script":       project.get("script"),
        "scenes":       project.get("scenes", []),
        "error":        project.get("error"),
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


@app.route("/projects", methods=["GET"])
def projects():
    limit = min(int(request.args.get("limit", 10)), 50)
    items = list_projects(limit)
    for item in items:
        for k in ("created_at", "updated_at"):
            if item.get(k):
                item[k] = item[k].isoformat()
    return jsonify({"projects": items})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "version": "1.0.0"})


if __name__ == "__main__":
    port  = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    logger.info("Starting AI Content Agent on http://0.0.0.0:%d", port)
    app.run(host="0.0.0.0", port=port, debug=debug, use_reloader=False)
