# Mukku AI Studio — Text → Professional Video Generator

A full-stack web application that transforms a single text prompt into a complete, downloadable MP4 video using an 8-stage AI pipeline. Supports 8 social platforms, 12 Indian languages, user media uploads, multi-user authentication with email 2FA, and an admin panel.

---

## Pipeline Overview

```
User Prompt + Settings + (optional) Media Uploads
        │
        ▼
Stage 1 — Prompt Analysis        (Ollama LLM / Groq)
        │  → topic, tone, duration, language
        ▼
Stage 2 — Script Generation      (Ollama LLM / Groq)
        │  → full narration script
        ▼
Stage 3 — Scene Planning         (Ollama LLM / Groq)
        │  → scenes with visual prompts + narration per scene
        ▼
Stage 4 — Image Generation       (Leonardo.ai API)  ← parallel
        │  → one image per scene (or user-uploaded photo)
        ▼
Stage 5 — Clip Animation         (Kling.ai / Pollo.ai / Gemini Veo)  ← parallel
        │  → animated video clip per scene (or user-uploaded video)
        ▼
Stage 6 — Voiceover Synthesis    (pyttsx3 / gTTS)  ← parallel
        │  → narration audio per scene (12+ languages)
        ▼
Stage 7 — Music Composition      (Suno API)  ← background thread
        │  → AI-generated background music track
        ▼
Stage 8 — Video Assembly         (MoviePy + FFmpeg)
        │  → merge clips + voices + music → final MP4
        ▼
     Final Video (MP4) — ready for download
```

---

## Features

- **Creator Studio UI** — unified composer with drag-and-drop media attachment and live char count
- **Platform Presets** — one-click config for YouTube, YouTube Shorts, TikTok, Instagram Reels, IG Post, LinkedIn, X
- **User Authentication** — register, login, forgot/reset password with secure JWT session cookies
- **Email 2FA (OTP)** — 6-digit one-time code sent to email on every login; burns after 3 wrong attempts
- **Account Lockout** — 5 failed login attempts triggers a 15-minute lockout
- **Admin Panel** — user management, project oversight, session tracking, login history
- **User Media Upload** — attach your own photos/videos; they replace AI-generated scenes (up to 10 files, 50 MB each)
- **12 Indian Languages** — English, Hindi, Bengali, Telugu, Marathi, Tamil, Gujarati, Kannada, Malayalam, Punjabi, Odia, Assamese
- **Live Progress View** — shimmer skeleton preview during early stages, then smooth fade-in of generated script and scene breakdown
- **Aspect Ratios** — 16:9 Landscape, 9:16 Vertical, 1:1 Square
- **Edit & Remake** — tweak prompt and settings on the result page and regenerate without going back
- **Project Dashboard** — browse and replay all previously generated videos
- **Security Hardened** — CSP headers, rate limiting, NoSQL injection protection, XSS-safe templating, SameSite=Strict cookies

---

## Prerequisites

### 1. MongoDB
```bash
# Download: https://www.mongodb.com/try/download/community
mongod --dbpath /data/db
```

### 2. Ollama (local LLM)
```bash
# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows: download installer from https://ollama.com/

ollama pull llama3       # default model
# alternatives: mistral, phi3, gemma3
```

### 3. FFmpeg
| OS | Command |
|----|---------|
| Windows | Download from https://ffmpeg.org/download.html and add to PATH |
| Linux | `sudo apt install ffmpeg` |
| macOS | `brew install ffmpeg` |

### 4. Python 3.10 – 3.11
> Python 3.12+ is supported but Coqui TTS is not compatible with it.

---

## Installation

```bash
# 1. Clone and enter the project
cd Mukku

# 2. Create and activate virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
source venv/bin/activate       # Linux/macOS

# 3. Install dependencies
pip install -r requirements.txt

# For GPU-accelerated image generation (recommended):
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
# CPU-only (slow):
pip install torch torchvision

# 4. Configure environment
cp .env.example .env           # then edit .env with your keys
```

---

## Configuration (.env)

### Core

| Variable | Default | Description |
|----------|---------|-------------|
| `FLASK_PORT` | `7000` | Web server port |
| `FLASK_DEBUG` | `false` | Enable Flask debug mode — **set false in production** |
| `APP_URL` | `http://localhost:7000` | Public URL — set to `https://...` in production to enable HSTS and Secure cookies |
| `JWT_SECRET` | `change-me-in-production` | **Required** — use a 64-char random string in production |

### Database

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGO_URI` | `mongodb://localhost:27017/` | MongoDB connection string |
| `MONGO_DB` | `ai_content_agent` | Database name |

### LLM

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API base URL |
| `OLLAMA_MODEL` | `llama3` | Local LLM model name |
| `GROQ_API_KEY` | — | Groq API key — fallback if Ollama is unavailable |

### Image / Video / Music APIs

| Variable | Description |
|----------|-------------|
| `LEONARDO_API` | Leonardo.ai API key — image generation |
| `KLING_ACCESS_KEY` | Kling.ai access key — video clip animation |
| `KLING_SECRET_KEY` | Kling.ai secret key |
| `POLLO_API` | Pollo.ai API key (alternative video generator) |
| `GEMINI_API_KEY` | Google Gemini API key (Veo video / fallback LLM) |
| `SUNO_API_KEY` | Suno API key — AI music generation |

### Voice

| Variable | Default | Description |
|----------|---------|-------------|
| `TTS_ENGINE` | `pyttsx3` | `pyttsx3` \| `gtts` \| `auto` — **use `gtts` on Linux** |

### Email (required for 2FA OTP)

| Variable | Default | Description |
|----------|---------|-------------|
| `SMTP_SERVER` | `smtp.gmail.com` | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USERNAME` | — | Sender email address |
| `SMTP_PASSWORD` | — | SMTP password / app password |

### Production extras

| Variable | Default | Description |
|----------|---------|-------------|
| `TRUST_PROXY` | `false` | Set `true` if behind nginx/Cloudflare (enables X-Forwarded-For) |

> API keys are all optional — the pipeline falls back gracefully when a service is unavailable.

---

## Running the App

### Development
```bash
python run.py
```
Open **http://localhost:7000** in your browser.

### Production (Linux — Gunicorn)
```bash
pip install gunicorn

gunicorn "backend.app:app" \
  --config deploy/gunicorn.conf.py
```

> Keep `workers = 2` — each worker loads the Stable Diffusion model into RAM separately.

---

## Deploying to Oracle Cloud (Always Free — ARM Ampere)

Oracle's Always Free tier gives you **4 ARM vCPUs + 24 GB RAM + 200 GB storage** — enough to run Ollama + the full pipeline at no cost.

### Why Oracle ARM works
| Concern | Answer |
|---------|--------|
| LLM (Ollama + llama3) | 24 GB RAM is plenty — runs comfortably |
| Video assembly (MoviePy) | CPU-heavy Stage 8 needs real CPUs; ARM Ampere delivers |
| Image generation (SD) | CPU-only on ARM — **use Leonardo.ai API instead** for speed |
| Storage | 200 GB free — generous for `media/` files |

### Step 1 — Create the instance
1. Sign up at [cloud.oracle.com](https://cloud.oracle.com) (free tier, no credit card charge)
2. Create Instance → **VM.Standard.A1.Flex** → 4 OCPUs, 24 GB RAM
3. Choose **Ubuntu 22.04 (aarch64)**
4. Add your SSH key, open port 7000 in the Security List (or 80/443 if using nginx)

### Step 2 — Automated setup
```bash
# On the Oracle server
git clone <your-repo-url> /opt/mukku
cd /opt/mukku
bash deploy/setup.sh
```

The script installs: Python, FFmpeg, Ollama (pulls llama3), creates a `mukku` system user, registers the systemd service, and sets up the daily cleanup cron job.

### Step 3 — Configure .env
```bash
sudo nano /opt/mukku/.env
```

Minimum required settings for Oracle:
```bash
# Core
APP_URL=http://<your-oracle-public-ip>:7000
JWT_SECRET=<run: python3 -c "import secrets; print(secrets.token_hex(32))">
FLASK_DEBUG=false

# Database — use MongoDB Atlas (offloads DB from your server RAM)
MONGO_URI=mongodb+srv://<user>:<pass>@cluster0.xxxxx.mongodb.net/
MONGO_DB=mukku

# LLM — Ollama running locally on the same server
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3

# TTS — REQUIRED on Linux, pyttsx3 won't work
TTS_ENGINE=gtts

# SMTP — for 2FA OTP emails
SMTP_USERNAME=you@gmail.com
SMTP_PASSWORD=<gmail-app-password>

# Image generation — Leonardo.ai API is much faster than SD on ARM CPU
LEONARDO_API=<your-key>

# Groq as LLM fallback if Ollama is overloaded
GROQ_API_KEY=<your-key>
```

### Step 4 — Start
```bash
sudo systemctl start mukku
sudo systemctl status mukku
sudo journalctl -u mukku -f   # live logs
```

### Step 5 — (Optional) nginx + SSL
```bash
sudo apt install nginx certbot python3-certbot-nginx -y

# /etc/nginx/sites-available/mukku
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass         http://127.0.0.1:7000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;   # video assembly can take minutes
        client_max_body_size 55M;  # match upload limit
    }
}

sudo certbot --nginx -d yourdomain.com
```

Then update `.env`:
```bash
APP_URL=https://yourdomain.com
TRUST_PROXY=true
```

### Media cleanup
Generated files are automatically deleted by a daily cron job ([cleanup_media.py](cleanup_media.py)):
- `images/`, `clips/`, `audio/` → deleted after **24 hours**
- `music/`, `videos/`, `thumbs/` → deleted after **72 hours**
- `uploads/` (user files) → **never auto-deleted**

Test it manually:
```bash
python cleanup_media.py --dry-run   # see what would be deleted
python cleanup_media.py             # actually delete
```

### ARM-specific notes
| Item | Action |
|------|--------|
| PyTorch | CPU-only build installed by `setup.sh` — no CUDA on ARM free tier |
| Stable Diffusion | Very slow on ARM CPU (~5 min/image) — set `LEONARDO_API` to use the cloud instead |
| pyttsx3 | Will fail — `TTS_ENGINE=gtts` is required |
| Ollama | Native ARM support — works great |
| FFmpeg | Installed via `apt` — `imageio_ffmpeg` falls back to system binary cleanly |

---

## Hybrid Setup (if Oracle is unavailable in your region)

| Component | Host | Notes |
|-----------|------|-------|
| Flask API | [Render.com](https://render.com) free tier | Deploy from GitHub |
| LLM | Groq API | Set `GROQ_API_KEY` — already supported, 10× faster than local |
| Database | MongoDB Atlas M0 | Free, managed |
| Storage | Keep on Render | Ephemeral — videos deleted on redeploy; pair with S3 for persistence |

Set `GROQ_API_KEY` and leave `OLLAMA_URL` unset — the agents fall back to Groq automatically when Ollama is unreachable.

---

## Project Structure

```
Mukku/
│
├── run.py                        ← entry point (dev)
├── cleanup_media.py              ← deletes old generated files (cron daily)
├── .env                          ← environment config
├── requirements.txt
│
├── deploy/
│   ├── setup.sh                  ← one-shot Oracle Cloud ARM setup script
│   ├── mukku.service             ← systemd unit file
│   └── gunicorn.conf.py          ← Gunicorn production config
│
├── frontend/
│   ├── landing.html              ← public landing page with enquiry form
│   ├── index.html                ← Creator Studio UI
│   ├── dashboard.html            ← user project dashboard
│   ├── login.html                ← sign in (step 1: password, step 2: OTP)
│   ├── register.html             ← create account
│   ├── forgot-password.html      ← request password reset
│   ├── reset-password.html       ← set new password via email link
│   └── admin.html                ← admin panel
│
├── backend/
│   ├── app.py                    ← Flask app, routes, security headers, rate limits
│   ├── auth.py                   ← auth blueprint (login, register, 2FA OTP, sessions)
│   └── admin_api.py              ← admin blueprint (user/project/session management)
│
├── agents/
│   ├── prompt_agent.py           ← analyzes prompt → topic, tone, duration
│   ├── script_agent.py           ← writes full narration script
│   └── scene_agent.py            ← breaks script into visual scenes
│
├── generators/
│   ├── image_generator.py        ← Leonardo.ai (Stable Diffusion fallback)
│   ├── video_generator.py        ← Kling.ai / Pollo.ai / Gemini Veo + FFmpeg assembly
│   ├── voice_generator.py        ← pyttsx3 / gTTS (12 languages)
│   └── music_generator.py        ← Suno API
│
├── services/
│   └── pipeline_manager.py       ← orchestrates all 8 stages in background thread
│
├── database/
│   ├── mongo_connection.py       ← project CRUD helpers
│   └── user_model.py             ← users, sessions, OTP tokens, login history, lockouts
│
└── media/
    ├── images/                   ← generated scene images
    ├── clips/                    ← generated scene video clips
    ├── audio/                    ← generated narration WAVs
    ├── music/                    ← generated music tracks
    ├── videos/                   ← final assembled MP4s
    ├── thumbs/                   ← auto-generated video thumbnails
    └── uploads/                  ← user-uploaded media (per project)
```

---

## API Reference

### Video Generation

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/generate` | Start generation. Accepts `application/json` or `multipart/form-data` |
| `GET` | `/status/{id}` | Poll progress — returns step, progress %, script, scenes |
| `GET` | `/video/{id}` | Stream the final MP4 |
| `GET` | `/video/{id}?download=true` | Download the MP4 |
| `GET` | `/thumbnail/{id}` | JPEG thumbnail of first frame |
| `GET` | `/projects` | List recent projects |
| `GET` | `/health` | Health check |

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Step 1 — verify credentials, receive `otp_token` |
| `POST` | `/api/auth/verify-otp` | Step 2 — verify OTP code, receive session cookie |
| `POST` | `/api/auth/logout` | Invalidate session |
| `GET` | `/api/auth/me` | Current user info |
| `POST` | `/api/auth/forgot-password` | Send password reset email |
| `POST` | `/api/auth/reset-password` | Set new password via reset token |
| `POST` | `/api/auth/change-password` | Change password (authenticated) |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/users` | List users (paginated, searchable) |
| `PATCH` | `/api/admin/users/{id}` | Update user (role, plan, active status) |
| `DELETE` | `/api/admin/users/{id}` | Delete user |
| `GET` | `/api/admin/projects` | List all projects |
| `GET` | `/api/admin/sessions` | Active sessions |
| `DELETE` | `/api/admin/sessions/{id}` | Revoke a session |
| `GET` | `/api/admin/login-history` | Global login history |
| `GET` | `/api/admin/stats` | Platform stats |

### POST /generate — JSON body
```json
{
  "prompt": "Create a tutorial on healthy meal prep...",
  "settings": {
    "duration": 60,
    "tone": "educational",
    "image_style": "photorealistic",
    "aspect_ratio": "16:9",
    "voice_gender": "auto",
    "include_music": true,
    "language": "en",
    "platform": "youtube"
  }
}
```

### POST /generate — multipart/form-data (with media uploads)
```
prompt       → string
settings     → JSON string
user_media   → file (repeat for each file, max 10 files × 50 MB)
```

---

## Authentication Flow

```
1. User submits email + password
        │
        ▼
   Server verifies credentials + checks lockout
        │
        ├─ 5+ failed attempts in 15 min → 429 Locked out
        │
        ▼
   6-digit OTP generated, bcrypt-hashed, stored (10 min TTL)
   OTP sent to user's email
        │
        ▼
   User submits OTP code
        │
        ├─ 3 wrong attempts → OTP burned, start again
        │
        ▼
   Session cookie issued (JWT, SameSite=Strict)
   remember-me extends session to 7 days
```

**Password requirements:** 8+ characters, at least one uppercase letter, one number, and one special character.

---

## TTS Engine Options

| Engine | Quality | Requires Internet | Notes |
|--------|---------|-------------------|-------|
| `pyttsx3` | ★★★☆☆ | No | Uses OS built-in voices; instant; **Windows only** |
| `gtts` | ★★★★☆ | Yes | Google TTS; best for Indian language voices; works on Linux |
| `auto` | — | — | Tries pyttsx3 first, falls back to gTTS |

> **Linux users:** set `TTS_ENGINE=gtts` in `.env`. `pyttsx3` relies on Windows SAPI voices and will fail.

---

## Platform Presets

| Platform | Aspect Ratio | Duration | Tone |
|----------|-------------|----------|------|
| YouTube | 16:9 | 2 min | Educational |
| YouTube Shorts | 9:16 | 1 min | Entertaining |
| TikTok | 9:16 | 1 min | Entertaining |
| Instagram Reels | 9:16 | 30s | Casual |
| Instagram Post | 1:1 | 1 min | Professional |
| LinkedIn | 16:9 | 90s | Professional |
| X (Twitter) | 16:9 | 1 min | Casual |

---

## Security

- **Rate limiting** — 10 req/min on login/OTP, 5 req/min on register/forgot-password
- **Brute-force lockout** — 5 failed login attempts → 15-minute lockout per email
- **Security headers** — CSP, X-Frame-Options: DENY, X-Content-Type-Options, Referrer-Policy, HSTS (when HTTPS)
- **CORS** — restricted to `APP_URL` only
- **Cookies** — SameSite=Strict, Secure flag when served over HTTPS
- **NoSQL injection** — all user input used in MongoDB `$regex` is escaped; role/plan/status values are whitelisted
- **XSS** — all dynamic content rendered through an `esc()` helper; no raw `innerHTML` with user data
- **File uploads** — extension whitelist (jpg, png, gif, webp, mp4, mov, wav, mp3), 50 MB size cap, UUID-prefixed filenames
- **Password hashing** — bcrypt with auto-scaling work factor
- **OTP storage** — stored as bcrypt hash, never plaintext; TTL-indexed for automatic expiry

---

## Roadmap

- [x] Multi-language voiceovers (12 Indian languages)
- [x] Social platform presets
- [x] User media upload (photos + videos)
- [x] Live progress skeleton preview
- [x] Edit & Remake panel
- [x] Project dashboard
- [x] User authentication (register / login / reset password)
- [x] Email 2FA OTP on login
- [x] Admin panel (user, project, session management)
- [x] Security hardening (rate limits, lockout, CSP, XSS, NoSQL injection)
- [ ] AI avatars with lip-sync
- [ ] Auto subtitle / caption generation
- [ ] Direct social media publishing
- [ ] Custom voice cloning
