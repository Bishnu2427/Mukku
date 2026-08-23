"""Job dispatch for the video pipeline.

Two backends, chosen by QUEUE_BACKEND:

  thread  (default)  Runs run_pipeline in an in-process daemon thread. Zero
                     infrastructure, fine for local development, but a process
                     restart loses every in-flight render.

  redis              Enqueues onto Redis via RQ. A separate worker process owns
                     execution, so restarting the web tier never kills a render
                     and jobs survive a crash. This is the production path.

Both write progress to MongoDB exactly the same way, so the frontend polling
GET /status/{id} cannot tell the difference.

If QUEUE_BACKEND=redis but Redis is unreachable, dispatch falls back to a
thread and logs loudly rather than failing the user's request. Set
QUEUE_STRICT=true to raise instead — appropriate once you rely on durability.
"""

import os
import logging
import threading

logger = logging.getLogger(__name__)

# Import path RQ uses to resolve the job in the worker process. Must stay a
# module-level function so the worker can import it without side effects.
PIPELINE_TASK = "services.pipeline_manager.run_pipeline"

QUEUE_NAME = os.getenv("RQ_QUEUE", "mukku")

# A 5-minute video can legitimately take ~20 minutes. Give it an hour, then
# treat it as hung so a stuck render cannot occupy a worker forever.
JOB_TIMEOUT = int(os.getenv("JOB_TIMEOUT_SECONDS", "3600"))

# Keep finished/failed jobs briefly for debugging; Mongo is the source of truth.
RESULT_TTL = int(os.getenv("JOB_RESULT_TTL", "3600"))
FAILURE_TTL = int(os.getenv("JOB_FAILURE_TTL", "86400"))


def backend_name() -> str:
    return os.getenv("QUEUE_BACKEND", "thread").strip().lower()


def redis_url() -> str:
    return os.getenv("REDIS_URL", "redis://localhost:6379/0")


def _get_queue():
    """Return an RQ Queue, or raise if Redis is not reachable."""
    from redis import Redis
    from rq import Queue

    conn = Redis.from_url(redis_url(), socket_connect_timeout=5)
    conn.ping()  # fail fast rather than at enqueue time
    return Queue(QUEUE_NAME, connection=conn, default_timeout=JOB_TIMEOUT)


def _run_in_thread(project_id, prompt, settings, user_media) -> str:
    from services.pipeline_manager import run_pipeline

    threading.Thread(
        target=run_pipeline,
        args=(project_id, prompt, settings, user_media),
        daemon=True,
        name=f"pipeline-{project_id}",
    ).start()
    return f"thread:{project_id}"


def enqueue_pipeline(project_id: str, prompt: str, settings: dict,
                     user_media: list | None = None) -> str:
    """Dispatch a generation job. Returns an opaque job reference."""
    user_media = user_media or []

    if backend_name() == "redis":
        try:
            q = _get_queue()
            job = q.enqueue(
                PIPELINE_TASK,
                project_id, prompt, settings, user_media,
                job_id=f"pipeline:{project_id}",
                job_timeout=JOB_TIMEOUT,
                result_ttl=RESULT_TTL,
                failure_ttl=FAILURE_TTL,
            )
            logger.info("Project %s queued on Redis (job %s)", project_id, job.id)
            return job.id
        except Exception as exc:
            if os.getenv("QUEUE_STRICT", "false").lower() == "true":
                raise
            logger.error(
                "Redis queue unavailable (%s) — falling back to an in-process "
                "thread for project %s. This render will NOT survive a restart.",
                exc, project_id,
            )

    return _run_in_thread(project_id, prompt, settings, user_media)


def queue_health() -> dict:
    """Reported by /api/admin/health so the queue is visible in the panel."""
    backend = backend_name()
    if backend != "redis":
        return {"backend": "thread", "status": "ok", "detail": "in-process (not durable)"}

    try:
        q = _get_queue()
        from rq import Worker
        workers = Worker.all(queue=q)
        alive = [w for w in workers if w.state != "dead"]
        return {
            "backend": "redis",
            # Queued work with nobody to run it is a real outage, so surface it.
            "status": "ok" if alive else "degraded",
            "queued": q.count,
            "workers": len(alive),
            "detail": "no workers attached" if not alive else f"{len(alive)} worker(s)",
        }
    except Exception as exc:
        return {"backend": "redis", "status": "error", "detail": str(exc)[:120]}
