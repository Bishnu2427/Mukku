"""Flask API for the AI Content Agent."""

import os
import sys
import uuid
import logging
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from flask import Flask, jsonify, request, send_file, abort
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from database.mongo_connection  import create_project, get_project, list_projects
from services.pipeline_manager  import run_pipeline

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


@app.route("/")
def index():
    return send_file(FRONTEND_DIR / "index.html")


@app.route("/generate", methods=["POST"])
def generate():
    """Start a new video generation pipeline."""
    data   = request.get_json(silent=True) or {}
    prompt = data.get("prompt", "").strip()

    if not prompt:
        return jsonify({"error": "prompt is required"}), 400
    if len(prompt) < 15:
        return jsonify({"error": "Prompt is too short — please be more descriptive."}), 400
    if len(prompt) > 2000:
        return jsonify({"error": "Prompt is too long (max 2000 characters)."}), 400

    project_id = uuid.uuid4().hex[:10]
    create_project(project_id, prompt)

    thread = threading.Thread(
        target=run_pipeline,
        args=(project_id, prompt),
        daemon=True,
        name=f"pipeline-{project_id}",
    )
    thread.start()

    logger.info("New project %s queued for prompt: %.80s", project_id, prompt)
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
        conditional=True,    # supports Range requests for the HTML5 player
    )


@app.route("/projects", methods=["GET"])
def projects():
    limit = min(int(request.args.get("limit", 10)), 50)
    items = list_projects(limit)
    # serialize datetime objects before sending
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
