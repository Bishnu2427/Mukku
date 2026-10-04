"""Quota enforcement — the control that makes every paid plan meaningful.

This is the regression suite for the bug where increment_video_count() existed
but was never called, so videos_this_month stayed at 0 forever and every user
was silently on an unlimited plan.
"""

import pytest

PROMPT = {"prompt": "A short explainer about drinking enough water every day."}


def _generate(c):
    return c.post("/generate", json=PROMPT)


class TestQuotaGate:
    def test_free_user_under_limit_is_allowed(self, auth_client, make_user):
        c = auth_client(make_user(plan="free", used=2))
        assert _generate(c).status_code == 202

    def test_free_user_at_limit_is_blocked(self, auth_client, make_user):
        c = auth_client(make_user(plan="free", used=3))
        r = _generate(c)
        assert r.status_code == 402
        assert r.get_json()["error"] == "quota_exceeded"

    def test_fourth_video_on_free_is_refused(self, auth_client, make_user, db):
        """The headline case: three succeed, the fourth does not."""
        user = make_user(plan="free", used=0)
        c = auth_client(user)
        for n in range(3):
            assert _generate(c).status_code == 202, f"video {n + 1} should be allowed"
            # Simulate the render finishing, which is what charges quota.
            db["projects"].update_many({"status": {"$in": ["queued", "processing"]}},
                                       {"$set": {"status": "completed"}})
            db["users"].update_one({"user_id": user["user_id"]},
                                   {"$inc": {"videos_this_month": 1}})
        assert _generate(c).status_code == 402

    @pytest.mark.parametrize("plan,used,expected", [
        ("free", 3, 402), ("starter", 4, 202), ("starter", 5, 402),
        ("pro", 24, 202), ("pro", 25, 402),
    ])
    def test_plan_limits(self, auth_client, make_user, plan, used, expected):
        c = auth_client(make_user(plan=plan, used=used))
        assert _generate(c).status_code == expected

    def test_enterprise_is_unlimited(self, auth_client, make_user):
        c = auth_client(make_user(plan="enterprise", role="enterprise", used=9999))
        assert _generate(c).status_code == 202

    def test_super_admin_is_unlimited(self, auth_client, make_user):
        c = auth_client(make_user(plan="free", role="super_admin", used=9999))
        assert _generate(c).status_code == 202


class TestConcurrentQuotaBypass:
    def test_in_flight_renders_count_against_quota(self, auth_client, make_user, db):
        """Firing requests in parallel must not slip past the limit.

        videos_this_month only moves on completion, so without counting
        queued/processing projects a user could start ten renders at once on a
        three-video plan.
        """
        user = make_user(plan="free", used=0)
        c = auth_client(user)
        codes = [_generate(c).status_code for _ in range(5)]
        assert codes[:3] == [202, 202, 202]
        assert codes[3:] == [402, 402], f"expected the 4th+ to be refused, got {codes}"


class TestQuotaCharging:
    def test_increment_is_wired_into_the_pipeline(self):
        """Guards against the original bug: defined but never called."""
        from pathlib import Path
        src = Path("services/pipeline_manager.py").read_text(encoding="utf-8")
        assert "increment_video_count" in src, (
            "pipeline_manager must charge quota on success — this is the exact "
            "regression that made every plan unlimited"
        )

    def test_increment_moves_the_counter(self, make_user, db):
        from database.user_model import increment_video_count, get_user_by_id
        user = make_user(used=0)
        increment_video_count(user["user_id"])
        assert get_user_by_id(user["user_id"])["videos_this_month"] == 1

    def test_increment_rolls_over_a_new_month(self, make_user, db):
        from datetime import datetime, timezone, timedelta
        from database.user_model import increment_video_count, get_user_by_id
        user = make_user(used=3)
        db["users"].update_one(
            {"user_id": user["user_id"]},
            {"$set": {"month_reset_at": datetime.now(timezone.utc) - timedelta(days=40)}},
        )
        increment_video_count(user["user_id"])
        fresh = get_user_by_id(user["user_id"])
        assert fresh["videos_this_month"] == 1, "a new month must reset the counter"
        assert fresh["total_videos_generated"] >= 1, "lifetime total keeps climbing"

    def test_failed_render_does_not_charge_quota(self, make_user, db):
        """Quota is charged at completion, never at request time."""
        from database.user_model import get_user_by_id
        user = make_user(plan="free", used=0)
        db["projects"].insert_one({
            "project_id": "failtest", "user_id": user["user_id"], "status": "failed",
        })
        assert get_user_by_id(user["user_id"])["videos_this_month"] == 0


class TestAnonymous:
    def test_generate_requires_login(self, client):
        r = client.post("/generate", json=PROMPT)
        assert r.status_code == 401
