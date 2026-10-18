"""Job dispatch.

Regression guard for a bug that was invisible in production: the RQ job id
contained a colon, RQ rejects that, every enqueue raised, and the broad
`except` downgraded each render to an in-process thread. The queue reported
healthy, the worker container reported healthy, and no error surfaced — the
only symptom was that renders silently stopped surviving restarts.
"""

import re

import pytest

from services import job_queue


class TestJobId:
    """RQ requires job ids to match [A-Za-z0-9_-]+ — colons are reserved for
    its own Redis key namespacing."""

    VALID = re.compile(r"^[A-Za-z0-9_-]+$")

    @pytest.mark.parametrize("project_id", [
        "abc1234567", "e2ead0f6d6", "dep1a2b3c4", "0123456789",
    ])
    def test_generated_job_id_is_acceptable_to_rq(self, project_id):
        from pathlib import Path
        src = Path("services/job_queue.py").read_text(encoding="utf-8")
        m = re.search(r'job_id=f"([^"]+)"', src)
        assert m, "job_id pattern not found in job_queue.py"
        rendered = m.group(1).replace("{project_id}", project_id)
        assert self.VALID.match(rendered), (
            f"job id {rendered!r} contains characters RQ rejects — every "
            f"enqueue would raise and silently fall back to a thread"
        )

    def test_job_id_has_no_colon(self):
        from pathlib import Path
        src = Path("services/job_queue.py").read_text(encoding="utf-8")
        m = re.search(r'job_id=f"([^"]+)"', src)
        assert ":" not in m.group(1), "RQ rejects ':' in job ids"


class TestBackendSelection:
    def test_defaults_to_thread_without_configuration(self, monkeypatch):
        monkeypatch.delenv("QUEUE_BACKEND", raising=False)
        assert job_queue.backend_name() == "thread"

    def test_redis_selected_when_configured(self, monkeypatch):
        monkeypatch.setenv("QUEUE_BACKEND", "redis")
        assert job_queue.backend_name() == "redis"

    def test_thread_backend_reports_itself_as_not_durable(self, monkeypatch):
        monkeypatch.delenv("QUEUE_BACKEND", raising=False)
        h = job_queue.queue_health()
        assert h["backend"] == "thread"
        assert "not durable" in h["detail"]


class TestStrictMode:
    def test_strict_mode_raises_instead_of_hiding_the_problem(self, monkeypatch):
        """QUEUE_STRICT exists precisely so this class of bug cannot hide.
        With it on, a broken queue fails loudly at enqueue time."""
        monkeypatch.setenv("QUEUE_BACKEND", "redis")
        monkeypatch.setenv("QUEUE_STRICT", "true")
        monkeypatch.setenv("REDIS_URL", "redis://127.0.0.1:1/0")   # nothing there
        with pytest.raises(Exception):
            job_queue.enqueue_pipeline("abc123", "a prompt", {"duration": 30}, [])

    def test_without_strict_it_degrades_rather_than_failing_the_request(self, monkeypatch):
        monkeypatch.setenv("QUEUE_BACKEND", "redis")
        monkeypatch.setenv("QUEUE_STRICT", "false")
        monkeypatch.setenv("REDIS_URL", "redis://127.0.0.1:1/0")

        called = {}

        def fake_thread(*_a, **_k):
            called["fallback"] = True
            return "thread:abc123"

        monkeypatch.setattr(job_queue, "_run_in_thread", fake_thread)
        ref = job_queue.enqueue_pipeline("abc123", "a prompt", {"duration": 30}, [])
        assert called.get("fallback"), "should fall back rather than 500 the user"
        assert ref.startswith("thread")
