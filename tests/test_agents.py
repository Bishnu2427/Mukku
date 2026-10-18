"""LLM provider configuration.

Regression guard for a failure that was live in production: Groq retired
`llama-3.3-70b-versatile`, every call 404'd, and because the agents catch all
exceptions and fall back to a hardcoded template, the symptom was not an error
— it was every user silently receiving generic filler instead of a script.

Nothing here calls a paid API by default. The live check is opt-in via
MUKKU_LIVE_LLM=1 so CI stays fast and free.
"""

import os
import re
from pathlib import Path

import pytest

AGENTS = ["agents/prompt_agent.py", "agents/script_agent.py", "agents/scene_agent.py"]

# Models Groq has retired. Any of these appearing as a default is a bug.
RETIRED = [
    "llama-3.3-70b-versatile",
    "llama-3.1-70b-versatile",
    "mixtral-8x7b-32768",
    "gemma-7b-it",
]


class TestModelConfiguration:
    @pytest.mark.parametrize("path", AGENTS)
    def test_model_is_env_configurable(self, path):
        """A retirement should be an env change, not a code change."""
        src = Path(path).read_text(encoding="utf-8")
        assert 'os.getenv("GROQ_MODEL"' in src, (
            f"{path} hardcodes GROQ_MODEL — a provider retirement would need a "
            f"redeploy to fix"
        )

    @pytest.mark.parametrize("path", AGENTS)
    def test_no_retired_model_as_default(self, path):
        src = Path(path).read_text(encoding="utf-8")
        # Only inspect the default inside getenv, not comments explaining history.
        m = re.search(r'os\.getenv\(\s*"GROQ_MODEL"\s*,\s*"([^"]+)"', src)
        assert m, f"{path}: could not read the GROQ_MODEL default"
        assert m.group(1) not in RETIRED, (
            f"{path} defaults to retired model {m.group(1)}"
        )

    def test_all_agents_agree_on_the_model(self):
        """Three agents drifting apart means two of them break silently."""
        defaults = set()
        for path in AGENTS:
            src = Path(path).read_text(encoding="utf-8")
            m = re.search(r'os\.getenv\(\s*"GROQ_MODEL"\s*,\s*"([^"]+)"', src)
            defaults.add(m.group(1) if m else None)
        assert len(defaults) == 1, f"agents disagree on GROQ_MODEL: {defaults}"


class TestFallbackChain:
    def test_prompt_agent_falls_back_rather_than_raising(self, monkeypatch):
        """Degrading is correct — but it must degrade, not crash."""
        monkeypatch.setenv("OLLAMA_URL", "http://127.0.0.1:1")
        monkeypatch.setenv("GROQ_API_KEY", "")
        import importlib
        import agents.prompt_agent as pa
        importlib.reload(pa)

        out = pa.understand_prompt("A short explainer about hydration.")
        assert out["duration"] == 60
        assert out["key_points"], "fallback must still provide key points"

    def test_fallback_is_distinguishable_from_a_real_answer(self, monkeypatch):
        """The bug was invisible because fallback output looks plausible.
        Assert the fallback echoes the prompt, so a monitor can detect it."""
        monkeypatch.setenv("OLLAMA_URL", "http://127.0.0.1:1")
        monkeypatch.setenv("GROQ_API_KEY", "")
        import importlib
        import agents.prompt_agent as pa
        importlib.reload(pa)

        prompt = "A short explainer about hydration."
        assert pa.understand_prompt(prompt)["topic"].startswith(prompt[:20])


@pytest.mark.skipif(
    os.getenv("MUKKU_LIVE_LLM") != "1",
    reason="live API check; set MUKKU_LIVE_LLM=1 to run",
)
class TestLiveProvider:
    def test_configured_model_exists_on_groq(self):
        import requests
        key = os.getenv("GROQ_API_KEY", "")
        if not key:
            pytest.skip("GROQ_API_KEY not set")

        r = requests.get(
            "https://api.groq.com/openai/v1/models",
            headers={"Authorization": f"Bearer {key}"}, timeout=20,
        )
        r.raise_for_status()
        available = {m["id"] for m in r.json().get("data", [])}

        import agents.prompt_agent as pa
        assert pa.GROQ_MODEL in available, (
            f"{pa.GROQ_MODEL} is not available on this Groq account. "
            f"Available: {sorted(available)}"
        )
