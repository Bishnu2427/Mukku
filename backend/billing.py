"""Billing — Razorpay orders and webhook fulfilment.

Design notes that matter for correctness:

* **The webhook is the only source of truth.** The browser redirect after
  checkout is advisory — users close the tab, lose signal, or never come back.
  A plan is upgraded when Razorpay tells the server the payment captured, not
  when the frontend says so.

* **Every webhook is signature-verified** with HMAC-SHA256 against
  RAZORPAY_WEBHOOK_SECRET, compared using compare_digest. An unverified
  webhook endpoint is a "make me a Pro user" button for anyone on the internet.

* **Amounts are re-checked server side.** The order is created from the
  server's own price table; the webhook confirms the captured amount matches
  the plan being granted, so a tampered client cannot buy Pro for ₹1.

* **Fulfilment is idempotent.** Razorpay retries webhooks until it gets a 2xx,
  so the same payment can arrive several times. Each event id is recorded and
  replays are acknowledged without granting the plan twice.

Configure with:
    RAZORPAY_KEY_ID
    RAZORPAY_KEY_SECRET
    RAZORPAY_WEBHOOK_SECRET
Without them every endpoint returns 503 and the rest of the app is unaffected.
"""

import os
import hmac
import json
import base64
import hashlib
import logging
from datetime import datetime, timezone

import requests
from flask import Blueprint, request, jsonify

from backend.extensions import limiter, LIMIT_BILLING
from backend.auth import require_auth, _client_ip
from database.user_model import (
    get_user_by_id, update_user, log_plan_change, log_admin_action,
)
from database.mongo_connection import _get_db

logger     = logging.getLogger(__name__)
billing_bp = Blueprint("billing", __name__)

RAZORPAY_API = "https://api.razorpay.com/v1"

# Server-side price table, in paise (₹1 = 100 paise). The client never sends a
# price — it sends a plan name, and this decides what that costs.
PLAN_PRICING = {
    "starter": {"amount": 17700, "currency": "INR", "label": "Starter — 5 videos / month"},
    "pro":     {"amount": 57700, "currency": "INR", "label": "Pro — 25 videos / month"},
}

PLAN_QUOTA = {"free": 3, "starter": 5, "pro": 25, "enterprise": -1}


def _keys() -> tuple[str, str]:
    return (os.getenv("RAZORPAY_KEY_ID", "").strip(),
            os.getenv("RAZORPAY_KEY_SECRET", "").strip())


def _configured() -> bool:
    kid, ksec = _keys()
    return bool(kid and ksec)


def _payments():
    return _get_db()["payments"]


def _auth_header() -> dict:
    kid, ksec = _keys()
    token = base64.b64encode(f"{kid}:{ksec}".encode()).decode()
    return {"Authorization": f"Basic {token}", "Content-Type": "application/json"}


# ── Step 1: create an order ───────────────────────────────────────────────────

@billing_bp.route("/api/billing/plans", methods=["GET"])
def api_plans():
    """Public price list, so the frontend never hardcodes amounts."""
    return jsonify({
        "configured": _configured(),
        "currency":   "INR",
        "plans": [
            {"id": "free", "amount": 0, "videos": PLAN_QUOTA["free"], "label": "Free"},
            *[
                {"id": pid, "amount": cfg["amount"], "videos": PLAN_QUOTA[pid],
                 "label": cfg["label"]}
                for pid, cfg in PLAN_PRICING.items()
            ],
            {"id": "enterprise", "amount": None, "videos": -1, "label": "Enterprise"},
        ],
    })


@billing_bp.route("/api/billing/order", methods=["POST"])
@limiter.limit(LIMIT_BILLING)
@require_auth
def api_create_order(current_user, _session_id):
    if not _configured():
        return jsonify({"error": "Payments are not configured on this server."}), 503

    data = request.get_json(silent=True) or {}
    plan = str(data.get("plan", "")).strip().lower()

    if plan not in PLAN_PRICING:
        return jsonify({"error": "Choose a valid plan."}), 400
    if current_user.get("plan") == plan:
        return jsonify({"error": f"You are already on the {plan} plan."}), 400

    cfg = PLAN_PRICING[plan]
    # receipt is how we tie the webhook back to a user without trusting notes.
    receipt = f"mukku_{current_user['user_id']}_{plan}_{int(datetime.now(timezone.utc).timestamp())}"

    try:
        resp = requests.post(
            f"{RAZORPAY_API}/orders",
            headers=_auth_header(),
            json={
                "amount":          cfg["amount"],
                "currency":        cfg["currency"],
                "receipt":         receipt[:40],
                "payment_capture": 1,
                "notes": {
                    "user_id": current_user["user_id"],
                    "email":   current_user.get("email", ""),
                    "plan":    plan,
                },
            },
            timeout=15,
        )
        resp.raise_for_status()
        order = resp.json()
    except Exception as exc:
        logger.error("Razorpay order creation failed: %s", exc)
        return jsonify({"error": "Could not start checkout. Please try again."}), 502

    _payments().insert_one({
        "order_id":   order["id"],
        "user_id":    current_user["user_id"],
        "email":      current_user.get("email", ""),
        "plan":       plan,
        "amount":     cfg["amount"],
        "currency":   cfg["currency"],
        "status":     "created",
        "created_at": datetime.now(timezone.utc),
        "ip":         _client_ip(),
    })

    logger.info("Razorpay order %s created for %s (%s)",
                order["id"], current_user["user_id"], plan)

    kid, _ = _keys()
    return jsonify({
        "order_id": order["id"],
        "amount":   cfg["amount"],
        "currency": cfg["currency"],
        "key_id":   kid,          # publishable, safe to expose
        "plan":     plan,
        "name":     current_user.get("name", ""),
        "email":    current_user.get("email", ""),
    })


# ── Step 2: webhook fulfilment ────────────────────────────────────────────────

def _verify_signature(raw_body: bytes, signature: str) -> bool:
    secret = os.getenv("RAZORPAY_WEBHOOK_SECRET", "").strip()
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def _grant_plan(user_id: str, plan: str, payment_id: str, amount: int) -> bool:
    user = get_user_by_id(user_id)
    if not user:
        logger.error("Webhook for unknown user %s", user_id)
        return False

    previous = user.get("plan", "free")
    update_user(user_id, {
        "plan":            plan,
        "plan_started_at": datetime.now(timezone.utc),
        "plan_payment_id": payment_id,
    })
    log_plan_change(user_id, previous, plan, changed_by="razorpay")
    logger.info("Plan upgraded: %s %s -> %s (payment %s, %d paise)",
                user_id, previous, plan, payment_id, amount)
    return True


@billing_bp.route("/api/billing/webhook", methods=["POST"])
def api_webhook():
    """Razorpay calls this. Never trust it without verifying the signature."""
    raw = request.get_data()
    signature = request.headers.get("X-Razorpay-Signature", "")

    if not _verify_signature(raw, signature):
        logger.warning("Rejected Razorpay webhook with bad signature from %s", _client_ip())
        # 400, not 401 — a 401 invites Razorpay to retry a forged request.
        return jsonify({"error": "invalid signature"}), 400

    try:
        event = json.loads(raw)
    except ValueError:
        return jsonify({"error": "malformed payload"}), 400

    event_type = event.get("event", "")
    payload    = event.get("payload", {}).get("payment", {}).get("entity", {})
    payment_id = payload.get("id", "")
    order_id   = payload.get("order_id", "")

    # Idempotency: Razorpay retries until it sees a 2xx, so the same capture
    # can arrive many times. Ack replays without granting the plan again.
    if payment_id and _payments().find_one({"payment_id": payment_id, "status": "paid"}):
        logger.info("Duplicate webhook for payment %s — already fulfilled", payment_id)
        return jsonify({"status": "already_processed"}), 200

    if event_type not in ("payment.captured", "order.paid"):
        return jsonify({"status": "ignored", "event": event_type}), 200

    record = _payments().find_one({"order_id": order_id}) if order_id else None
    if not record:
        logger.error("Webhook for unknown order %s", order_id)
        return jsonify({"status": "unknown_order"}), 200   # 200 stops the retry storm

    plan     = record["plan"]
    expected = PLAN_PRICING.get(plan, {}).get("amount")
    captured = payload.get("amount")

    # Re-check the money server side: a tampered client must not buy Pro for ₹1.
    if expected is not None and captured is not None and int(captured) < int(expected):
        logger.error("Underpayment on order %s: captured %s, expected %s",
                     order_id, captured, expected)
        _payments().update_one({"order_id": order_id},
                               {"$set": {"status": "underpaid", "payment_id": payment_id}})
        return jsonify({"status": "underpaid"}), 200

    granted = _grant_plan(record["user_id"], plan, payment_id, int(captured or 0))

    _payments().update_one({"order_id": order_id}, {"$set": {
        "status":      "paid" if granted else "orphaned",
        "payment_id":  payment_id,
        "paid_at":     datetime.now(timezone.utc),
        "event":       event_type,
        "raw_amount":  captured,
    }})

    return jsonify({"status": "ok"}), 200


# ── Status for the dashboard ──────────────────────────────────────────────────

@billing_bp.route("/api/billing/status", methods=["GET"])
@require_auth
def api_billing_status(current_user, _session_id):
    plan = current_user.get("plan", "free")
    recent = list(
        _payments()
        .find({"user_id": current_user["user_id"]},
              {"_id": 0, "order_id": 1, "plan": 1, "amount": 1,
               "status": 1, "created_at": 1, "paid_at": 1})
        .sort("created_at", -1)
        .limit(10)
    )
    for r in recent:
        for k in ("created_at", "paid_at"):
            if isinstance(r.get(k), datetime):
                r[k] = r[k].isoformat()
    return jsonify({
        "plan":       plan,
        "quota":      PLAN_QUOTA.get(plan, 3),
        "configured": _configured(),
        "payments":   recent,
    })
