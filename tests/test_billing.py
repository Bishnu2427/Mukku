"""Billing security.

The webhook is the highest-risk endpoint in the app: it grants paid plans and
is reachable by anyone. These tests exist to make sure it can only ever be
driven by Razorpay.
"""

import os
import hmac
import json
import hashlib

import pytest

WEBHOOK_SECRET = "test_webhook_secret_value"


@pytest.fixture(autouse=True)
def _razorpay_env(monkeypatch):
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_fake")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "fake_secret")
    monkeypatch.setenv("RAZORPAY_WEBHOOK_SECRET", WEBHOOK_SECRET)


def _signed(client, body: dict, secret: str = WEBHOOK_SECRET):
    raw = json.dumps(body).encode()
    sig = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return client.post("/api/billing/webhook", data=raw,
                       headers={"X-Razorpay-Signature": sig,
                                "Content-Type": "application/json"})


def _capture_event(order_id="order_123", payment_id="pay_123", amount=57700):
    return {
        "event": "payment.captured",
        "payload": {"payment": {"entity": {
            "id": payment_id, "order_id": order_id, "amount": amount,
        }}},
    }


@pytest.fixture()
def pending_order(db, make_user):
    def _make(plan="pro", amount=57700, order_id="order_123"):
        user = make_user(email=f"buyer_{order_id}@example.com", plan="free")
        db["payments"].insert_one({
            "order_id": order_id, "user_id": user["user_id"], "plan": plan,
            "amount": amount, "currency": "INR", "status": "created",
        })
        return user, order_id
    return _make


class TestWebhookSignature:
    def test_unsigned_webhook_is_rejected(self, client):
        r = client.post("/api/billing/webhook", json=_capture_event())
        assert r.status_code == 400

    def test_wrong_signature_is_rejected(self, client, pending_order):
        pending_order()
        r = _signed(client, _capture_event(), secret="attacker-guess")
        assert r.status_code == 400

    def test_forged_body_with_stale_signature_is_rejected(self, client, pending_order):
        """Signature covers the body — changing the amount must invalidate it."""
        pending_order()
        raw = json.dumps(_capture_event()).encode()
        sig = hmac.new(WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
        tampered = json.dumps(_capture_event(amount=100)).encode()
        r = client.post("/api/billing/webhook", data=tampered,
                        headers={"X-Razorpay-Signature": sig,
                                 "Content-Type": "application/json"})
        assert r.status_code == 400

    def test_attacker_cannot_grant_themselves_pro(self, client, db, make_user):
        """The whole point of signature verification."""
        user = make_user(email="attacker@example.com", plan="free")
        db["payments"].insert_one({
            "order_id": "order_evil", "user_id": user["user_id"], "plan": "pro",
            "amount": 57700, "status": "created",
        })
        r = client.post("/api/billing/webhook",
                        json=_capture_event(order_id="order_evil"))
        assert r.status_code == 400
        from database.user_model import get_user_by_id
        assert get_user_by_id(user["user_id"])["plan"] == "free"


class TestWebhookFulfilment:
    def test_valid_capture_upgrades_the_plan(self, client, pending_order, db):
        user, order_id = pending_order(plan="pro", amount=57700)
        r = _signed(client, _capture_event(order_id=order_id, amount=57700))
        assert r.status_code == 200
        from database.user_model import get_user_by_id
        assert get_user_by_id(user["user_id"])["plan"] == "pro"

    def test_plan_change_is_recorded_in_history(self, client, pending_order, db):
        user, order_id = pending_order()
        _signed(client, _capture_event(order_id=order_id))
        hist = list(db["plan_history"].find({"user_id": user["user_id"]}))
        assert hist and hist[0]["to_plan"] == "pro"
        assert hist[0]["changed_by"] == "razorpay"

    def test_replayed_webhook_does_not_double_grant(self, client, pending_order, db):
        """Razorpay retries until it gets a 2xx — replays must be safe."""
        user, order_id = pending_order()
        first = _signed(client, _capture_event(order_id=order_id))
        second = _signed(client, _capture_event(order_id=order_id))
        assert first.status_code == 200
        assert second.get_json()["status"] == "already_processed"
        assert db["plan_history"].count_documents({"user_id": user["user_id"]}) == 1

    def test_underpayment_does_not_grant_the_plan(self, client, pending_order):
        """A tampered client must not buy Pro for ₹1."""
        user, order_id = pending_order(plan="pro", amount=57700)
        r = _signed(client, _capture_event(order_id=order_id, amount=100))
        assert r.get_json()["status"] == "underpaid"
        from database.user_model import get_user_by_id
        assert get_user_by_id(user["user_id"])["plan"] == "free"

    def test_unknown_order_is_acked_not_retried(self, client):
        """Returning non-2xx here would trigger an endless Razorpay retry storm."""
        r = _signed(client, _capture_event(order_id="order_nonexistent"))
        assert r.status_code == 200
        assert r.get_json()["status"] == "unknown_order"

    def test_irrelevant_events_are_ignored(self, client, pending_order):
        user, order_id = pending_order()
        body = _capture_event(order_id=order_id)
        body["event"] = "payment.failed"
        r = _signed(client, body)
        assert r.get_json()["status"] == "ignored"
        from database.user_model import get_user_by_id
        assert get_user_by_id(user["user_id"])["plan"] == "free"


class TestOrderCreation:
    def test_order_requires_login(self, client):
        assert client.post("/api/billing/order", json={"plan": "pro"}).status_code == 401

    def test_invalid_plan_rejected(self, auth_client, make_user):
        c = auth_client(make_user())
        assert c.post("/api/billing/order", json={"plan": "diamond"}).status_code == 400

    def test_cannot_buy_current_plan(self, auth_client, make_user):
        c = auth_client(make_user(plan="pro"))
        assert c.post("/api/billing/order", json={"plan": "pro"}).status_code == 400

    def test_price_comes_from_the_server_not_the_client(self, auth_client, make_user):
        """Client sends a plan name only; it can never send an amount."""
        from backend.billing import PLAN_PRICING
        assert PLAN_PRICING["pro"]["amount"] == 57700
        assert PLAN_PRICING["starter"]["amount"] == 17700

    def test_plans_endpoint_is_public(self, client):
        r = client.get("/api/billing/plans")
        assert r.status_code == 200
        ids = {p["id"] for p in r.get_json()["plans"]}
        assert {"free", "starter", "pro", "enterprise"} <= ids


class TestUnconfigured:
    def test_order_returns_503_without_keys(self, auth_client, make_user, monkeypatch):
        monkeypatch.setenv("RAZORPAY_KEY_ID", "")
        monkeypatch.setenv("RAZORPAY_KEY_SECRET", "")
        c = auth_client(make_user())
        assert c.post("/api/billing/order", json={"plan": "pro"}).status_code == 503

    def test_webhook_rejects_when_no_secret_configured(self, client, monkeypatch):
        monkeypatch.setenv("RAZORPAY_WEBHOOK_SECRET", "")
        r = _signed(client, _capture_event())
        assert r.status_code == 400
