# Gunicorn config — Oracle Cloud ARM (4 vCPU, 24 GB RAM)
import multiprocessing

# ── Binding ───────────────────────────────────────────────────────────────────
bind    = "0.0.0.0:7000"
backlog = 512

# ── Workers ───────────────────────────────────────────────────────────────────
# Keep at 2:
#   - Each worker loads Stable Diffusion model into RAM (~2-4 GB per worker)
#   - Pipeline background threads live inside the worker that spawned them
#   - More workers = more RAM wasted on duplicate model loads
workers     = 2
threads     = 4          # I/O concurrency per worker (API calls, DB, file I/O)
worker_class = "gthread"

# ── Timeouts ──────────────────────────────────────────────────────────────────
# Video assembly can take several minutes on CPU-only ARM
timeout          = 600   # 10 minutes — pipeline requests must finish in this time
graceful_timeout = 60
keepalive        = 5

# ── Process naming ────────────────────────────────────────────────────────────
proc_name = "mukku"

# ── Logging ───────────────────────────────────────────────────────────────────
accesslog  = "-"         # stdout → journald
errorlog   = "-"
loglevel   = "info"
access_log_format = '%(h)s "%(r)s" %(s)s %(b)s %(D)sµs'

# ── Performance ───────────────────────────────────────────────────────────────
# Preload the app so workers share loaded modules (saves ~300 MB RAM)
preload_app = True

# Worker recycling — prevents slow memory leaks from long-running SD pipelines
max_requests        = 500
max_requests_jitter = 50
