"""Project ownership, deletion, and cost accounting."""

import os
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture()
def owned_project(db, make_user):
    """A completed project belonging to a user, with real files on disk."""
    def _make(user, pid="proj0001", status="completed", with_files=True):
        video = ROOT / "media" / "videos" / f"{pid}_final.mp4"
        if with_files:
            for folder, name in [
                ("videos", f"{pid}_final.mp4"),
                ("images", f"{pid}_scene01.png"),
                ("clips",  f"{pid}_scene01.mp4"),
                ("audio",  f"{pid}_scene01.wav"),
                ("thumbs", f"{pid}.jpg"),
            ]:
                d = ROOT / "media" / folder
                d.mkdir(parents=True, exist_ok=True)
                (d / name).write_bytes(b"test")
            up = ROOT / "media" / "uploads" / pid
            up.mkdir(parents=True, exist_ok=True)
            (up / "photo.jpg").write_bytes(b"test")
        db["projects"].insert_one({
            "project_id": pid, "user_id": user["user_id"], "prompt": "test",
            "status": status, "progress": 100,
            "video_path": str(video) if with_files else None,
        })
        created.append(pid)
        return pid

    created: list[str] = []
    yield _make

    # Tests must not leave rubbish in the real media tree. Anything a test
    # created and did not delete is removed here.
    import shutil, glob as _glob
    for pid in created:
        for folder in ("videos", "images", "clips", "audio", "music", "thumbs"):
            for f in _glob.glob(str(ROOT / "media" / folder / f"{pid}*")):
                try: os.remove(f)
                except OSError: pass
        up = ROOT / "media" / "uploads" / pid
        if up.is_dir():
            shutil.rmtree(up, ignore_errors=True)


class TestOwnership:
    def test_owner_can_read_status(self, auth_client, make_user, owned_project):
        u = make_user(); c = auth_client(u); pid = owned_project(u)
        assert c.get(f"/status/{pid}").status_code == 200

    def test_other_user_cannot_read_status(self, client, auth_client, make_user, owned_project):
        owner = make_user(email="owner@example.com")
        pid = owned_project(owner)
        intruder = make_user(email="intruder@example.com")
        c = auth_client(intruder)
        assert c.get(f"/status/{pid}").status_code == 404

    def test_thumbnail_is_not_public(self, client, make_user, owned_project):
        """Regression: /thumbnail had no ownership check at all (OWASP A01)."""
        owner = make_user(email="owner2@example.com")
        pid = owned_project(owner)
        assert client.get(f"/thumbnail/{pid}").status_code == 404

    def test_video_is_not_public(self, client, make_user, owned_project):
        owner = make_user(email="owner3@example.com")
        pid = owned_project(owner)
        assert client.get(f"/video/{pid}").status_code == 404


class TestDeletion:
    def test_owner_can_delete(self, auth_client, make_user, owned_project, db):
        u = make_user(); c = auth_client(u); pid = owned_project(u)
        r = c.delete(f"/projects/{pid}")
        assert r.status_code == 200
        assert db["projects"].count_documents({"project_id": pid}) == 0

    def test_delete_removes_every_artefact(self, auth_client, make_user, owned_project):
        """Erasure must be real — DPDP grants a right to erasure and
        media/uploads/ holds user-supplied photographs."""
        u = make_user(); c = auth_client(u); pid = owned_project(u)
        c.delete(f"/projects/{pid}")
        leftovers = []
        for folder, name in [
            ("videos", f"{pid}_final.mp4"), ("images", f"{pid}_scene01.png"),
            ("clips", f"{pid}_scene01.mp4"), ("audio", f"{pid}_scene01.wav"),
            ("thumbs", f"{pid}.jpg"),
        ]:
            p = ROOT / "media" / folder / name
            if p.exists():
                leftovers.append(str(p))
        if (ROOT / "media" / "uploads" / pid).exists():
            leftovers.append(f"uploads/{pid}")
        assert not leftovers, f"files survived deletion: {leftovers}"

    def test_cannot_delete_someone_elses_project(self, auth_client, make_user, owned_project, db):
        owner = make_user(email="o@example.com")
        pid = owned_project(owner)
        intruder = make_user(email="i@example.com")
        c = auth_client(intruder)
        assert c.delete(f"/projects/{pid}").status_code == 404
        assert db["projects"].count_documents({"project_id": pid}) == 1

    def test_cannot_delete_while_rendering(self, auth_client, make_user, owned_project):
        """Deleting mid-render would leave the worker writing to removed paths."""
        u = make_user(); c = auth_client(u)
        pid = owned_project(u, pid="proj_busy", status="processing")
        assert c.delete(f"/projects/{pid}").status_code == 409

    def test_delete_requires_auth(self, client, make_user, owned_project):
        u = make_user(); pid = owned_project(u)
        assert client.delete(f"/projects/{pid}").status_code == 404


class TestCostAccounting:
    def test_veo_dominates_the_rate_card(self):
        """The pricing decision this exists to inform."""
        from services.cost import estimate
        veo = estimate("veo", seconds=8)
        leo = estimate("leonardo", images=1)
        assert veo > leo * 100, (
            f"one 8s Veo clip (${veo:.2f}) should dwarf one image (${leo:.4f})"
        )

    def test_fallback_paths_are_free(self):
        from services.cost import estimate
        for p in ("ken_burns", "placeholder", "gtts", "pyttsx3", "piper"):
            assert estimate(p, clips=1, images=1) == 0.0, f"{p} must cost nothing"

    def test_unknown_provider_does_not_explode(self):
        from services.cost import estimate
        assert estimate("some-new-provider", clips=1) == 0.0

    def test_record_accumulates_on_the_project(self, db):
        from services import cost
        db["projects"].insert_one({"project_id": "costtest", "status": "processing"})
        cost.record("costtest", "generating_images", "leonardo", images=1)
        cost.record("costtest", "generating_clips", "veo", seconds=8)
        doc = db["projects"].find_one({"project_id": "costtest"})
        assert len(doc["cost_lines"]) == 2
        assert doc["cost_usd"] > 3.0, "a Veo clip should push the render past $3"

    def test_record_never_raises(self):
        """Cost accounting must not be able to fail a render."""
        from services import cost
        assert cost.record("does-not-exist", "stage", "veo", seconds=8) >= 0

    def test_summarise_groups_by_stage_and_provider(self, db):
        from services import cost
        db["projects"].insert_one({"project_id": "sumtest", "status": "processing"})
        cost.record("sumtest", "generating_images", "leonardo", images=1)
        cost.record("sumtest", "generating_images", "leonardo", images=1)
        cost.record("sumtest", "generating_clips", "ken_burns", clips=1)
        s = cost.summarise(db["projects"].find_one({"project_id": "sumtest"}))
        assert s["line_count"] == 3
        assert set(s["by_stage"]) == {"generating_images", "generating_clips"}
        assert s["by_provider"]["ken_burns"] == 0.0
