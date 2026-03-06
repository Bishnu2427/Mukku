# AI Content Agent — Prompt → Video Generator

A production-ready web application that converts a single text prompt into a complete, downloadable MP4 video using a fully local AI pipeline.

---

## How It Works

```
User Prompt
    │
    ▼
Prompt Understanding Agent  (Ollama LLM)
    │
    ▼
Script Generation Agent     (Ollama LLM)
    │
    ▼
Scene Planner Agent         (Ollama LLM)
    │
    ▼
Image Generation Engine     (Stable Diffusion)
    │
    ▼
Voice Generation Engine     (Coqui TTS / pyttsx3 / gTTS)
    │
    ▼
Video Assembly Engine       (MoviePy + FFmpeg)
    │
    ▼
Final Video (MP4)
```

---

## Prerequisites

Install these tools **before** running the app:

### 1. MongoDB
- Download: https://www.mongodb.com/try/download/community
- Start: `mongod --dbpath /data/db`

### 2. Ollama + a model
```bash
# Install Ollama: https://ollama.com/
ollama pull llama3       # recommended
# or: ollama pull mistral
```

### 3. FFmpeg
- Windows: https://ffmpeg.org/download.html → add to PATH
- Linux:   `sudo apt install ffmpeg`
- macOS:   `brew install ffmpeg`

### 4. Python 3.10+

---

## Installation

```bash
cd ai-content-agent

# 1. Copy environment config
cp .env.example .env
# Edit .env if needed

# 2. Install PyTorch (choose one):

# — CUDA (GPU, recommended for speed):
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

# — CPU only (slow for image generation, ~5–10 min per image):
pip install torch torchvision

# 3. Install all other dependencies
pip install -r requirements.txt
```

---

## Running the App

```bash
# From the project root:
python run.py
```

Then open **http://localhost:5000** in your browser.

---

## Project Structure

```
ai-content-agent/
│
├── run.py                    ← entry point
├── .env.example              ← environment config template
├── requirements.txt
│
├── frontend/
│   ├── index.html            ← UI
│   ├── style.css             ← dark theme styles
│   └── script.js             ← polling, progress, video player
│
├── backend/
│   └── app.py                ← Flask API (POST /generate, GET /status, GET /video)
│
├── agents/
│   ├── prompt_agent.py       ← understands the user prompt
│   ├── script_agent.py       ← writes the video script
│   └── scene_agent.py        ← breaks script into scenes
│
├── generators/
│   ├── image_generator.py    ← Stable Diffusion (PIL fallback)
│   ├── voice_generator.py    ← Coqui TTS / pyttsx3 / gTTS
│   └── video_generator.py    ← MoviePy + FFmpeg assembly
│
├── services/
│   └── pipeline_manager.py   ← orchestrates the full pipeline
│
├── database/
│   └── mongo_connection.py   ← MongoDB CRUD
│
└── media/
    ├── images/               ← generated scene images
    ├── audio/                ← generated narration WAVs
    ├── videos/               ← final MP4s
    └── bg_music.mp3          ← (optional) background music
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/generate` | Start generation. Body: `{"prompt": "..."}` |
| GET  | `/status/{id}` | Poll progress. Returns step, progress %, script, scenes |
| GET  | `/video/{id}` | Stream the final MP4 |
| GET  | `/video/{id}?download=true` | Download the MP4 |
| GET  | `/projects` | List recent projects |
| GET  | `/health` | Health check |

---

## Configuration (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGO_URI` | `mongodb://localhost:27017/` | MongoDB connection string |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API base URL |
| `OLLAMA_MODEL` | `llama3` | LLM model name |
| `SD_MODEL` | `stabilityai/stable-diffusion-2-1` | Stable Diffusion model |
| `TTS_ENGINE` | `auto` | TTS engine: `auto`, `coqui`, `pyttsx3`, `gtts` |
| `FLASK_PORT` | `5000` | Server port |

---

## TTS Engine Selection

| Engine | Quality | Internet | Notes |
|--------|---------|----------|-------|
| Coqui TTS | ★★★★★ | No | Best quality, ~2 GB download on first run |
| pyttsx3 | ★★★☆☆ | No | Uses OS voice, instant, no download |
| gTTS | ★★★★☆ | Yes | Google TTS, requires FFmpeg for conversion |

Set `TTS_ENGINE=auto` to try them in order (Coqui → pyttsx3 → gTTS).

---

## Performance Tips

- **GPU strongly recommended** for Stable Diffusion. CPU generation takes 5–10 min per image.
- Models are cached in memory after the first load — subsequent generations are much faster.
- Place `bg_music.mp3` in `media/` to enable background music in videos.

---

## Future Roadmap

- [ ] AI avatars with lip-sync
- [ ] Text-to-video models (replace Stable Diffusion)
- [ ] Auto subtitle generation
- [ ] Multi-language voiceovers
- [ ] Social media export formats (9:16 vertical, square)
- [ ] User dashboard with project history
