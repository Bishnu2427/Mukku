"""Shared test fixtures.

Every test runs against an isolated database. Two safeguards make sure a test
run can never touch real user data:

  1. MONGO_DB is switched to a throwaway name before the app imports.
  2. If MUKKU_TEST_MONGO is unset we fall back to mongomock, so the suite runs
     with no MongoDB installed at all (which is what CI does).
"""

import os
import sys
import uuid
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Must be set before backend.app is imported anywhere.
TEST_DB = f"mukku_test_{uuid.uuid4().hex[:8]}"
os.environ["MONGO_DB"] = TEST_DB
os.environ["JWT_SECRET"] = "test-only-" + "0" * 48        # passes length check
os.environ["FLASK_DEBUG"] = "true"                        # allow the weak-secret path
os.environ["QUEUE_BACKEND"] = "thread"
os.environ["SKIP_SD"] = "true"
os.environ.setdefault("APP_URL", "http://localhost:7000")


@pytest.fixture(scope="session", autouse=True)
def _patch_mongo():
    """Point the app at mongomock unless a real test Mongo is provided."""
    if os.getenv("MUKKU_TEST_MONGO"):
        os.environ["MONGO_URI"] = os.environ["MUKKU_TEST_MONGO"]
        yield
        return

    import mongomock
    import database.mongo_connection as mc

    client = mongomock.MongoClient()
    mc._client = client
    mc._db = client[TEST_DB]

    # _get_db() rebuilds from _client when _db is None; pin both.
    def _get_db_patched():
        return client[TEST_DB]

    mc._get_db = _get_db_patched

    # user_model and others captured _get_db at import time in some places.
    import database.user_model as um
    um._get_db = _get_db_patched
    yield


@pytest.fixture()
def db(_patch_mongo):
    from database.mongo_connection import _get_db
    d = _get_db()
    for name in list(d.list_collection_names()):
        d[name].delete_many({})
    return d


@pytest.fixture()
def app(db):
    import backend.app as app_module
    app_module.app.config.update(TESTING=True)
    return app_module.app


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def make_user(db):
    """Create a user directly, bypassing registration and its rate limit."""
    from database.user_model import create_user, update_user
    import bcrypt

    def _make(email="t@example.com", password="Passw0rd!", plan="free",
              role="user", used=0, **extra):
        pw = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        uid = create_user("Test User", email, pw)
        updates = {"plan": plan, "role": role, "videos_this_month": used}
        updates.update(extra)
        update_user(uid, updates)
        from database.user_model import get_user_by_id
        return get_user_by_id(uid)

    return _make


@pytest.fixture()
def auth_client(client, make_user):
    """A test client carrying a valid session cookie for a real user."""
    from backend.auth import _make_token, _make_session_id, _session_expires
    from database.user_model import create_session

    def _login(user):
        sid = _make_session_id()
        create_session(user["user_id"], sid, "127.0.0.1", "pytest",
                       _session_expires(remember=False))
        token = _make_token(user["user_id"], sid, expires_hours=1)
        client.set_cookie("mukku_token", token, domain="localhost")
        return client

    return _login
