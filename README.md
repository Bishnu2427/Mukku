# Mukku AI Studio — Text → Professional Video Generator

A full-stack web application that transforms a single text prompt into a complete, downloadable MP4 video using an 8-stage AI pipeline. Supports 8 social platforms, 12 Indian languages, user media uploads, and multiple AI providers for images, video clips, voice, and music.

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
- **User Media Upload** — attach your own photos/videos; they replace AI-generated scenes (up to 10 files, 50 MB each)
- **12 Indian Languages** — English, Hindi, Bengali, Telugu, Marathi, Tamil, Gujarati, Kannada, Malayalam, Punjabi, Odia, Assamese
- **Live Progress View** — shimmer skeleton preview during early stages, then smooth fade-in of generated script and scene breakdown
- **Aspect Ratios** — 16:9 Landscape, 9:16 Vertical, 1:1 Square
- **Edit & Remake** — tweak prompt and settings on the result page and regenerate without going back
- **Project Dashboard** — browse and replay all previously generated videos

---

## Prerequisites

### 1. MongoDB
```bash
# Download: https://www.mongodb.com/try/download/community
mongod --dbpath /data/db
```

### 2. Ollama (local LLM)
```bash
# Install: https://ollama.com/
ollama pull gemma3       # default model
# alternatives: llama3, mistral, phi3
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
# source venv/bin/activate     # Linux/macOS

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment
copy .env .env.local            # or edit .env directly
```

---

## Configuration (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGO_URI` | `mongodb://localhost:27017/` | MongoDB connection string |
| `MONGO_DB` | `ai_content_agent` | Database name |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API base URL |
| `OLLAMA_MODEL` | `gemma3:latest` | Local LLM model name |
| `LEONARDO_API` | — | Leonardo.ai API key — image generation |
| `KLING_ACCESS_KEY` | — | Kling.ai access key — video clip animation |
| `KLING_SECRET_KEY` | — | Kling.ai secret key |
| `POLLO_API` | — | Pollo.ai API key (alternative video generator) |
| `GEMINI_API_KEY` | — | Google Gemini API key (Veo video / fallback LLM) |
| `SUNO_API_KEY` | — | Suno API key — AI music generation |
| `GROQ_API_KEY` | — | Groq API key (alternative fast LLM) |
| `TTS_ENGINE` | `pyttsx3` | TTS engine: `pyttsx3` \| `gtts` \| `auto` |
| `FLASK_PORT` | `7000` | Web server port |
| `FLASK_DEBUG` | `true` | Enable Flask debug mode |

> **API keys** — only the services you want to use need keys. The pipeline falls back gracefully when a service is unavailable.

---

## Running the App

```bash
python run.py
```

Open **http://localhost:7000** in your browser.

---

## Project Structure

```
Mukku/
│
├── run.py                        ← entry point
├── .env                          ← environment config
├── requirements.txt
│
├── frontend/
│   ├── index.html                ← Creator Studio UI
│   ├── style.css                 ← dark-glass theme + animations
│   └── script.js                 ← platform presets, upload, polling, progress
│
├── backend/
│   └── app.py                    ← Flask API
│
├── agents/
│   ├── prompt_agent.py           ← analyzes prompt → topic, tone, duration
│   ├── script_agent.py           ← writes full narration script
│   └── scene_agent.py            ← breaks script into visual scenes
│
├── generators/
│   ├── image_generator.py        ← Leonardo.ai (PIL fallback)
│   ├── video_generator.py        ← Kling.ai / Pollo.ai / Gemini Veo + FFmpeg assembly
│   ├── voice_generator.py        ← pyttsx3 / gTTS (12 languages)
│   └── music_generator.py        ← Suno API
│
├── services/
│   └── pipeline_manager.py       ← orchestrates all 8 stages in background thread
│
├── database/
│   └── mongo_connection.py       ← MongoDB CRUD helpers
│
└── media/
    ├── images/                   ← generated scene images
    ├── clips/                    ← generated scene video clips
    ├── audio/                    ← generated narration WAVs
    ├── music/                    ← generated music tracks
    ├── videos/                   ← final assembled MP4s
    └── uploads/                  ← user-uploaded media (per project)
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/generate` | Start generation. Accepts `application/json` or `multipart/form-data` (with file uploads) |
| `GET` | `/status/{id}` | Poll progress — returns step, progress %, script, scenes, image paths |
| `GET` | `/video/{id}` | Stream the final MP4 |
| `GET` | `/video/{id}?download=true` | Download the MP4 |
| `GET` | `/projects` | List all projects with status |
| `GET` | `/health` | Health check |

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
user_media   → file (repeat for each file)
```

---

## TTS Engine Options

| Engine | Quality | Requires Internet | Notes |
|--------|---------|-------------------|-------|
| `pyttsx3` | ★★★☆☆ | No | Uses OS built-in voices; instant; no download |
| `gtts` | ★★★★☆ | Yes | Google TTS; best for Indian language voices |
| `auto` | — | — | Tries pyttsx3 first, falls back to gTTS |

Set `TTS_ENGINE` in `.env`. For Indian languages, `gtts` produces significantly better pronunciation.

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

Selecting a platform auto-applies all its preset values to the settings panel.

---

## User Media Upload

Users can attach their own photos and videos in the composer:

- **Images** (JPG, PNG, WebP) replace AI-generated scene images. They are resized to match the selected aspect ratio before entering the pipeline.
- **Videos** (MP4, WebM, MOV) replace AI-animated clips. They are re-encoded via FFmpeg to match the aspect ratio and scene duration.
- Files appear as compact chips inside the composer. Maximum 10 files, 50 MB per file.
- Remaining scenes (beyond the number of uploads) are still generated by AI.

---

## Roadmap

- [x] Multi-language voiceovers (12 Indian languages)
- [x] Social platform presets
- [x] User media upload (photos + videos)
- [x] Live progress skeleton preview
- [x] Edit & Remake panel
- [x] Project dashboard
- [ ] AI avatars with lip-sync
- [ ] Auto subtitle / caption generation
- [ ] Direct social media publishing
- [ ] Custom voice cloning
