"""Admin API Blueprint — RBAC-protected stats, user management, admin management, audit log."""

import os
import uuid
import logging
from datetime import datetime

import bcrypt
from flask import Blueprint, request, jsonify

from backend.auth import (
    require_admin, require_permission, require_super_admin,
    _is_super_admin, _app_url, _admin_invite_email,
)
from database.user_model import (
    ALL_PERMISSIONS,
    list_users, list_admins, get_site_stats,
    update_user, delete_user, get_user_by_id, get_user_by_email, create_user,
    log_admin_action, get_audit_log,
    get_all_login_history, get_all_sessions, invalidate_session,
    invalidate_all_user_sessions, log_plan_change,
    get_user_login_history, get_user_sessions,
)
from database.mongo_connection import _get_db

logger   = logging.getLogger(__name__)
admin_bp = Blueprint("admin", __name__)


def _projects_col():
    return _get_db()["projects"]


def _client_ip() -> str:
    return request.headers.get("X-Forwarded-For", request.remote_addr or "")


# ── stats ─────────────────────────────────────────────────────────────────────

@admin_bp.route("/api/admin/stats", methods=["GET"])
@require_permission("view_dashboard")
def api_admin_stats(current_user):
    stats = get_site_stats()

    total_projects = _projects_col().count_documents({})
    completed      = _projects_col().count_documents({"status": "completed"})
    failed         = _projects_col().count_documents({"status": "failed"})
    processing     = _projects_col().count_documents(
        {"status": {"$in": ["queued", "processing"]}}
    )

    # recent items for overview quick tables
    recent_users_cur = (
        _get_db()["users"]
        .find({}, {"password_hash": 0, "_id": 0})
        .sort("created_at", -1)
        .limit(6)
    )
    recent_users = []
    for u in recent_users_cur:
        for k in ("created_at", "last_login", "month_reset_at"):
            if u.get(k) and isinstance(u[k], datetime):
                u[k] = u[k].isoformat()
        recent_users.append(u)

    recent_proj_cur = (
        _projects_col()
        .find({}, {"_id": 0, "scenes": 0, "audio_paths": 0, "image_paths": 0})
        .sort("created_at", -1)
        .limit(6)
    )
    recent_projects = []
    for p in recent_proj_cur:
        for k in ("created_at", "updated_at"):
            if p.get(k) and isinstance(p[k], datetime):
                p[k] = p[k].isoformat()
        recent_projects.append(p)

    stats.update({
        "total_projects":      total_projects,
        "completed_projects":  completed,
        "failed_projects":     failed,
        "processing_projects": processing,
        "recent_users":        recent_users,
        "recent_projects":     recent_projects,
    })
    return jsonify(stats)


# ── users ─────────────────────────────────────────────────────────────────────

@admin_bp.route("/api/admin/users", methods=["GET"])
@require_permission("view_users")
def api_admin_list_users(current_user):
    page   = max(1, int(request.args.get("page", 1)))
    limit  = min(50, max(1, int(request.args.get("limit", 15))))
    search = request.args.get("search", "").strip()
    plan   = request.args.get("plan", "").strip()

    # Only show regular users (not admins) in the users tab
    users, total = list_users(page=page, limit=limit, search=search,
                              role_filter="user", plan_filter=plan)
    return jsonify({
        "users": users,
        "total": total,
        "page":  page,
        "limit": limit,
        "pages": max(1, (total + limit - 1) // limit),
    })


@admin_bp.route("/api/admin/users/<user_id>", methods=["PUT"])
@require_permission("edit_users")
def api_admin_update_user(current_user, user_id: str):
    _VALID_PLANS = {"free", "pro"}

    data    = request.get_json(silent=True) or {}
    allowed = {"is_active", "plan", "name"}
    updates = {k: v for k, v in data.items() if k in allowed}

    # Validate each field
    if "name" in updates:
        name = str(updates["name"]).strip()
        if not name or len(name) < 2 or len(name) > 100:
            return jsonify({"error": "Name must be 2–100 characters."}), 400
        updates["name"] = name
    if "plan" in updates and updates["plan"] not in _VALID_PLANS:
        return jsonify({"error": "Invalid plan value."}), 400
    if "is_active" in updates:
        updates["is_active"] = bool(updates["is_active"])

    if not updates:
        return jsonify({"error": "No valid fields to update."}), 400

    target = get_user_by_id(user_id)
    if not target:
        return jsonify({"error": "User not found."}), 404
    if _is_super_admin(target):
        return jsonify({"error": "The super admin account cannot be modified."}), 403
    if target.get("role") in ("admin", "super_admin"):
        return jsonify({"error": "Use the Admins tab to modify admin accounts."}), 400

    # Log plan change separately for history trail
    if "plan" in updates and updates["plan"] != target.get("plan"):
        log_plan_change(target["user_id"], target.get("plan", "free"),
                        updates["plan"], changed_by=current_user["email"])

    update_user(user_id, updates)
    log_admin_action(
        current_user["user_id"], current_user["email"],
        "update_user", user_id, target.get("email", ""),
        str(updates), _client_ip(),
    )
    return jsonify({"status": "ok"})


@admin_bp.route("/api/admin/users/<user_id>", methods=["DELETE"])
@require_permission("delete_users")
def api_admin_delete_user(current_user, user_id: str):
    if user_id == current_user["user_id"]:
        return jsonify({"error": "You cannot delete your own account."}), 400

    target = get_user_by_id(user_id)
    if not target:
        return jsonify({"error": "User not found."}), 404
    if _is_super_admin(target):
        return jsonify({"error": "The super admin account cannot be deleted."}), 403
    if target.get("role") in ("admin", "super_admin"):
        return jsonify({"error": "Remove admin role first before deleting."}), 400

    delete_user(user_id)
    log_admin_action(
        current_user["user_id"], current_user["email"],
        "delete_user", user_id, target.get("email", ""),
        "User permanently deleted", _client_ip(),
    )
    return jsonify({"status": "ok"})


# ── admin management (super_admin or manage_admins permission) ─────────────────

@admin_bp.route("/api/admin/admins", methods=["GET"])
@require_permission("manage_admins")
def api_list_admins(current_user):
    return jsonify({"admins": list_admins(), "all_permissions": ALL_PERMISSIONS})


@admin_bp.route("/api/admin/admins", methods=["POST"])
@require_permission("manage_admins")
def api_create_admin(current_user):
    """
    Create a new admin. Only super_admin can grant manage_admins permission.
    Sends an invite email with a temporary password.
    """
    data        = request.get_json(silent=True) or {}
    name        = data.get("name", "").strip()
    email       = data.get("email", "").strip().lower()
    permissions = data.get("permissions", [])
    send_email  = data.get("send_email", True)

    if not name or len(name) < 2:
        return jsonify({"error": "Name must be at least 2 characters."}), 400
    if not email or "@" not in email:
        return jsonify({"error": "Valid email is required."}), 400

    # Validate permissions — non-super-admins cannot grant manage_admins
    valid_perms = [p for p in permissions if p in ALL_PERMISSIONS]
    if "manage_admins" in valid_perms and not _is_super_admin(current_user):
        return jsonify({"error": "Only the super admin can grant 'manage_admins'."}), 403

    existing = get_user_by_email(email)
    if existing:
        if existing.get("role") in ("admin", "super_admin"):
            return jsonify({"error": "This email already has admin access."}), 409
        # Promote existing user to admin
        update_user(existing["user_id"], {
            "role":        "admin",
            "is_admin":    True,
            "permissions": valid_perms,
        })
        log_admin_action(
            current_user["user_id"], current_user["email"],
            "promote_to_admin", existing["user_id"], email,
            f"permissions={valid_perms}", _client_ip(),
        )
        return jsonify({"status": "ok", "action": "promoted"})

    # Create new user with admin role
    temp_password = uuid.uuid4().hex[:12]
    pw_hash       = bcrypt.hashpw(temp_password.encode(), bcrypt.gensalt()).decode()
    user_id       = create_user(name, email, pw_hash)
    if not user_id:
        return jsonify({"error": "Failed to create user."}), 500

    update_user(user_id, {
        "role":        "admin",
        "is_admin":    True,
        "permissions": valid_perms,
    })

    if send_email:
        _admin_invite_email(email, name, temp_password, f"{_app_url()}/login")

    log_admin_action(
        current_user["user_id"], current_user["email"],
        "create_admin", user_id, email,
        f"permissions={valid_perms}", _client_ip(),
    )
    return jsonify({"status": "ok", "action": "created",
                    "temp_password": temp_password if not send_email else None})


@admin_bp.route("/api/admin/admins/<user_id>", methods=["PUT"])
@require_permission("manage_admins")
def api_update_admin(current_user, user_id: str):
    """Update an admin's permissions or name. Super admin account is immutable."""
    data = request.get_json(silent=True) or {}

    target = get_user_by_id(user_id)
    if not target:
        return jsonify({"error": "Admin not found."}), 404
    if _is_super_admin(target):
        return jsonify({"error": "The super admin account cannot be modified."}), 403

    updates = {}
    if "name" in data:
        updates["name"] = str(data["name"]).strip()
    if "permissions" in data:
        perms = [p for p in data["permissions"] if p in ALL_PERMISSIONS]
        if "manage_admins" in perms and not _is_super_admin(current_user):
            return jsonify({"error": "Only the super admin can grant 'manage_admins'."}), 403
        updates["permissions"] = perms
    if "is_active" in data:
        updates["is_active"] = bool(data["is_active"])

    if not updates:
        return jsonify({"error": "Nothing to update."}), 400

    update_user(user_id, updates)
    log_admin_action(
        current_user["user_id"], current_user["email"],
        "update_admin", user_id, target.get("email", ""),
        str(updates), _client_ip(),
    )
    return jsonify({"status": "ok"})


@admin_bp.route("/api/admin/admins/<user_id>", methods=["DELETE"])
@require_permission("manage_admins")
def api_revoke_admin(current_user, user_id: str):
    """Revoke admin role (demotes to regular user). Cannot remove super_admin."""
    if user_id == current_user["user_id"]:
        return jsonify({"error": "You cannot remove your own admin role."}), 400

    target = get_user_by_id(user_id)
    if not target:
        return jsonify({"error": "Admin not found."}), 404
    if _is_super_admin(target):
        return jsonify({"error": "The super admin role cannot be revoked."}), 403

    update_user(user_id, {"role": "user", "is_admin": False, "permissions": []})
    log_admin_action(
        current_user["user_id"], current_user["email"],
        "revoke_admin", user_id, target.get("email", ""),
        "Admin role revoked", _client_ip(),
    )
    return jsonify({"status": "ok"})


# ── projects ──────────────────────────────────────────────────────────────────

@admin_bp.route("/api/admin/projects", methods=["GET"])
@require_permission("view_projects")
def api_admin_list_projects(current_user):
    page   = max(1, int(request.args.get("page", 1)))
    limit  = min(50, max(1, int(request.args.get("limit", 15))))
    status = request.args.get("status", "").strip()

    _VALID_STATUSES = {"queued", "processing", "completed", "failed"}
    query = {}
    if status and status in _VALID_STATUSES:
        query["status"] = status
    elif status:
        return jsonify({"error": "Invalid status filter."}), 400

    skip   = (page - 1) * limit
    cursor = (
        _projects_col()
        .find(query, {"_id": 0, "scenes": 0, "audio_paths": 0, "image_paths": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    total = _projects_col().count_documents(query)

    projects = []
    for p in cursor:
        for k in ("created_at", "updated_at"):
            if p.get(k) and isinstance(p[k], datetime):
                p[k] = p[k].isoformat()
        projects.append(p)

    return jsonify({
        "projects": projects,
        "total":    total,
        "page":     page,
        "limit":    limit,
        "pages":    max(1, (total + limit - 1) // limit),
    })


# ── audit log ─────────────────────────────────────────────────────────────────

@admin_bp.route("/api/admin/audit-log", methods=["GET"])
@require_permission("view_audit_log")
def api_admin_audit_log(current_user):
    page  = max(1, int(request.args.get("page", 1)))
    limit = min(100, max(1, int(request.args.get("limit", 50))))
    logs, total = get_audit_log(page=page, limit=limit)
    return jsonify({
        "logs":  logs,
        "total": total,
        "page":  page,
        "pages": max(1, (total + limit - 1) // limit),
    })


# ── health ────────────────────────────────────────────────────────────────────

@admin_bp.route("/api/admin/health", methods=["GET"])
@require_permission("view_health")
def api_admin_health(current_user):
    import requests as req
    services = {}

    try:
        _get_db().command("ping")
        services["mongodb"] = "ok"
    except Exception:
        services["mongodb"] = "error"

    ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
    try:
        r = req.get(f"{ollama_url}/api/tags", timeout=3)
        services["ollama"] = "ok" if r.status_code == 200 else "degraded"
    except Exception:
        services["ollama"] = "offline"

    # Return flat structure (frontend expects d.mongodb, d.ollama directly)
    return jsonify(services)


# ── login history ─────────────────────────────────────────────────────────────

@admin_bp.route("/api/admin/login-history", methods=["GET"])
@require_permission("view_audit_log")
def api_admin_login_history(current_user):
    page   = max(1, int(request.args.get("page", 1)))
    limit  = min(100, max(1, int(request.args.get("limit", 50))))
    search = request.args.get("search", "").strip()
    logs, total = get_all_login_history(page=page, limit=limit, search=search)
    return jsonify({
        "logs":  logs,
        "total": total,
        "page":  page,
        "pages": max(1, (total + limit - 1) // limit),
    })


@admin_bp.route("/api/admin/users/<user_id>/login-history", methods=["GET"])
@require_permission("view_users")
def api_admin_user_login_history(current_user, user_id: str):
    page  = max(1, int(request.args.get("page", 1)))
    limit = min(50, max(1, int(request.args.get("limit", 20))))
    logs, total = get_user_login_history(user_id, page=page, limit=limit)
    return jsonify({"logs": logs, "total": total, "page": page})


# ── sessions ──────────────────────────────────────────────────────────────────

@admin_bp.route("/api/admin/sessions", methods=["GET"])
@require_permission("view_sessions")
def api_admin_sessions(current_user):
    page  = max(1, int(request.args.get("page", 1)))
    limit = min(100, max(1, int(request.args.get("limit", 50))))
    sessions, total = get_all_sessions(page=page, limit=limit)
    return jsonify({
        "sessions": sessions,
        "total":    total,
        "page":     page,
        "pages":    max(1, (total + limit - 1) // limit),
    })


@admin_bp.route("/api/admin/sessions/<session_id>", methods=["DELETE"])
@require_permission("view_sessions")
def api_admin_kill_session(current_user, session_id: str):
    """Force-terminate any active session."""
    invalidate_session(session_id)
    log_admin_action(
        current_user["user_id"], current_user["email"],
        "kill_session", session_id, "",
        "Session force-terminated by admin", _client_ip(),
    )
    return jsonify({"status": "ok"})


@admin_bp.route("/api/admin/users/<user_id>/sessions", methods=["DELETE"])
@require_permission("view_sessions")
def api_admin_kill_user_sessions(current_user, user_id: str):
    """Force-terminate all sessions for a specific user."""
    target = get_user_by_id(user_id)
    if not target:
        return jsonify({"error": "User not found."}), 404
    count = invalidate_all_user_sessions(user_id)
    log_admin_action(
        current_user["user_id"], current_user["email"],
        "kill_all_sessions", user_id, target.get("email", ""),
        f"{count} sessions terminated", _client_ip(),
    )
    return jsonify({"status": "ok", "terminated": count})
