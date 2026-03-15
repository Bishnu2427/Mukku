"""Authentication Blueprint — register, login (with 2FA OTP), logout, sessions, RBAC.
Every login attempt, session, and profile change is stored in the database.
Security hardened: rate-limited, brute-force locked, 2FA, strong passwords.
"""

import os
import re
import inspect
import smtplib
import logging
from datetime import datetime, timezone, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from functools import wraps

import bcrypt
import jwt
from flask import Blueprint, request, jsonify, make_response, send_file, abort

from database.user_model import (
    ALL_PERMISSIONS,
    create_user, get_user_by_email, get_user_by_id,
    update_last_login, update_user,
    create_session, get_session, touch_session,
    invalidate_session, invalidate_all_user_sessions, get_user_sessions,
    log_login_attempt, get_user_login_history,
    get_user_plan_history,
    log_profile_change, get_user_profile_log,
    create_reset_token, get_reset_token, consume_reset_token,
    create_otp, verify_otp, consume_otp,
    check_lockout, record_failed_attempt, clear_lockout,
)

logger   = logging.getLogger(__name__)
auth_bp  = Blueprint("auth", __name__)

# RFC 5322-inspired, rejects obvious garbage while not over-engineering
EMAIL_RE = re.compile(
    r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$"
)

# Password complexity: 8+ chars, at least one uppercase, one digit, one special char
PASSWORD_RE = re.compile(
    r"^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*()\-_=+\[\]{};:'\",.<>?/\\|`~]).{8,}$"
)


# ── env helpers ───────────────────────────────────────────────────────────────

def _secret() -> str:
    s = os.getenv("JWT_SECRET", "")
    if not s or s.startswith("mukku-change-me"):
        logger.warning("JWT_SECRET is weak or unset — use a strong random value in production!")
    return s or "change-me-in-production-use-a-long-random-string"


def _app_url() -> str:
    return os.getenv("APP_URL", "http://localhost:7000").rstrip("/")


def _client_ip() -> str:
    # Only trust X-Forwarded-For if explicitly configured (behind a known proxy)
    if os.getenv("TRUST_PROXY", "false").lower() == "true":
        fwd = request.headers.get("X-Forwarded-For", "")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.remote_addr or ""


def _user_agent() -> str:
    return request.headers.get("User-Agent", "")[:512]  # cap length


# ── JWT helpers ───────────────────────────────────────────────────────────────

def _make_token(user_id: str, session_id: str, expires_hours: int = 24) -> str:
    payload = {
        "sub": user_id,
        "sid": session_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=expires_hours),
    }
    return jwt.encode(payload, _secret(), algorithm="HS256")


def _decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, _secret(), algorithms=["HS256"])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def _set_auth_cookie(response, token: str, remember: bool = False) -> None:
    max_age = 60 * 60 * 24 * (7 if remember else 1)   # max 7 days (not 30)
    is_https = os.getenv("APP_URL", "").startswith("https://")
    response.set_cookie(
        "mukku_token", token,
        max_age   = max_age,
        httponly  = True,
        samesite  = "Strict",          # was Lax — CSRF hardening
        secure    = is_https,          # True in production HTTPS
        path      = "/",
    )


def _clear_auth_cookie(response) -> None:
    response.delete_cookie("mukku_token", path="/")


# ── RBAC helpers ──────────────────────────────────────────────────────────────

def _is_admin_role(user: dict) -> bool:
    return user.get("role") in ("admin", "super_admin")


def _is_super_admin(user: dict) -> bool:
    return user.get("role") == "super_admin"


def _has_permission(user: dict, perm: str) -> bool:
    if _is_super_admin(user):
        return True
    return perm in (user.get("permissions") or [])


# ── auth decorators ───────────────────────────────────────────────────────────

def require_auth(f):
    """Requires valid JWT cookie AND active DB session. Injects current_user + session_id."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.cookies.get("mukku_token")
        if not token:
            return _auth_fail("Authentication required", 401)

        payload = _decode_token(token)
        if not payload:
            return _auth_fail("Session expired", 401)

        session_id = payload.get("sid", "")
        if session_id and not get_session(session_id):
            return _auth_fail("Session revoked or expired", 401)

        user = get_user_by_id(payload["sub"])
        if not user or not user.get("is_active"):
            return _auth_fail("Account not found or disabled", 401)

        all_kwargs = dict(kwargs)
        all_kwargs["current_user"] = user
        all_kwargs["session_id"]   = session_id
        all_kwargs["_session_id"]  = session_id

        sig = inspect.signature(f)
        params = sig.parameters
        has_var_kw = any(p.kind == inspect.Parameter.VAR_KEYWORD for p in params.values())
        filtered = all_kwargs if has_var_kw else {k: v for k, v in all_kwargs.items() if k in params}
        return f(*args, **filtered)
    return decorated


def require_admin(f):
    """Requires auth + admin/super_admin. Returns 404 (not 403) for non-admins."""
    @wraps(f)
    @require_auth
    def decorated(*args, **kwargs):
        user = kwargs.get("current_user")
        if not user or not _is_admin_role(user):
            if request.path.startswith("/api/"):
                return jsonify({"error": "Not found"}), 404
            abort(404)
        sig = inspect.signature(f)
        filtered = {k: v for k, v in kwargs.items() if k in sig.parameters}
        return f(*args, **filtered)
    return decorated


def require_super_admin(f):
    """Requires auth + super_admin role specifically."""
    @wraps(f)
    @require_auth
    def decorated(*args, **kwargs):
        user = kwargs.get("current_user")
        if not user or not _is_super_admin(user):
            if request.path.startswith("/api/"):
                return jsonify({"error": "Not found"}), 404
            abort(404)
        sig = inspect.signature(f)
        filtered = {k: v for k, v in kwargs.items() if k in sig.parameters}
        return f(*args, **filtered)
    return decorated


def require_permission(perm: str):
    """Decorator factory: requires auth + admin role + specific permission."""
    def decorator(f):
        @wraps(f)
        @require_auth
        def decorated(*args, **kwargs):
            user = kwargs.get("current_user")
            if not user or not _is_admin_role(user):
                return jsonify({"error": "Not found"}), 404
            if not _has_permission(user, perm):
                return jsonify({"error": "You don't have permission to do that."}), 403
            sig = inspect.signature(f)
            filtered = {k: v for k, v in kwargs.items() if k in sig.parameters}
            return f(*args, **filtered)
        return decorated
    return decorator


def _auth_fail(msg: str, code: int):
    if request.path.startswith("/api/"):
        return jsonify({"error": msg}), code
    from flask import redirect
    return redirect("/login")


def get_current_user() -> dict | None:
    token = request.cookies.get("mukku_token")
    if not token:
        return None
    payload = _decode_token(token)
    if not payload:
        return None
    sid = payload.get("sid", "")
    if sid and not get_session(sid):
        return None
    return get_user_by_id(payload["sub"])


def get_current_session_id() -> str:
    token = request.cookies.get("mukku_token")
    if not token:
        return ""
    payload = _decode_token(token)
    return payload.get("sid", "") if payload else ""


# ── password validation ───────────────────────────────────────────────────────

def _validate_password(password: str) -> str | None:
    """Return error string if password is invalid, None if OK."""
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if not re.search(r"[A-Z]", password):
        return "Password must contain at least one uppercase letter."
    if not re.search(r"[0-9]", password):
        return "Password must contain at least one number."
    if not re.search(r"[!@#$%^&*()\-_=+\[\]{};:'\",.<>?/\\|`~]", password):
        return "Password must contain at least one special character."
    return None


# ── SMTP ──────────────────────────────────────────────────────────────────────

def _send_email(to_addr: str, subject: str, html_body: str, text_body: str) -> bool:
    smtp_server   = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port     = int(os.getenv("SMTP_PORT", 587))
    smtp_user     = os.getenv("SMTP_USERNAME", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")

    if not smtp_user or not smtp_password:
        logger.warning("SMTP not configured — email to %s skipped.", to_addr)
        return False

    msg = MIMEMultipart("alternative")
    msg["From"]    = f"Mukku AI Studio <{smtp_user}>"
    msg["To"]      = to_addr
    msg["Subject"] = subject
    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))
    try:
        with smtplib.SMTP(smtp_server, smtp_port, timeout=15) as srv:
            srv.starttls()
            srv.login(smtp_user, smtp_password)
            srv.sendmail(smtp_user, to_addr, msg.as_string())
        return True
    except Exception as exc:
        logger.error("Email send failed: %s", exc)
        return False


def _otp_email(to_addr: str, name: str, code: str) -> bool:
    subject   = "Your Mukku AI Studio login code"
    text_body = (
        f"Hi {name},\n\nYour login verification code is: {code}\n\n"
        f"This code expires in 10 minutes. Do not share it with anyone.\n\n"
        f"If you didn't attempt to log in, change your password immediately.\n\n"
        f"— Mukku AI Studio"
    )
    html_body = f"""<!DOCTYPE html><html><body style="margin:0;padding:0;background:#050912;font-family:Inter,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#0c1424;border:1px solid rgba(0,212,255,0.09);border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#8b30ff,#00d4ff);padding:3px 0 0;"></div>
    <div style="padding:40px 36px;">
      <h1 style="color:#d8eeff;font-size:1.4rem;font-weight:700;margin:0 0 8px;">Login Verification Code</h1>
      <p style="color:rgba(216,238,255,0.6);font-size:0.9rem;line-height:1.7;margin:0 0 24px;">
        Hi {name}, enter this code to complete your sign-in. It expires in <strong style="color:#00d4ff;">10 minutes</strong>.
      </p>
      <div style="background:rgba(0,0,0,0.4);border:1px solid rgba(139,48,255,0.3);border-radius:12px;padding:24px;text-align:center;letter-spacing:0.3em;font-size:2rem;font-weight:700;color:#00d4ff;font-family:monospace;">
        {code}
      </div>
      <p style="color:rgba(216,238,255,0.35);font-size:0.75rem;margin:24px 0 0;line-height:1.6;">
        Do not share this code with anyone. Mukku AI Studio staff will never ask for it.<br>
        If you didn't attempt to log in, <strong>change your password immediately</strong>.
      </p>
    </div>
  </div>
</body></html>"""
    return _send_email(to_addr, subject, html_body, text_body)


def _password_reset_email(to_addr: str, name: str, reset_link: str) -> bool:
    subject   = "Reset your Mukku AI Studio password"
    text_body = (
        f"Hi {name},\n\nReset your password (valid 1 hour):\n\n{reset_link}\n\n"
        f"If you didn't request this, ignore this email.\n\n— Mukku AI Studio"
    )
    html_body = f"""<!DOCTYPE html><html><body style="margin:0;padding:0;background:#050912;font-family:Inter,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#0c1424;border:1px solid rgba(0,212,255,0.09);border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#8b30ff,#00d4ff);padding:3px 0 0;"></div>
    <div style="padding:40px 36px;">
      <h1 style="color:#d8eeff;font-size:1.4rem;font-weight:700;margin:0 0 8px;">Reset your password</h1>
      <p style="color:rgba(216,238,255,0.6);font-size:0.9rem;line-height:1.7;margin:0 0 28px;">
        Hi {name}, this link expires in <strong style="color:#00d4ff;">1 hour</strong>.
      </p>
      <a href="{reset_link}" style="display:inline-block;background:linear-gradient(135deg,#8b30ff,#00d4ff);color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:0.95rem;">Reset Password →</a>
      <p style="color:rgba(216,238,255,0.35);font-size:0.75rem;margin:28px 0 0;line-height:1.6;">
        If you didn't request this, ignore this email.
      </p>
    </div>
  </div>
</body></html>"""
    return _send_email(to_addr, subject, html_body, text_body)


def _admin_invite_email(to_addr: str, name: str, temp_password: str, login_url: str) -> bool:
    subject   = "You've been added as an admin — Mukku AI Studio"
    text_body = (
        f"Hi {name},\nAdmin access granted.\n\nLogin: {login_url}\n"
        f"Email: {to_addr}\nTemp password: {temp_password}\n\n"
        f"Change your password after first login.\n— Mukku AI Studio"
    )
    html_body = f"""<!DOCTYPE html><html><body style="margin:0;padding:0;background:#050912;font-family:Inter,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#0c1424;border:1px solid rgba(0,212,255,0.09);border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#8b30ff,#00d4ff);padding:3px 0 0;"></div>
    <div style="padding:40px 36px;">
      <h1 style="color:#d8eeff;font-size:1.4rem;font-weight:700;margin:0 0 8px;">Admin Access Granted</h1>
      <div style="background:rgba(0,0,0,0.3);border:1px solid rgba(0,212,255,0.15);border-radius:10px;padding:16px 20px;margin-bottom:24px;font-family:monospace;font-size:0.85rem;color:#d8eeff;">
        <div>Email: <span style="color:#00d4ff;">{to_addr}</span></div>
        <div style="margin-top:6px;">Temp password: <span style="color:#00d4ff;">{temp_password}</span></div>
      </div>
      <a href="{login_url}" style="display:inline-block;background:linear-gradient(135deg,#8b30ff,#00d4ff);color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;">Sign In →</a>
      <p style="color:rgba(216,238,255,0.35);font-size:0.75rem;margin:24px 0 0;">Change your password immediately after signing in.</p>
    </div>
  </div>
</body></html>"""
    return _send_email(to_addr, subject, html_body, text_body)


# ── page routes ───────────────────────────────────────────────────────────────

def _fe(filename: str):
    from pathlib import Path
    fe_dir = Path(__file__).resolve().parent.parent / "frontend"
    return send_file(fe_dir / filename)


@auth_bp.route("/login")
def login_page():
    user = get_current_user()
    if user:
        return _fe("dashboard.html")
    return _fe("login.html")


@auth_bp.route("/register")
def register_page():
    user = get_current_user()
    if user:
        return _fe("dashboard.html")
    return _fe("register.html")


@auth_bp.route("/forgot-password")
def forgot_password_page():
    return _fe("forgot-password.html")


@auth_bp.route("/reset-password")
def reset_password_page():
    token = request.args.get("token", "")
    if not token or not get_reset_token(token):
        return _fe("forgot-password.html")
    return _fe("reset-password.html")


@auth_bp.route("/dashboard")
@require_auth
def dashboard_page(current_user, _session_id):
    return _fe("dashboard.html")


@auth_bp.route("/admin")
def admin_page():
    """Admin portal — returns 404 for anyone without an admin role."""
    user = get_current_user()
    if not user or not _is_admin_role(user):
        abort(404)
    return _fe("admin.html")


# ── API: register ─────────────────────────────────────────────────────────────

@auth_bp.route("/api/auth/register", methods=["POST"])
def api_register():
    data     = request.get_json(silent=True) or {}
    name     = data.get("name", "").strip()
    email    = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not name or len(name) < 2 or len(name) > 100:
        return jsonify({"error": "Name must be 2–100 characters."}), 400
    if not email or not EMAIL_RE.match(email):
        return jsonify({"error": "Please enter a valid email address."}), 400

    pw_err = _validate_password(password)
    if pw_err:
        return jsonify({"error": pw_err}), 400

    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    user_id = create_user(name, email, pw_hash)
    if user_id is None:
        log_login_attempt(email, False, _client_ip(), _user_agent(),
                          "email already registered", action="register")
        return jsonify({"error": "An account with this email already exists."}), 409

    sid        = _make_session_id()
    expires_at = _session_expires(remember=False)
    create_session(user_id, sid, _client_ip(), _user_agent(), expires_at, remember=False)
    update_last_login(user_id)
    log_login_attempt(email, True, _client_ip(), _user_agent(), user_id=user_id, action="register")
    logger.info("New user registered: %s (%s)", name, email)

    token = _make_token(user_id, sid, expires_hours=24)
    resp  = make_response(jsonify({"status": "ok", "redirect": "/dashboard"}))
    _set_auth_cookie(resp, token)
    return resp, 201


# ── API: login (step 1 — credentials) ────────────────────────────────────────

@auth_bp.route("/api/auth/login", methods=["POST"])
def api_login():
    data     = request.get_json(silent=True) or {}
    email    = data.get("email", "").strip().lower()
    password = data.get("password", "")
    remember = bool(data.get("remember", False))

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400

    # ── brute-force lockout check ──────────────────────────────────────────────
    lockout = check_lockout(email)
    if lockout:
        locked_until = lockout.get("locked_until")
        if locked_until:
            wait_mins = max(1, int((locked_until - datetime.now(timezone.utc)).total_seconds() / 60))
            return jsonify({
                "error": f"Too many failed attempts. Account locked for {wait_mins} more minute(s)."
            }), 429

    user = get_user_by_email(email)
    if not user:
        log_login_attempt(email, False, _client_ip(), _user_agent(), "email not found")
        record_failed_attempt(email)
        # Generic message — prevents email enumeration
        return jsonify({"error": "Invalid email or password."}), 401

    if not user.get("is_active"):
        log_login_attempt(email, False, _client_ip(), _user_agent(),
                          "account disabled", user_id=user["user_id"])
        return jsonify({"error": "Your account has been disabled. Contact support."}), 403

    if not bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
        log_login_attempt(email, False, _client_ip(), _user_agent(),
                          "wrong password", user_id=user["user_id"])
        remaining = record_failed_attempt(email)
        if remaining == 0:
            return jsonify({"error": "Too many failed attempts. Account locked for 15 minutes."}), 429
        msg = f"Invalid email or password. {remaining} attempt(s) remaining."
        return jsonify({"error": msg}), 401

    # ── credentials valid — issue OTP ─────────────────────────────────────────
    clear_lockout(email)
    otp_token, plain_code = create_otp(user["user_id"])
    sent = _otp_email(user.get("email", email), user.get("name", ""), plain_code)
    if not sent:
        # SMTP not configured — fall back to passwordless direct login (dev mode only)
        if os.getenv("FLASK_DEBUG", "false").lower() == "true":
            logger.warning("SMTP not configured — skipping 2FA in debug mode. Code: %s", plain_code)
            return _complete_login(user, remember)
        return jsonify({"error": "Could not send verification code. Try again later."}), 503

    logger.info("OTP issued for %s", email)
    return jsonify({
        "status":    "otp_required",
        "otp_token": otp_token,
        "message":   "A 6-digit verification code has been sent to your email.",
    })


# ── API: login (step 2 — verify OTP) ─────────────────────────────────────────

@auth_bp.route("/api/auth/verify-otp", methods=["POST"])
def api_verify_otp():
    data      = request.get_json(silent=True) or {}
    otp_token = data.get("otp_token", "").strip()
    code      = data.get("code", "").strip()
    remember  = bool(data.get("remember", False))

    if not otp_token or not code:
        return jsonify({"error": "Verification code is required."}), 400

    doc = verify_otp(otp_token, code)
    if not doc:
        return jsonify({"error": "Invalid or expired verification code."}), 401

    consume_otp(otp_token)
    user = get_user_by_id(doc["user_id"])
    if not user or not user.get("is_active"):
        return jsonify({"error": "Account not found or disabled."}), 401

    return _complete_login(user, remember)


def _complete_login(user: dict, remember: bool):
    """Shared final step: create DB session, set cookie, redirect."""
    expires_hours = 168 if remember else (12 if _is_admin_role(user) else 24)
    expires_at    = _session_expires(remember, is_admin=_is_admin_role(user))
    sid           = _make_session_id()

    create_session(user["user_id"], sid, _client_ip(), _user_agent(), expires_at, remember)
    update_last_login(user["user_id"])
    log_login_attempt(user.get("email", ""), True, _client_ip(), _user_agent(),
                      user_id=user["user_id"])

    redirect_url = "/admin" if _is_admin_role(user) else "/dashboard"
    token = _make_token(user["user_id"], sid, expires_hours=expires_hours)
    resp  = make_response(jsonify({"status": "ok", "redirect": redirect_url}))
    _set_auth_cookie(resp, token, remember=remember)
    return resp


# ── API: logout ───────────────────────────────────────────────────────────────

@auth_bp.route("/api/auth/logout", methods=["POST"])
def api_logout():
    token = request.cookies.get("mukku_token")
    if token:
        payload = _decode_token(token)
        if payload:
            sid = payload.get("sid", "")
            if sid:
                invalidate_session(sid)
            user = get_user_by_id(payload.get("sub", ""))
            if user:
                log_login_attempt(
                    user.get("email", ""), True, _client_ip(), _user_agent(),
                    user_id=user["user_id"], action="logout",
                )
    resp = make_response(jsonify({"status": "ok", "redirect": "/login"}))
    _clear_auth_cookie(resp)
    return resp


# ── API: me ───────────────────────────────────────────────────────────────────

@auth_bp.route("/api/auth/me", methods=["GET"])
@require_auth
def api_me(current_user, session_id):
    safe = {k: v for k, v in current_user.items()
            if k not in ("password_hash", "_id")}
    for k in ("created_at", "last_login", "month_reset_at"):
        if safe.get(k) and isinstance(safe[k], datetime):
            safe[k] = safe[k].isoformat()
    safe["is_super_admin"]     = _is_super_admin(current_user)
    safe["all_permissions"]    = ALL_PERMISSIONS
    safe["current_session_id"] = session_id
    if session_id:
        touch_session(session_id)
    return jsonify(safe)


# ── API: forgot / reset password ──────────────────────────────────────────────

@auth_bp.route("/api/auth/forgot-password", methods=["POST"])
def api_forgot_password():
    data  = request.get_json(silent=True) or {}
    email = data.get("email", "").strip().lower()

    if not email or not EMAIL_RE.match(email):
        return jsonify({"error": "Please enter a valid email address."}), 400

    user = get_user_by_email(email)
    if user and user.get("is_active"):
        token      = create_reset_token(user["user_id"])
        reset_link = f"{_app_url()}/reset-password?token={token}"
        _password_reset_email(email, user.get("name", ""), reset_link)
        log_login_attempt(email, True, _client_ip(), _user_agent(),
                          user_id=user["user_id"], action="password_reset_request")

    # Always return OK — prevents email enumeration
    return jsonify({"status": "ok",
                    "message": "If that email exists, a reset link has been sent."})


@auth_bp.route("/api/auth/reset-password", methods=["POST"])
def api_reset_password():
    data     = request.get_json(silent=True) or {}
    token    = data.get("token", "").strip()
    password = data.get("password", "")

    if not token:
        return jsonify({"error": "Reset token is missing."}), 400

    pw_err = _validate_password(password)
    if pw_err:
        return jsonify({"error": pw_err}), 400

    token_doc = get_reset_token(token)
    if not token_doc:
        return jsonify({"error": "This link is invalid or has expired."}), 400

    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    update_user(token_doc["user_id"], {"password_hash": pw_hash})
    consume_reset_token(token)
    invalidate_all_user_sessions(token_doc["user_id"])

    user = get_user_by_id(token_doc["user_id"])
    if user:
        log_login_attempt(user.get("email", ""), True, _client_ip(), _user_agent(),
                          user_id=user["user_id"], action="password_reset")
        log_profile_change(user["user_id"], "password", "***", "***", _client_ip())

    logger.info("Password reset for user_id=%s", token_doc["user_id"])
    return jsonify({"status": "ok", "redirect": "/login"})


@auth_bp.route("/api/auth/verify-reset-token", methods=["GET"])
def api_verify_reset_token():
    token = request.args.get("token", "").strip()
    if not token:
        return jsonify({"valid": False}), 400
    return jsonify({"valid": bool(get_reset_token(token))})


# ── API: user self-service ────────────────────────────────────────────────────

@auth_bp.route("/api/user/profile", methods=["PUT"])
@require_auth
def api_update_profile(current_user, _session_id):
    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    if not name or len(name) < 2 or len(name) > 100:
        return jsonify({"error": "Name must be 2–100 characters."}), 400
    old_name = current_user.get("name", "")
    update_user(current_user["user_id"], {"name": name})
    if old_name != name:
        log_profile_change(current_user["user_id"], "name", old_name, name, _client_ip())
    return jsonify({"status": "ok"})


@auth_bp.route("/api/user/change-password", methods=["POST"])
@require_auth
def api_change_password(current_user, session_id):
    data         = request.get_json(silent=True) or {}
    old_password = data.get("old_password", "")
    new_password = data.get("new_password", "")

    if not bcrypt.checkpw(old_password.encode(), current_user["password_hash"].encode()):
        return jsonify({"error": "Current password is incorrect."}), 400

    pw_err = _validate_password(new_password)
    if pw_err:
        return jsonify({"error": pw_err}), 400

    pw_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    update_user(current_user["user_id"], {"password_hash": pw_hash})
    invalidate_all_user_sessions(current_user["user_id"], except_session=session_id)
    log_profile_change(current_user["user_id"], "password", "***", "***", _client_ip())
    return jsonify({"status": "ok"})


# ── API: user sessions ────────────────────────────────────────────────────────

@auth_bp.route("/api/user/sessions", methods=["GET"])
@require_auth
def api_user_sessions(current_user, session_id):
    sessions = get_user_sessions(current_user["user_id"])
    for s in sessions:
        s["is_current"] = (s.get("session_id") == session_id)
    return jsonify({"sessions": sessions, "current_session_id": session_id})


@auth_bp.route("/api/user/sessions/<sid>", methods=["DELETE"])
@require_auth
def api_revoke_session(current_user, _session_id, sid):
    from database.user_model import _sessions
    existing = _sessions().find_one({"session_id": sid, "user_id": current_user["user_id"]})
    if not existing:
        return jsonify({"error": "Session not found."}), 404
    invalidate_session(sid)
    return jsonify({"status": "ok"})


@auth_bp.route("/api/user/sessions/logout-all", methods=["POST"])
@require_auth
def api_logout_all_sessions(current_user, session_id):
    count = invalidate_all_user_sessions(current_user["user_id"], except_session=session_id)
    log_profile_change(current_user["user_id"], "sessions_revoked",
                       str(count), "0", _client_ip())
    return jsonify({"status": "ok", "revoked": count})


# ── API: user history & logs ──────────────────────────────────────────────────

@auth_bp.route("/api/user/login-history", methods=["GET"])
@require_auth
def api_user_login_history(current_user, _session_id):
    page  = max(1, int(request.args.get("page", 1)))
    limit = min(50, int(request.args.get("limit", 20)))
    logs, total = get_user_login_history(current_user["user_id"], page, limit)
    return jsonify({"logs": logs, "total": total, "page": page})


@auth_bp.route("/api/user/profile-log", methods=["GET"])
@require_auth
def api_user_profile_log(current_user, _session_id):
    return jsonify({"log": get_user_profile_log(current_user["user_id"])})


@auth_bp.route("/api/user/plan-history", methods=["GET"])
@require_auth
def api_user_plan_history(current_user, _session_id):
    return jsonify({"history": get_user_plan_history(current_user["user_id"])})


# ── private helpers ───────────────────────────────────────────────────────────

def _make_session_id() -> str:
    import uuid
    return uuid.uuid4().hex


def _session_expires(remember: bool = False, is_admin: bool = False) -> datetime:
    if remember:
        hours = 168   # 7 days max (was 720)
    elif is_admin:
        hours = 12
    else:
        hours = 24
    return datetime.now(timezone.utc) + timedelta(hours=hours)
