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
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from database.mongo_connection import create_project, get_project, list_projects
from database.user_model import _ensure_indexes, seed_super_admin
from services.pipeline_manager import run_pipeline
from backend.auth import auth_bp
from backend.admin_api import admin_bp

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s - %(message)s",
)
logger = logging.getLogger(__name__)

FRONTEND_DIR = ROOT / "frontend"
VIDEOS_DIR   = ROOT / "media" / "videos"
THUMBS_DIR   = ROOT / "media" / "thumbs"

# Allowed upload extensions and max size (50 MB)
ALLOWED_UPLOAD_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp", "mp4", "mov", "wav", "mp3"}
MAX_UPLOAD_BYTES = 50 * 1024 * 1024

app = Flask(
    __name__,
    static_folder=str(FRONTEND_DIR),
    static_url_path="/static",
)

# CORS — restrict to the same origin in production; allow all in dev
_app_origin = os.getenv("APP_URL", "http://localhost:7000").rstrip("/")
CORS(app,
     supports_credentials=True,
     origins=[_app_origin, "http://localhost:7000", "http://127.0.0.1:7000"])

app.secret_key = os.getenv("JWT_SECRET", "change-me-in-production")

# ── Rate limiter (in-memory; swap storage_uri for Redis in production) ─────────
limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=[],   # no global limit — only on specific endpoints
    storage_uri="memory://",
)

# ── Security headers ───────────────────────────────────────────────────────────
@app.after_request
def set_security_headers(response):
    # Prevent MIME-type sniffing
    response.headers["X-Content-Type-Options"] = "nosniff"
    # Deny framing (clickjacking)
    response.headers["X-Frame-Options"] = "DENY"
    # Legacy XSS filter (for older browsers)
    response.headers["X-XSS-Protection"] = "1; mode=block"
    # Don't send referrer to external sites
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # Only send HSTS if actually on HTTPS
    if os.getenv("APP_URL", "").startswith("https://"):
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    # Content Security Policy — allows inline styles/scripts needed for the SPA
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; "
        "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; "
        "img-src 'self' data: blob:; "
        "media-src 'self' blob:; "
        "connect-src 'self'; "
        "frame-ancestors 'none';"
    )
    return response

# Register blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(admin_bp)

# ── Per-endpoint rate limits ───────────────────────────────────────────────────
# Auth endpoints: strict limits to prevent brute force / spam
limiter.limit("10 per minute")(app.view_functions["auth.api_login"])
limiter.limit("10 per minute")(app.view_functions["auth.api_verify_otp"])
limiter.limit("5 per minute")(app.view_functions["auth.api_register"])
limiter.limit("5 per minute")(app.view_functions["auth.api_forgot_password"])
limiter.limit("5 per minute")(app.view_functions["auth.api_reset_password"])

# Ensure MongoDB indexes and seed super admin on startup
try:
    _ensure_indexes()
    seed_super_admin()
except Exception as _idx_err:
    logger.warning("Could not initialise DB: %s", _idx_err)

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

    # Attach user_id if request is authenticated
    from backend.auth import get_current_user as _get_user
    current_user = _get_user()
    user_id      = current_user["user_id"] if current_user else None

    project_id = uuid.uuid4().hex[:10]
    create_project(project_id, prompt, settings, user_id=user_id)

    # Save any user-uploaded media files (validated)
    uploaded_paths = []
    if uploaded_files:
        upload_dir = UPLOADS_DIR / project_id
        upload_dir.mkdir(parents=True, exist_ok=True)
        for f in uploaded_files:
            if not f or not f.filename:
                continue
            # Validate extension
            ext = f.filename.rsplit(".", 1)[-1].lower() if "." in f.filename else ""
            if ext not in ALLOWED_UPLOAD_EXTENSIONS:
                return jsonify({"error": f"File type '.{ext}' is not allowed."}), 400
            # Validate size (read into memory limit)
            f.seek(0, 2)
            size = f.tell()
            f.seek(0)
            if size > MAX_UPLOAD_BYTES:
                return jsonify({"error": f"File too large (max {MAX_UPLOAD_BYTES // 1024 // 1024} MB)."}), 413
            # Save with UUID prefix to prevent collisions and path traversal
            safe_name = f"{uuid.uuid4().hex[:8]}_{secure_filename(f.filename)}"
            dest = upload_dir / safe_name
            f.save(str(dest))
            uploaded_paths.append(str(dest))
            logger.info("Saved user upload: %s (%d bytes)", dest, size)

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


@app.route("/enquiry", methods=["POST"])
def enquiry():
    """Receive a contact-form submission and forward it via SMTP."""
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    data    = request.get_json(silent=True) or {}
    name    = data.get("name", "").strip()
    email   = data.get("email", "").strip()
    etype   = data.get("type", "Not specified")
    message = data.get("message", "").strip()

    if not name or not email or not message:
        return jsonify({"error": "name, email and message are required"}), 400

    smtp_server   = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port     = int(os.getenv("SMTP_PORT", 587))
    smtp_user     = os.getenv("SMTP_USERNAME", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")

    if not smtp_user or not smtp_password:
        logger.warning("SMTP credentials not configured — enquiry not sent.")
        return jsonify({"error": "Email service not configured"}), 503

    body = f"""New enquiry from Mukku AI Studio landing page

Name    : {name}
Email   : {email}
Type    : {etype}
Message :
{message}
"""
    msg = MIMEMultipart()
    msg["From"]    = smtp_user
    msg["To"]      = smtp_user          # send to yourself
    msg["Subject"] = f"[Mukku AI] Enquiry from {name}"
    msg["Reply-To"] = email
    msg.attach(MIMEText(body, "plain"))

    try:
        with smtplib.SMTP(smtp_server, smtp_port, timeout=15) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, smtp_user, msg.as_string())
        logger.info("Enquiry email sent from %s (%s)", name, email)
        return jsonify({"status": "sent"})
    except Exception as exc:
        logger.error("Failed to send enquiry email: %s", exc)
        return jsonify({"error": "Failed to send email"}), 500


if __name__ == "__main__":
    port  = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    logger.info("Starting AI Content Agent on http://0.0.0.0:%d", port)
    # threaded=True ensures each request gets its own thread —
    # prevents pipeline background threads from blocking new API calls.
    app.run(host="0.0.0.0", port=port, debug=debug,
            use_reloader=False, threaded=True)
