"""Pipeline contract, render budget, and provider routing.

The stage keys are a contract with the frontend: the Studio progress tracker
matches on them exactly, so renaming one silently breaks the UI without any
backend test failing.
"""

import os
import pytest

# The nine keys the Studio tracker renders, in order.
STAGE_KEYS = [
    "analyzing_prompt", "generating_script", "planning_scenes",
    "generating_images", "generating_clips", "generating_voices",
    "generating_music", "assembling_video", "completed",
]


class TestStageContract:
    def test_backend_emits_exactly_the_keys_the_ui_expects(self):
        from pathlib import Path
        src = Path("services/pipeline_manager.py").read_text(encoding="utf-8")
        for key in STAGE_KEYS[:-1]:          # "completed" is set separately
            assert f'"{key}"' in src, f"pipeline no longer emits stage '{key}'"

    def test_frontend_matches_the_same_keys(self):
        from pathlib import Path
        ts = list(Path("Frontend/src").rglob("*.ts")) + list(Path("Frontend/src").rglob("*.tsx"))
        blob = "\n".join(p.read_text(encoding="utf-8", errors="ignore") for p in ts)
        missing = [k for k in STAGE_KEYS if k not in blob]
        assert not missing, f"frontend does not handle stages: {missing}"


class TestRenderBudget:
    def test_budget_is_configurable_and_bounded(self):
        import services.pipeline_manager as pm
        assert pm.RENDER_BUDGET_SECONDS > 0
        assert pm.RENDER_BUDGET_SECONDS <= 3600, "an hour-long render is not a product"

    def test_generate_scene_clip_accepts_force_fallback(self):
        """The escape hatch the budget relies on."""
        import inspect
        from generators.video_generator import generate_scene_clip
        assert "force_fallback" in inspect.signature(generate_scene_clip).parameters

    def test_force_fallback_skips_every_paid_provider(self, monkeypatch):
        """With force_fallback the remote branches must not be entered even
        when every API key is present."""
        import generators.video_generator as vg
        monkeypatch.setattr(vg, "GEMINI_API_KEY", "fake")
        monkeypatch.setattr(vg, "KLING_ACCESS_KEY", "fake")
        monkeypatch.setattr(vg, "KLING_SECRET_KEY", "fake")
        monkeypatch.setattr(vg, "POLLO_API_KEY", "fake")

        called = []
        monkeypatch.setattr(vg, "_veo_generate",
                            lambda *a, **k: called.append("veo"))
        monkeypatch.setattr(vg, "_kling_image_to_video",
                            lambda *a, **k: called.append("kling"))
        monkeypatch.setattr(vg, "_pollo_image_to_video",
                            lambda *a, **k: called.append("pollo"))
        monkeypatch.setattr(vg, "_moviepy_static_clip",
                            lambda *a, **k: called.append("ken_burns") or "clip.mp4")

        vg.generate_scene_clip("img.png", "a prompt", "p1", 1,
                               duration=5, force_fallback=True)
        assert called == ["ken_burns"], f"paid providers were called: {called}"


class TestProviderRouting:
    def test_free_tier_is_excluded_from_paid_motion(self):
        import services.pipeline_manager as pm
        assert "free" not in pm.AI_MOTION_TIERS
        assert "starter" not in pm.AI_MOTION_TIERS

    def test_paid_tiers_get_ai_motion(self):
        import services.pipeline_manager as pm
        assert {"pro", "enterprise"} <= pm.AI_MOTION_TIERS

    def test_tier_is_resolved_server_side_not_sent_by_client(self, auth_client, make_user, db):
        """A client must not be able to buy Veo by putting tier in the body."""
        user = make_user(plan="free", used=0)
        c = auth_client(user)
        r = c.post("/generate", json={
            "prompt": "a long enough prompt for validation to pass",
            "settings": {"tier": "enterprise"},        # attempted escalation
        })
        assert r.status_code == 202
        proj = db["projects"].find_one({"user_id": user["user_id"]})
        assert proj["settings"]["tier"] == "free", (
            "client-supplied tier must be overwritten by the server"
        )


class TestFailureHandling:
    def test_user_error_never_contains_a_traceback(self, db):
        """Regression: tracebacks used to be written to project.error and
        returned verbatim by /status (OWASP A09)."""
        from pathlib import Path
        src = Path("services/pipeline_manager.py").read_text(encoding="utf-8")
        assert '"error_internal"' in src, "traceback must go to a non-serialised field"
        # and /status must not expose it
        api = Path("backend/app.py").read_text(encoding="utf-8")
        status_block = api[api.index('@app.route("/status/'):]
        status_block = status_block[:status_block.index("@app.route", 10)]
        assert "error_internal" not in status_block
