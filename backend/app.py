"""Flask API for the AI Content Agent."""

import os
import sys
import uuid
import json
import logging
import subprocess
from pathlib import Path

from werkzeug.utils import secure_filename

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from flask import Flask, jsonify, request, send_file, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from database.mongo_connection import (
    create_project, get_project, list_projects, list_projects_for_user,
    reconcile_stale_projects,
)
from database.user_model import _ensure_indexes, seed_super_admin
from backend.extensions import limiter, _storage_uri, safe_int, LIMIT_ENQUIRY
from services import job_queue
from backend.auth import auth_bp
from backend.admin_api import admin_bp

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s - %(message)s",
)
logger = logging.getLogger(__name__)

# React SPA build output (Frontend/dist). Vite emits index.html + assets/ here.
FRONTEND_DIR = ROOT / "Frontend" / "dist"
SPA_INDEX    = FRONTEND_DIR / "index.html"
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

# ── Secrets (OWASP A02: Cryptographic Failures) ────────────────────────────────
_IS_HTTPS   = os.getenv("APP_URL", "").startswith("https://")
_DEBUG      = os.getenv("FLASK_DEBUG", "false").lower() == "true"
_JWT_SECRET = os.getenv("JWT_SECRET", "")
_WEAK_MARKERS = ("change-me", "changeme", "mukku-change-me", "secret", "password")


def _validate_secrets() -> None:
    """Refuse to boot in production with a guessable signing key.

    Previously a missing JWT_SECRET only logged a warning and fell back to a
    hardcoded literal that is committed to the repo. Anyone with the source
    could forge a session cookie for any user, including the super admin.
    A warning is not enough for that — production must fail closed.
    """
    problems = []
    if not _JWT_SECRET:
        problems.append("JWT_SECRET is not set")
    else:
        low = _JWT_SECRET.lower()
        if len(_JWT_SECRET) < 32:
            problems.append(f"JWT_SECRET is only {len(_JWT_SECRET)} chars (need 32+)")
        if any(m in low for m in _WEAK_MARKERS):
            problems.append("JWT_SECRET contains a placeholder value")

    if not problems:
        return

    detail = "; ".join(problems)
    if _DEBUG:
        logger.warning("INSECURE SECRET (allowed because FLASK_DEBUG=true): %s", detail)
    else:
        raise RuntimeError(
            f"Refusing to start: {detail}. Generate one with:\n"
            f'  python -c "import secrets; print(secrets.token_hex(32))"'
        )


_validate_secrets()

app.secret_key = _JWT_SECRET or "dev-only-insecure-key"

# Flask's own signed session — used only to carry the OAuth CSRF state.
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",   # Strict would break the OAuth return trip
    SESSION_COOKIE_SECURE=_IS_HTTPS,
    SESSION_COOKIE_NAME="mukku_session",
    # Hard ceiling on request size, enforced before the body is buffered. The
    # per-file 50 MB check in /generate runs after upload; this stops a
    # multi-gigabyte body from exhausting memory first.
    MAX_CONTENT_LENGTH=int(os.getenv("MAX_CONTENT_MB", "60")) * 1024 * 1024,
    JSON_SORT_KEYS=False,
)

# ── Rate limiter ───────────────────────────────────────────────────────────────
# Constructed in backend/extensions.py so blueprints can decorate their views at
# definition time; init_app binds it to this app. The limits themselves live
# next to the views they protect.
limiter.init_app(app)

_ratelimit_uri = _storage_uri()
if _ratelimit_uri.startswith("memory://"):
    logger.warning(
        "Rate limiting uses in-memory storage — limits are per worker, so the "
        "effective cap is multiplied by the worker count. Set RATELIMIT_STORAGE_URI "
        "to a Redis URL in production."
    )
else:
    logger.info("Rate limiting backed by shared storage: %s",
                _ratelimit_uri.split("@")[-1])

# ── Security headers (OWASP A05: Security Misconfiguration) ────────────────────

# script-src has NO 'unsafe-inline'. The single inline bootstrap script was
# moved to /static/theme-init.js precisely so this could be dropped — with it,
# an injected <script> or event-handler attribute simply will not execute,
# which is the strongest XSS control available here.
#
# style-src still needs 'unsafe-inline': Framer Motion animates via inline
# style attributes. That is a far smaller exposure than inline script.
#
# cdnjs is gone — three.js is bundled now, so no third-party script origin
# is trusted at all.
_CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    # Google profile pictures for OAuth users; data:/blob: for upload previews.
    "img-src 'self' data: blob: https://lh3.googleusercontent.com",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
] + (["upgrade-insecure-requests"] if _IS_HTTPS else []))


@app.after_request
def set_security_headers(response):
    response.headers["Content-Security-Policy"] = _CSP
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"            # legacy, CSP covers it
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # Deny hardware/API access the app never uses, so injected code cannot
    # reach for a camera or geolocation prompt.
    response.headers["Permissions-Policy"] = (
        "accelerometer=(), autoplay=(self), camera=(), display-capture=(), "
        "encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), "
        "magnetometer=(), microphone=(), midi=(), payment=(), usb=(), "
        "interest-cohort=()"
    )
    # Cross-origin isolation: blocks Spectre-style leaks and stops other
    # origins embedding or reading our responses.
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    response.headers["X-Permitted-Cross-Domain-Policies"] = "none"

    if _IS_HTTPS:
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )

    # Suppress the stack banner. NOTE: gunicorn writes its own Server header at
    # the WSGI layer and overrides this, so under gunicorn the response still
    # says "gunicorn" (without a version, so no CVE-matchable build is leaked).
    # Strip it properly at the reverse proxy:
    #   nginx:  more_clear_headers Server;   (headers-more module)
    #           or  server_tokens off;  plus  proxy_hide_header Server;
    response.headers["Server"] = "mukku"

    # Authenticated JSON must never sit in a shared or browser cache.
    if request.path.startswith("/api/") or request.path.startswith("/status/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
        response.headers["Pragma"] = "no-cache"

    return response

# Register blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(admin_bp)

# Auth endpoint limits are declared with @limiter.limit at each view in
# backend/auth.py. They used to be applied here against app.view_functions,
# which registered them under the function qualname instead of the Flask
# endpoint name — so they silently never fired.

# Ensure MongoDB indexes and seed super admin on startup
try:
    _ensure_indexes()
    seed_super_admin()
except Exception as _idx_err:
    logger.warning("Could not initialise DB: %s", _idx_err)

# Any project still marked processing after a restart has no owner — its worker
# died with the previous process. Fail those explicitly so users see a real
# error and can retry, instead of a progress bar that never moves again.
try:
    _stale = reconcile_stale_projects(int(os.getenv("STALE_JOB_MINUTES", "45")))
    if _stale:
        logger.warning("Reconciled %d interrupted project(s) to 'failed' on startup.", _stale)
except Exception as _rec_err:
    logger.warning("Stale-project reconciliation skipped: %s", _rec_err)

logger.info("Job queue backend: %s", job_queue.backend_name())

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


def _spa():
    """Serve the React shell. Client-side routing takes over from there."""
    return send_file(SPA_INDEX)


@app.route("/assets/<path:filename>")
def spa_assets(filename: str):
    """Hashed JS/CSS bundles emitted by Vite. Immutable — cache hard."""
    return send_from_directory(FRONTEND_DIR / "assets", filename, max_age=31536000)


@app.route("/")
def landing():
    return _spa()


@app.route("/studio")
def studio():
    return _spa()


@app.route("/robots.txt")
def robots_txt():
    content = (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /studio\n"
        "Disallow: /dashboard\n"
        "Disallow: /login\n"
        "Disallow: /register\n"
        "Disallow: /admin\n"
        "Disallow: /api/\n"
        "Disallow: /video/\n"
        "Disallow: /status/\n"
        "Disallow: /media/\n"
        "\n"
        "Sitemap: https://mukku.ai/sitemap.xml\n"
    )
    return app.response_class(content, mimetype="text/plain")


@app.route("/sitemap.xml")
def sitemap_xml():
    from datetime import date
    today = date.today().isoformat()
    content = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">

  <url>
    <loc>https://mukku.ai/</loc>
    <lastmod>{today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>


</urlset>"""
    return app.response_class(content, mimetype="application/xml")


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
    # Bounded coercion: a non-numeric duration used to raise ValueError -> 500.
    duration = safe_int(raw_settings.get("duration", 60), 60, 15, MAX_DURATION_SECS)

    settings = {
        "duration":      duration,
        "tone":          raw_settings.get("tone", "educational")     if raw_settings.get("tone")     in VALID_TONES  else "educational",
        "image_style":   raw_settings.get("image_style", "photorealistic") if raw_settings.get("image_style") in VALID_STYLES else "photorealistic",
        "aspect_ratio":  raw_settings.get("aspect_ratio", "16:9")    if raw_settings.get("aspect_ratio") in VALID_RATIOS else "16:9",
        "voice_gender":  raw_settings.get("voice_gender", "auto")    if raw_settings.get("voice_gender") in VALID_VOICES else "auto",
        "include_music": bool(raw_settings.get("include_music", True)),
        # Unbounded before: scene_count=100000 would drive the fallback
        # scene builder into a huge loop. 0 means "let the pipeline decide".
        "scene_count":   safe_int(raw_settings.get("scene_count", 0), 0, 0, 20),
        "platform":      raw_settings.get("platform", "")             if raw_settings.get("platform", "") in VALID_PLATFORMS else "",
        "language":      raw_settings.get("language", "en")            if raw_settings.get("language", "en") in VALID_LANGUAGES else "en",
    }

    # Require authentication
    from backend.auth import get_current_user as _get_user
    current_user = _get_user()
    if not current_user:
        return jsonify({"error": "Please log in to generate videos.", "redirect": "/login"}), 401

    user_id = current_user["user_id"]

    # ── Quota enforcement ────────────────────────────────────────────────────
    _PLAN_LIMITS = {"free": 3, "starter": 5, "pro": 25, "enterprise": -1, "super_admin": -1}
    plan         = current_user.get("plan", "free")
    role         = current_user.get("role", "user")
    limit        = _PLAN_LIMITS.get(role if role in ("super_admin", "enterprise") else plan, 3)
    used         = current_user.get("videos_this_month", 0)

    if limit != -1 and used >= limit:
        return jsonify({
            "error":   "quota_exceeded",
            "message": f"You've used {used}/{limit} videos this month.",
            "plan":    plan,
            "used":    used,
            "limit":   limit,
        }), 402

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

    # Dispatch through the queue layer: Redis/RQ in production so the render
    # survives a web-tier restart, an in-process thread in development.
    job_ref = job_queue.enqueue_pipeline(project_id, prompt, settings, uploaded_paths)

    logger.info("Project %s started (job=%s) — platform=%s  duration=%ds  style=%s  tone=%s  ratio=%s",
                project_id, job_ref, settings["platform"] or "custom", settings["duration"],
                settings["image_style"], settings["tone"], settings["aspect_ratio"])
    return jsonify({"project_id": project_id, "status": "processing"}), 202


def _owned_project(project_id: str):
    """Return (project, user) if caller owns the project, else (None, None)."""
    from backend.auth import get_current_user as _get_user
    project = get_project(project_id)
    if not project:
        return None, None
    current_user = _get_user()
    if not current_user:
        return None, None
    # Admins can access any project
    if current_user.get("is_admin") or current_user.get("role") in ("admin", "super_admin"):
        return project, current_user
    if project.get("user_id") != current_user["user_id"]:
        return None, None
    return project, current_user


@app.route("/status/<project_id>", methods=["GET"])
def status(project_id: str):
    project, _ = _owned_project(project_id)
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
    project, current_user = _owned_project(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404

    if project.get("status") != "completed":
        return jsonify({"error": "Video is not ready yet.", "status": project.get("status")}), 202

    # ── Subscription check — free users can only watch, not download past 3 ──
    plan        = current_user.get("plan", "free") if current_user else "free"
    can_download = plan not in ("free",) or current_user.get("role") in ("admin", "super_admin")

    video_path = project.get("video_path", "")
    if not video_path or not os.path.exists(video_path):
        return jsonify({"error": "Video file not found on disk."}), 404

    download = request.args.get("download", "false").lower() == "true"
    if download and not can_download:
        return jsonify({
            "error":   "subscription_required",
            "message": "Upgrade your plan to download videos.",
        }), 402

    return send_file(
        video_path,
        mimetype="video/mp4",
        as_attachment=download,
        download_name=f"ai_video_{project_id}.mp4",
        conditional=True,
    )


@app.route("/thumbnail/<project_id>", methods=["GET"])
def get_thumbnail(project_id: str):
    """Extract and return a JPEG thumbnail from the first frame of the video.

    OWASP A01 (Broken Access Control): this used to call get_project() directly
    with no ownership check, so anyone holding a project id — they are only
    10 hex chars, and they appear in dashboard markup — could pull a frame from
    another user's video. It now goes through the same ownership gate as
    /status and /video.
    """
    project, _ = _owned_project(project_id)
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
    from backend.auth import get_current_user as _get_user
    current_user = _get_user()
    if not current_user:
        return jsonify({"error": "Authentication required"}), 401

    limit = safe_int(request.args.get("limit"), 20, 1, 50)

    # Admins see all projects; regular users see only their own
    if current_user.get("is_admin") or current_user.get("role") in ("admin", "super_admin"):
        items = list_projects(limit)
    else:
        items = list_projects_for_user(current_user["user_id"], limit)

    result = []
    for item in items:
        for k in ("created_at", "updated_at"):
            if item.get(k):
                item[k] = item[k].isoformat()
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
@limiter.limit(LIMIT_ENQUIRY)
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


# ── SPA fallback ───────────────────────────────────────────────────────────────
# Registered last. A direct hit or hard refresh on a client-side route such as
# /dashboard must return the React shell rather than a 404. Backend prefixes are
# excluded explicitly so this can never swallow a real API path — if an /api URL
# reaches here it genuinely does not exist, and must stay a JSON 404.
_BACKEND_PREFIXES = (
    "api/", "generate", "status/", "video/", "thumbnail/",
    "projects", "enquiry", "health", "static/", "assets/",
    "robots.txt", "sitemap.xml",
)


@app.route("/<path:path>")
def spa_fallback(path: str):
    """Unknown path: serve the shell so the client can render its 404 page,
    but return 404 so the status is honest and matches what /admin returns for
    non-admins. Every real client route is registered above, so a request
    reaching here genuinely does not exist.

    If you add a new client-side route, register it here too (one line calling
    `_spa()`), otherwise deep links to it will carry a 404 status.
    """
    if path.startswith(_BACKEND_PREFIXES):
        return jsonify({"error": "Not found"}), 404
    return send_file(SPA_INDEX), 404


@app.errorhandler(404)
def handle_404(_err):
    """Render the SPA for unknown GETs, but keep the 404 status.

    Preserving the status matters for `/admin`, which deliberately aborts 404
    for non-admins. The body is the same shell every unknown path returns, so
    nothing is leaked, and the client router still renders something useful.
    """
    if request.path.startswith("/api/") or request.method != "GET":
        return jsonify({"error": "Not found"}), 404
    return send_file(SPA_INDEX), 404


if __name__ == "__main__":
    port  = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    logger.info("Starting AI Content Agent on http://0.0.0.0:%d", port)
    # threaded=True ensures each request gets its own thread —
    # prevents pipeline background threads from blocking new API calls.
    app.run(host="0.0.0.0", port=port, debug=debug,
            use_reloader=False, threaded=True)
