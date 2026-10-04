# syntax=docker/dockerfile:1.7
# =============================================================================
#  Mukku AI Studio — single-file production image
# =============================================================================
#
#  BUILD
#    docker build -t mukku:latest .
#
#  RUN  (MongoDB Atlas or any reachable Mongo)
#    docker run -d --name mukku -p 7000:7000 \
#      --env-file .env \
#      -v mukku-media:/app/media \
#      --restart unless-stopped \
#      mukku:latest
#
#  The image contains NO secrets. Everything is injected at runtime via
#  --env-file / -e. See the ENV REFERENCE block near the bottom.
#
#  Three stages keep the runtime lean:
#    1. frontend  — Node builds the React SPA into Frontend/dist
#    2. builder   — Python wheels compiled into an isolated virtualenv
#    3. runtime   — slim image with only ffmpeg, fonts, the venv and the app
# =============================================================================


# ─────────────────────────────────────────────────────────────────────────────
#  Stage 1 — build the React SPA
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS frontend

WORKDIR /build

# .npmrc carries legacy-peer-deps=true, required because @react-three/fiber
# declares an optional react-native peer that npm still tries to resolve.
COPY Frontend/package.json Frontend/package-lock.json Frontend/.npmrc ./
RUN npm ci --no-audit --no-fund

COPY Frontend/tsconfig.json Frontend/vite.config.ts Frontend/index.html ./
COPY Frontend/public ./public
COPY Frontend/src ./src

# Fails the build on a type error — a broken bundle must never reach runtime.
RUN npm run build && test -f dist/index.html


# ─────────────────────────────────────────────────────────────────────────────
#  Stage 2 — Python dependencies
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim-bookworm AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1

# Compilers are needed only here; they never reach the runtime image.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential gcc \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .

# Local Stable Diffusion is OFF by default (SKIP_SD=true), and diffusers +
# transformers + accelerate + torch add well over 2 GB for code that never
# runs. Opt in with:  docker build --build-arg WITH_LOCAL_SD=true .
ARG WITH_LOCAL_SD=false

RUN pip install --upgrade pip wheel setuptools && \
    if [ "$WITH_LOCAL_SD" = "true" ]; then \
        echo ">> installing FULL requirements (includes local Stable Diffusion)" && \
        pip install -r requirements.txt && \
        pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu ; \
    else \
        echo ">> installing SLIM requirements (local SD excluded)" && \
        grep -viE '^\s*(diffusers|transformers|accelerate)\b' requirements.txt > /tmp/req.slim.txt && \
        pip install -r /tmp/req.slim.txt ; \
    fi && \
    # gunicorn is not in requirements.txt (deploy/setup.sh installs it
    # separately on bare metal); the container needs it explicitly.
    pip install "gunicorn>=22.0" &&     # moviepy is installed without its dependency metadata so it cannot drag
    # Pillow back down to a CVE-affected 11.x. Its real deps are pinned in
    # requirements.txt and already installed above.
    pip install --no-deps moviepy==2.2.1

# Fail fast if anything the app imports at startup is missing.
RUN python -c "import flask, flask_cors, flask_limiter, pymongo, bcrypt, jwt, \
requests, PIL, moviepy, imageio_ffmpeg, gtts, numpy, gunicorn; print('deps OK')"


# ─────────────────────────────────────────────────────────────────────────────
#  Stage 3 — runtime
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim-bookworm AS runtime

LABEL org.opencontainers.image.title="Mukku AI Studio" \
      org.opencontainers.image.description="Text-to-video AI generator (Flask API + React SPA)" \
      org.opencontainers.image.source="https://github.com/Bishnu2427/Mukku"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    # The rq CLI runs from an installed entry point, so /app is not implicitly
    # importable — the worker needs this to resolve services.pipeline_manager.
    PYTHONPATH=/app \
    # web | worker  — one image, two roles (see CMD at the bottom).
    ROLE=web \
    \
    # ── Runtime defaults. Override any of these with -e / --env-file. ──
    FLASK_PORT=7000 \
    FLASK_DEBUG=false \
    # pyttsx3 drives Windows SAPI and cannot work here — gTTS is required.
    TTS_ENGINE=gtts \
    # Local Stable Diffusion is catastrophically slow on CPU; use the API path.
    SKIP_SD=true \
    # Set true only when behind a proxy you control (nginx, Cloudflare, ALB).
    TRUST_PROXY=false \
    MONGO_DB=ai_content_agent

# Runtime system packages only:
#   ffmpeg            — every clip render, concat, mix and colour grade
#   fonts-dejavu-core — DejaVuSans.ttf, matched by _get_font_path()
#   fonts-noto-core   — NotoSans-Regular.ttf, the first Linux candidate
#   fonts-indic       — Devanagari/Tamil/Telugu/etc. glyphs for burned-in
#                       subtitles in the 11 Indian languages (see NOTE below)
#   tini              — PID 1 that reaps ffmpeg children and forwards SIGTERM
#   curl              — HEALTHCHECK
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        fonts-dejavu-core \
        fonts-noto-core \
        fonts-indic \
        tini \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && ffmpeg -version | head -1

# Run as an unprivileged user.
RUN groupadd --gid 10001 mukku \
 && useradd --uid 10001 --gid mukku --create-home --shell /usr/sbin/nologin mukku

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv

# Application code. Ordered least- to most-frequently-changed for layer reuse.
COPY --chown=mukku:mukku requirements.txt run.py cleanup_media.py ./
COPY --chown=mukku:mukku database/ ./database/
COPY --chown=mukku:mukku agents/ ./agents/
COPY --chown=mukku:mukku generators/ ./generators/
COPY --chown=mukku:mukku services/ ./services/
COPY --chown=mukku:mukku backend/ ./backend/

# The compiled SPA. Flask serves this from Frontend/dist — the capitalisation
# matters on Linux, unlike on Windows.
COPY --from=frontend --chown=mukku:mukku /build/dist ./Frontend/dist

# Media lives on a volume so generated videos survive container replacement.
RUN mkdir -p media/images media/clips media/audio media/music \
             media/videos media/thumbs media/uploads \
 && chown -R mukku:mukku /app/media

VOLUME ["/app/media"]

USER mukku
EXPOSE 7000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${FLASK_PORT}/health" || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]

# Gunicorn settings differ deliberately from deploy/gunicorn.conf.py, which
# targets the bare-metal systemd deployment:
#
#   --workers 2 --threads 8   Generation runs in a background thread inside a
#                             worker, so threads matter more than processes.
#   --timeout 0               A request never blocks on the pipeline (it returns
#                             202 immediately), but assembly threads can run for
#                             many minutes. Any finite timeout risks the worker
#                             being killed mid-render.
#   --max-requests 0          NO worker recycling. deploy/gunicorn.conf.py uses
#                             500 to bound memory growth, but recycling a worker
#                             kills its in-flight pipeline threads and leaves
#                             projects stuck in "processing" forever. Bounded
#                             memory is not worth losing users' renders.
#   --preload off             PyMongo is not fork-safe. Preloading creates the
#                             MongoClient before fork, which can deadlock the
#                             children.
# ROLE=web    → serve the API + SPA
# ROLE=worker → drain the Redis queue and run generation pipelines
#
# Splitting the roles is what makes renders durable: the worker owns execution,
# so redeploying or restarting the web tier can no longer kill a video that is
# halfway through assembly.
# Shell form on purpose: JSON-array form combined with line continuations is
# ambiguous to the Dockerfile parser. tini stays PID 1 via ENTRYPOINT.
#
# ROLE=web    -> serve the API + SPA          (default)
# ROLE=worker -> drain the Redis queue and run generation pipelines
#
# Splitting the roles is what makes renders durable: the worker owns execution,
# so restarting or redeploying the web tier can no longer kill a video that is
# halfway through assembly.
CMD if [ "$ROLE" = "worker" ]; then exec rq worker "${RQ_QUEUE:-mukku}" --url "${REDIS_URL:-redis://redis:6379/0}" --worker-ttl 7200 --name "mukku-worker-$(hostname)"; else exec gunicorn 'backend.app:app' --bind "0.0.0.0:${FLASK_PORT}" --workers "${GUNICORN_WORKERS:-2}" --threads "${GUNICORN_THREADS:-8}" --worker-class gthread --timeout 0 --graceful-timeout 120 --keep-alive 5 --max-requests 0 --access-logfile - --error-logfile - --log-level "${LOG_LEVEL:-info}" --name mukku; fi


# =============================================================================
#  ENV REFERENCE - pass via --env-file .env
# =============================================================================
#  REQUIRED
#    MONGO_URI              mongodb+srv://user:pass@cluster/   (Atlas or host)
#    JWT_SECRET             64-char random:
#                           python -c "import secrets; print(secrets.token_hex(32))"
#    APP_URL                https://yourdomain.com - must be https:// for the
#                           Secure cookie flag and HSTS header to switch on
#
#  DURABILITY (strongly recommended in production)
#    QUEUE_BACKEND=redis    run pipelines on a worker instead of a web thread
#    REDIS_URL              redis://redis:6379/0
#    RATELIMIT_STORAGE_URI  usually the same Redis; gives ONE shared rate-limit
#                           counter across all workers instead of one per worker
#    QUEUE_STRICT=true      fail the request if Redis is down, rather than
#                           silently falling back to a non-durable thread
#    STALE_JOB_MINUTES=45   idle window before an orphaned render is failed
#
#  STRONGLY RECOMMENDED
#    SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD   seeded on first boot
#    SMTP_USERNAME / SMTP_PASSWORD              without SMTP, 2FA cannot send
#                                               its OTP and login fails closed
#
#  AI PROVIDERS (all optional - each stage degrades gracefully)
#    GROQ_API_KEY           LLM fallback when Ollama is unreachable
#    OLLAMA_URL             http://ollama:11434 with the compose stack
#    LEONARDO_API           scene images
#    GEMINI_API_KEY         Veo video clips
#    KLING_ACCESS_KEY / KLING_SECRET_KEY / POLLO_API
#    SUNO_API_KEY           background music
#
#  TUNING
#    GUNICORN_WORKERS=2  GUNICORN_THREADS=8  LOG_LEVEL=info
#    JOB_TIMEOUT_SECONDS=3600   hard cap on a single render
#    TRUST_PROXY=true    only behind a reverse proxy you control
#
# =============================================================================
#  OPERATIONAL NOTES
# =============================================================================
#  1. OLLAMA is a separate multi-GB service and is not in this image. The
#     compose stack ships it as an optional profile:
#       docker compose --profile ollama up -d
#     Otherwise set GROQ_API_KEY, which the agents fall back to automatically.
#
#  2. WITHOUT REDIS the app still runs: dispatch falls back to an in-process
#     thread and rate limits become per-worker. Both are fine for development,
#     neither is durable. Set QUEUE_BACKEND=redis for production.
#
#  3. INTERRUPTED RENDERS are reconciled at startup - any project left in
#     queued/processing with no heartbeat for STALE_JOB_MINUTES is marked
#     failed so users see a real error instead of a frozen progress bar.
#
#  4. MEDIA GROWTH. The compose stack runs cleanup_media.py daily. With the
#     bare Dockerfile, schedule it yourself:
#       docker exec mukku python cleanup_media.py
#
#  5. SUBTITLES need an FFmpeg built with drawtext. imageio-ffmpeg's Linux
#     static build lacks it, so system ffmpeg is installed and selected
#     automatically for subtitle burns. Do not remove it to save image size.
# =============================================================================
