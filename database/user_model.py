"""
User model — MongoDB CRUD, RBAC, sessions, login history,
plan history, profile change log, audit log, password-reset tokens.
Every user action is stored in the database.
"""

import os
import re
import uuid
import random
import secrets
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
import sys

import bcrypt

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from database.mongo_connection import _get_db

logger = logging.getLogger(__name__)

# ── RBAC permission constants ──────────────────────────────────────────────────

ALL_PERMISSIONS: list[str] = [
    "view_dashboard",    # See stats overview
    "view_users",        # See user list
    "edit_users",        # Edit user fields (name, plan, is_active)
    "delete_users",      # Delete regular users
    "manage_admins",     # Create / edit / remove admin accounts & permissions
    "view_projects",     # See all projects
    "delete_projects",   # Delete projects
    "view_health",       # See system health
    "view_audit_log",    # See admin activity log + login history
    "view_sessions",     # See active sessions, force-logout users
]

ROLES = ("user", "admin", "super_admin")


# ── collection accessors ──────────────────────────────────────────────────────

def _users():          return _get_db()["users"]
def _sessions():       return _get_db()["user_sessions"]
def _login_history():  return _get_db()["login_history"]
def _reset_tokens():   return _get_db()["password_reset_tokens"]
def _audit_log():      return _get_db()["admin_audit_log"]
def _plan_history():   return _get_db()["plan_history"]
def _profile_log():    return _get_db()["profile_change_log"]
def _otp_tokens():     return _get_db()["otp_tokens"]
def _lockouts():       return _get_db()["login_lockouts"]

# Brute-force lockout config
_MAX_FAILED_ATTEMPTS = 5
_LOCKOUT_MINUTES     = 15


def _ensure_indexes():
    """Call once at startup to create all necessary indexes."""
    _users().create_index("email",   unique=True)
    _users().create_index("user_id", unique=True)
    _users().create_index("role")

    _sessions().create_index("session_id", unique=True)
    _sessions().create_index("user_id")
    _sessions().create_index("expires_at", expireAfterSeconds=0)   # TTL auto-cleanup

    _login_history().create_index("user_id")
    _login_history().create_index("email")
    _login_history().create_index("created_at")

    _reset_tokens().create_index("token",      unique=True)
    _reset_tokens().create_index("expires_at", expireAfterSeconds=0)

    _audit_log().create_index("created_at")
    _audit_log().create_index("admin_id")

    _plan_history().create_index("user_id")
    _plan_history().create_index("created_at")

    _profile_log().create_index("user_id")
    _profile_log().create_index("created_at")

    # OTP tokens (2FA) — TTL auto-cleanup after expiry
    _otp_tokens().create_index("otp_token", unique=True)
    _otp_tokens().create_index("user_id")
    _otp_tokens().create_index("expires_at", expireAfterSeconds=0)

    # Login lockouts — TTL auto-cleanup when lock expires
    _lockouts().create_index([("email", 1)], unique=True)
    _lockouts().create_index("locked_until", expireAfterSeconds=0)


# ── device / browser detection (no extra libs) ────────────────────────────────

def _parse_device(ua: str) -> str:
    if not ua:
        return "Unknown"
    u = ua.lower()
    if any(k in u for k in ("mobile", "android", "iphone", "blackberry", "windows phone")):
        return "Mobile"
    if any(k in u for k in ("ipad", "tablet", "kindle")):
        return "Tablet"
    return "Desktop"


def _parse_browser(ua: str) -> str:
    if not ua:
        return "Unknown"
    u = ua.lower()
    if "edg/" in u or "edge/" in u:  return "Edge"
    if "opr/" in u or "opera" in u:  return "Opera"
    if "brave" in u:                  return "Brave"
    if "chrome/" in u:                return "Chrome"
    if "firefox/" in u:               return "Firefox"
    if "safari/" in u:                return "Safari"
    return "Other"


def _parse_os(ua: str) -> str:
    if not ua:
        return "Unknown"
    u = ua.lower()
    if "windows nt" in u:  return "Windows"
    if "mac os x" in u:    return "macOS"
    if "linux" in u:       return "Linux"
    if "android" in u:     return "Android"
    if "iphone" in u or "ipad" in u: return "iOS"
    return "Other"


# ── super-admin seeding ───────────────────────────────────────────────────────

def seed_super_admin() -> None:
    """Ensure super-admin from .env exists. Safe to call on every startup."""
    email    = os.getenv("SUPER_ADMIN_EMAIL", "").strip().lower()
    password = os.getenv("SUPER_ADMIN_PASSWORD", "").strip()

    if not email or not password:
        logger.warning("SUPER_ADMIN_EMAIL/PASSWORD not set — skipping seed.")
        return

    existing = _users().find_one({"email": email})
    if existing:
        if existing.get("role") != "super_admin":
            _users().update_one(
                {"email": email},
                {"$set": {
                    "role":        "super_admin",
                    "is_admin":    True,
                    "permissions": ALL_PERMISSIONS,
                    "is_active":   True,
                }},
            )
            logger.info("Upgraded %s to super_admin.", email)
        return

    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    user_id = uuid.uuid4().hex[:12]
    _users().insert_one({
        "user_id":                user_id,
        "name":                   "Super Admin",
        "email":                  email,
        "password_hash":          pw_hash,
        "role":                   "super_admin",
        "permissions":            ALL_PERMISSIONS,
        "plan":                   "pro",
        "is_admin":               True,
        "is_active":              True,
        "created_at":             datetime.now(timezone.utc),
        "last_login":             None,
        "total_videos_generated": 0,
        "videos_this_month":      0,
        "month_reset_at":         datetime.now(timezone.utc),
        "avatar":                 None,
    })
    logger.info("Super admin seeded: %s", email)


# ── user CRUD ─────────────────────────────────────────────────────────────────

def create_user(name: str, email: str, password_hash: str) -> str | None:
    """Insert a new user. Returns user_id, or None if email already exists."""
    email = email.lower().strip()
    if _users().find_one({"email": email}):
        return None
    user_id = uuid.uuid4().hex[:12]
    _users().insert_one({
        "user_id":                user_id,
        "name":                   name.strip(),
        "email":                  email,
        "password_hash":          password_hash,
        "role":                   "user",
        "permissions":            [],
        "plan":                   "free",
        "is_admin":               False,
        "is_active":              True,
        "created_at":             datetime.now(timezone.utc),
        "last_login":             None,
        "total_videos_generated": 0,
        "videos_this_month":      0,
        "month_reset_at":         datetime.now(timezone.utc),
        "avatar":                 None,
    })
    return user_id


def get_user_by_email(email: str) -> dict | None:
    return _users().find_one({"email": email.lower().strip()})


def get_user_by_id(user_id: str) -> dict | None:
    return _users().find_one({"user_id": user_id})


def update_last_login(user_id: str) -> None:
    _users().update_one(
        {"user_id": user_id},
        {"$set": {"last_login": datetime.now(timezone.utc)}},
    )


def update_user(user_id: str, updates: dict) -> None:
    _users().update_one({"user_id": user_id}, {"$set": updates})


def increment_video_count(user_id: str) -> None:
    user = get_user_by_id(user_id)
    if not user:
        return
    now      = datetime.now(timezone.utc)
    reset_at = user.get("month_reset_at", now)
    if isinstance(reset_at, datetime) and reset_at.tzinfo is None:
        reset_at = reset_at.replace(tzinfo=timezone.utc)

    if reset_at.month != now.month or reset_at.year != now.year:
        _users().update_one(
            {"user_id": user_id},
            {"$set": {"videos_this_month": 1, "month_reset_at": now},
             "$inc": {"total_videos_generated": 1}},
        )
    else:
        _users().update_one(
            {"user_id": user_id},
            {"$inc": {"total_videos_generated": 1, "videos_this_month": 1}},
        )


def delete_user(user_id: str) -> None:
    """Delete user and all associated session data."""
    _users().delete_one({"user_id": user_id})
    _sessions().delete_many({"user_id": user_id})


# ── session management ────────────────────────────────────────────────────────

def create_session(
    user_id: str,
    session_id: str,
    ip: str,
    user_agent: str,
    expires_at: datetime,
    remember: bool = False,
) -> None:
    _sessions().insert_one({
        "session_id":  session_id,
        "user_id":     user_id,
        "ip":          ip,
        "user_agent":  user_agent,
        "device":      _parse_device(user_agent),
        "browser":     _parse_browser(user_agent),
        "os":          _parse_os(user_agent),
        "remember":    remember,
        "created_at":  datetime.now(timezone.utc),
        "expires_at":  expires_at,
        "last_active": datetime.now(timezone.utc),
        "is_active":   True,
    })


def get_session(session_id: str) -> dict | None:
    return _sessions().find_one({
        "session_id": session_id,
        "is_active":  True,
        "expires_at": {"$gt": datetime.now(timezone.utc)},
    })


def touch_session(session_id: str) -> None:
    """Update last_active timestamp for a session."""
    _sessions().update_one(
        {"session_id": session_id},
        {"$set": {"last_active": datetime.now(timezone.utc)}},
    )


def invalidate_session(session_id: str) -> None:
    _sessions().update_one({"session_id": session_id}, {"$set": {"is_active": False}})


def invalidate_all_user_sessions(user_id: str, except_session: str = "") -> int:
    """Invalidate all sessions for a user (optionally except one). Returns count."""
    query = {"user_id": user_id, "is_active": True}
    if except_session:
        query["session_id"] = {"$ne": except_session}
    result = _sessions().update_many(query, {"$set": {"is_active": False}})
    return result.modified_count


def get_user_sessions(user_id: str) -> list:
    """Return all active, non-expired sessions for a user."""
    cursor = _sessions().find(
        {"user_id": user_id, "is_active": True, "expires_at": {"$gt": datetime.now(timezone.utc)}},
        {"_id": 0, "user_agent": 0},
    ).sort("last_active", -1)
    sessions = []
    for s in cursor:
        for k in ("created_at", "expires_at", "last_active"):
            if s.get(k) and isinstance(s[k], datetime):
                s[k] = s[k].isoformat()
        sessions.append(s)
    return sessions


def get_all_sessions(page: int = 1, limit: int = 50) -> tuple[list, int]:
    """Admin: all active sessions across all users."""
    skip = (page - 1) * limit
    query = {"is_active": True, "expires_at": {"$gt": datetime.now(timezone.utc)}}
    cursor = (
        _sessions()
        .find(query, {"_id": 0, "user_agent": 0})
        .sort("last_active", -1)
        .skip(skip)
        .limit(limit)
    )
    total = _sessions().count_documents(query)
    sessions = []
    for s in cursor:
        for k in ("created_at", "expires_at", "last_active"):
            if s.get(k) and isinstance(s[k], datetime):
                s[k] = s[k].isoformat()
        sessions.append(s)
    return sessions, total


# ── login history ─────────────────────────────────────────────────────────────

def log_login_attempt(
    email: str,
    success: bool,
    ip: str,
    user_agent: str,
    failure_reason: str = "",
    user_id: str = "",
    action: str = "login",     # login | register | logout | password_reset
) -> None:
    _login_history().insert_one({
        "user_id":       user_id,
        "email":         email.lower().strip() if email else "",
        "action":        action,
        "success":       success,
        "ip":            ip,
        "user_agent":    user_agent,
        "device":        _parse_device(user_agent),
        "browser":       _parse_browser(user_agent),
        "os":            _parse_os(user_agent),
        "failure_reason": failure_reason,
        "created_at":   datetime.now(timezone.utc),
    })


def get_user_login_history(user_id: str, page: int = 1, limit: int = 20) -> tuple[list, int]:
    skip  = (page - 1) * limit
    query = {"user_id": user_id}
    cursor = (
        _login_history()
        .find(query, {"_id": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    total = _login_history().count_documents(query)
    logs  = []
    for l in cursor:
        if l.get("created_at") and isinstance(l["created_at"], datetime):
            l["created_at"] = l["created_at"].isoformat()
        logs.append(l)
    return logs, total


def get_all_login_history(
    page: int = 1, limit: int = 50, search: str = ""
) -> tuple[list, int]:
    query: dict = {}
    if search:
        safe = re.escape(search[:100])   # escape regex metacharacters, cap length
        query["$or"] = [
            {"email": {"$regex": safe, "$options": "i"}},
            {"ip":    {"$regex": safe, "$options": "i"}},
        ]
    skip   = (page - 1) * limit
    cursor = (
        _login_history()
        .find(query, {"_id": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    total = _login_history().count_documents(query)
    logs  = []
    for l in cursor:
        if l.get("created_at") and isinstance(l["created_at"], datetime):
            l["created_at"] = l["created_at"].isoformat()
        logs.append(l)
    return logs, total


# ── plan history ──────────────────────────────────────────────────────────────

def log_plan_change(
    user_id: str, from_plan: str, to_plan: str, changed_by: str = "user"
) -> None:
    _plan_history().insert_one({
        "user_id":    user_id,
        "from_plan":  from_plan,
        "to_plan":    to_plan,
        "changed_by": changed_by,
        "created_at": datetime.now(timezone.utc),
    })


def get_user_plan_history(user_id: str) -> list:
    cursor = _plan_history().find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1)
    result = []
    for r in cursor:
        if r.get("created_at") and isinstance(r["created_at"], datetime):
            r["created_at"] = r["created_at"].isoformat()
        result.append(r)
    return result


# ── profile change log ────────────────────────────────────────────────────────

def log_profile_change(
    user_id: str, field: str, old_value: str, new_value: str, ip: str = ""
) -> None:
    _profile_log().insert_one({
        "user_id":   user_id,
        "field":     field,
        "old_value": old_value,
        "new_value": new_value,
        "ip":        ip,
        "created_at": datetime.now(timezone.utc),
    })


def get_user_profile_log(user_id: str) -> list:
    cursor = _profile_log().find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(50)
    result = []
    for r in cursor:
        if r.get("created_at") and isinstance(r["created_at"], datetime):
            r["created_at"] = r["created_at"].isoformat()
        result.append(r)
    return result


# ── admin queries ─────────────────────────────────────────────────────────────

def list_users(
    page: int = 1,
    limit: int = 20,
    search: str = "",
    role_filter: str = "",
    plan_filter: str = "",
) -> tuple[list, int]:
    _VALID_ROLES = {"user", "admin", "super_admin"}
    _VALID_PLANS = {"free", "pro"}

    query: dict = {}
    if search:
        safe = re.escape(search[:100])   # escape regex metacharacters, cap length
        query["$or"] = [
            {"name":  {"$regex": safe, "$options": "i"}},
            {"email": {"$regex": safe, "$options": "i"}},
        ]
    if role_filter and role_filter in _VALID_ROLES:
        query["role"] = role_filter
    if plan_filter and plan_filter in _VALID_PLANS:
        query["plan"] = plan_filter

    skip   = (page - 1) * limit
    cursor = (
        _users()
        .find(query, {"password_hash": 0, "_id": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    total = _users().count_documents(query)
    users = []
    for u in cursor:
        for k in ("created_at", "last_login", "month_reset_at"):
            if u.get(k) and isinstance(u[k], datetime):
                u[k] = u[k].isoformat()
        users.append(u)
    return users, total


def list_admins() -> list:
    cursor = _users().find(
        {"role": {"$in": ["admin", "super_admin"]}},
        {"password_hash": 0, "_id": 0},
    ).sort("created_at", 1)
    admins = []
    for u in cursor:
        for k in ("created_at", "last_login", "month_reset_at"):
            if u.get(k) and isinstance(u[k], datetime):
                u[k] = u[k].isoformat()
        admins.append(u)
    return admins


def get_site_stats() -> dict:
    total     = _users().count_documents({})
    active    = _users().count_documents({"is_active": True})
    pro_users = _users().count_documents({"plan": "pro"})

    cutoff_7d   = datetime.now(timezone.utc) - timedelta(days=7)
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    new_today     = _users().count_documents({"created_at": {"$gte": today_start}})
    new_this_week = _users().count_documents({"created_at": {"$gte": cutoff_7d}})

    agg = list(_users().aggregate([
        {"$group": {"_id": None, "total": {"$sum": "$total_videos_generated"}}}
    ]))
    total_videos = agg[0]["total"] if agg else 0

    # Active sessions count
    active_sessions = _sessions().count_documents({
        "is_active": True,
        "expires_at": {"$gt": datetime.now(timezone.utc)},
    })

    # Failed logins today
    failed_today = _login_history().count_documents({
        "success": False,
        "created_at": {"$gte": today_start},
    })

    # Signup trend — last 30 days
    signup_trend = []
    for i in range(29, -1, -1):
        day_start = today_start - timedelta(days=i)
        day_end   = day_start + timedelta(days=1)
        count = _users().count_documents(
            {"created_at": {"$gte": day_start, "$lt": day_end}}
        )
        signup_trend.append({"date": day_start.strftime("%b %d"), "count": count})

    return {
        "total_users":      total,
        "active_users":     active,
        "pro_users":        pro_users,
        "new_today":        new_today,
        "new_this_week":    new_this_week,
        "total_videos":     total_videos,
        "active_sessions":  active_sessions,
        "failed_logins_today": failed_today,
        "signup_trend":     signup_trend,
    }


# ── audit log ─────────────────────────────────────────────────────────────────

def log_admin_action(
    admin_id: str,
    admin_email: str,
    action: str,
    target_id: str = "",
    target_email: str = "",
    details: str = "",
    ip: str = "",
) -> None:
    _audit_log().insert_one({
        "admin_id":     admin_id,
        "admin_email":  admin_email,
        "action":       action,
        "target_id":    target_id,
        "target_email": target_email,
        "details":      details,
        "ip":           ip,
        "created_at":   datetime.now(timezone.utc),
    })


def get_audit_log(page: int = 1, limit: int = 50) -> tuple[list, int]:
    skip   = (page - 1) * limit
    cursor = (
        _audit_log()
        .find({}, {"_id": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    total = _audit_log().count_documents({})
    logs  = []
    for entry in cursor:
        if entry.get("created_at") and isinstance(entry["created_at"], datetime):
            entry["created_at"] = entry["created_at"].isoformat()
        logs.append(entry)
    return logs, total


# ── password reset tokens ─────────────────────────────────────────────────────

def create_reset_token(user_id: str) -> str:
    _reset_tokens().update_many(
        {"user_id": user_id, "used": False},
        {"$set": {"used": True}},
    )
    token = uuid.uuid4().hex
    _reset_tokens().insert_one({
        "token":      token,
        "user_id":    user_id,
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
        "used":       False,
        "created_at": datetime.now(timezone.utc),
    })
    return token


def get_reset_token(token: str) -> dict | None:
    return _reset_tokens().find_one({
        "token":      token,
        "used":       False,
        "expires_at": {"$gt": datetime.now(timezone.utc)},
    })


def consume_reset_token(token: str) -> None:
    _reset_tokens().update_one({"token": token}, {"$set": {"used": True}})


# ── 2FA OTP tokens ────────────────────────────────────────────────────────────

def create_otp(user_id: str) -> tuple[str, str]:
    """Generate a 6-digit OTP. Returns (otp_token, plain_code).
    The plain code is sent to the user; only the bcrypt hash is stored."""
    plain_code = f"{random.SystemRandom().randint(0, 999_999):06d}"
    otp_token  = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    code_hash  = bcrypt.hashpw(plain_code.encode(), bcrypt.gensalt()).decode()
    # Invalidate any outstanding OTPs for this user first
    _otp_tokens().delete_many({"user_id": user_id})
    _otp_tokens().insert_one({
        "otp_token":  otp_token,
        "user_id":    user_id,
        "code_hash":  code_hash,
        "expires_at": expires_at,
        "used":       False,
        "attempts":   0,
        "created_at": datetime.now(timezone.utc),
    })
    return otp_token, plain_code


def verify_otp(otp_token: str, plain_code: str) -> dict | None:
    """Verify an OTP. Returns the token doc on success, None on failure.
    Automatically increments the attempt counter; invalidates after 3 wrong tries."""
    doc = _otp_tokens().find_one({
        "otp_token": otp_token,
        "used":      False,
        "expires_at": {"$gt": datetime.now(timezone.utc)},
    })
    if not doc:
        return None
    if doc.get("attempts", 0) >= 3:
        return None  # Too many wrong attempts — OTP is burned
    if not bcrypt.checkpw(plain_code.encode(), doc["code_hash"].encode()):
        _otp_tokens().update_one(
            {"otp_token": otp_token},
            {"$inc": {"attempts": 1}},
        )
        return None
    return doc


def consume_otp(otp_token: str) -> None:
    """Mark an OTP as used so it cannot be replayed."""
    _otp_tokens().update_one({"otp_token": otp_token}, {"$set": {"used": True}})


# ── brute-force lockout ───────────────────────────────────────────────────────

def check_lockout(email: str) -> dict | None:
    """Return active lockout doc for the email, or None if not locked."""
    return _lockouts().find_one({
        "email":        email.strip().lower(),
        "locked_until": {"$gt": datetime.now(timezone.utc)},
    })


def record_failed_attempt(email: str) -> int:
    """Increment failure counter. Returns remaining attempts before lockout (0 = now locked)."""
    email = email.strip().lower()
    now   = datetime.now(timezone.utc)
    window_start = now - timedelta(minutes=_LOCKOUT_MINUTES)

    # Count failures in the sliding window
    failures = _login_history().count_documents({
        "email":      email,
        "success":    False,
        "created_at": {"$gte": window_start},
    })

    remaining = _MAX_FAILED_ATTEMPTS - failures - 1
    if remaining <= 0:
        locked_until = now + timedelta(minutes=_LOCKOUT_MINUTES)
        _lockouts().update_one(
            {"email": email},
            {"$set": {
                "email":        email,
                "locked_until": locked_until,
                "failures":     failures + 1,
            }},
            upsert=True,
        )
        return 0
    return max(0, remaining)


def clear_lockout(email: str) -> None:
    """Remove lockout on successful authentication."""
    _lockouts().delete_many({"email": email.strip().lower()})
