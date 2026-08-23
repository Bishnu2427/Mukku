"""Flask extensions instantiated separately from the app.

The limiter lives here so blueprints can decorate their views at definition
time without importing backend.app (which would be circular).

Why this matters: the previous setup called

    limiter.limit("10 per minute")(app.view_functions["auth.api_login"])

after the blueprint was registered. flask-limiter records that under the
function's qualified name (``backend.auth.api_login.api_login``) but resolves
limits at request time by Flask *endpoint* name (``auth.api_login``). The two
never matched, so no limit was ever enforced — verified empirically: 8 requests
against a 5/minute cap all returned 200.

Decorating at definition time registers the endpoint correctly.
"""

import os
import logging

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

logger = logging.getLogger(__name__)


def _storage_uri() -> str:
    """Shared Redis storage when available, per-process memory otherwise.

    In-memory counters are per gunicorn worker, so an N-worker deployment
    allows N× the configured limit. Redis gives one counter for the whole
    fleet, which is what the numbers are supposed to mean.
    """
    explicit = os.getenv("RATELIMIT_STORAGE_URI")
    if explicit:
        return explicit
    if os.getenv("QUEUE_BACKEND", "").strip().lower() == "redis":
        redis_url = os.getenv("REDIS_URL")
        if redis_url:
            return redis_url
    return "memory://"


limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],          # no global cap — only the endpoints below
    storage_uri=_storage_uri(),
    strategy="fixed-window",
    headers_enabled=True,       # emit X-RateLimit-* so clients can back off
)

def safe_int(value, default: int, lo: int | None = None, hi: int | None = None) -> int:
    """Coerce untrusted input to a bounded int, never raising.

    OWASP A03/A05: `int(request.args.get("page", 1))` raises ValueError on
    "abc" and Flask turns that into a 500 with a stack trace. Callers pass a
    default and a range instead, so hostile input degrades to a sane value.
    """
    try:
        n = int(value)
    except (TypeError, ValueError):
        return default
    if lo is not None and n < lo:
        return lo
    if hi is not None and n > hi:
        return hi
    return n


# Applied with @limiter.limit(...) at each view definition.
LIMIT_LOGIN           = "10 per minute"
LIMIT_OTP             = "10 per minute"
LIMIT_REGISTER        = "5 per minute"
LIMIT_FORGOT_PASSWORD = "5 per minute"
LIMIT_RESET_PASSWORD  = "5 per minute"
# /enquiry was previously unlimited: an unauthenticated endpoint that sends
# email is a spam relay without a cap.
LIMIT_ENQUIRY         = "5 per minute"
