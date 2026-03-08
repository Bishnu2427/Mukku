"""Video generation — clips via Google Veo 3.1 (primary), Kling.ai / Pollo.ai (fallback),
assembled with FFmpeg (zero in-memory concatenation, no RAM exhaustion)."""

import os
import re
import time
import base64
import logging
import tempfile
import subprocess
import requests
from pathlib import Path

logger = logging.getLogger(__name__)

ROOT       = Path(__file__).resolve().parent.parent
CLIPS_DIR  = ROOT / "media" / "clips"
VIDEOS_DIR = ROOT / "media" / "videos"

# ── API credentials ───────────────────────────────────────────────────────────

GEMINI_API_KEY   = os.getenv("GEMINI_API_KEY", "").strip()
VEO_MODEL        = "veo-3.1-generate-preview"

KLING_ACCESS_KEY = os.getenv("KLING_ACCESS_KEY", "").strip()
KLING_SECRET_KEY = os.getenv("KLING_SECRET_KEY", "").strip()
KLING_BASE       = "https://api.klingai.com/v1"

POLLO_API_KEY    = os.getenv("POLLO_API", "").strip()
POLLO_BASE       = "https://api.pollo.ai/v1"

FPS      = 24
FADE_DUR = 0.4

_AR_DIMS = {
    "16:9": (1024, 576),
    "9:16": (576, 1024),
    "1:1":  (720, 720),
}

_VEO_AR = {
    "16:9": "16:9",
    "9:16": "9:16",
    "1:1":  "1:1",
}


def _ffmpeg_bin() -> str:
    """Return path to FFmpeg binary — uses imageio-ffmpeg's bundled copy."""
    try:
        from imageio_ffmpeg import get_ffmpeg_exe
        return get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"   # last resort — relies on system PATH


# ── Public entry points ───────────────────────────────────────────────────────

def generate_scene_clip(
    image_path: str,
    visual_prompt: str,
    project_id: str,
    scene_number: int,
    duration: int = 5,
    aspect_ratio: str = "16:9",
) -> str:
    """Generate a short video clip. Priority: Veo 3.1 → Kling.ai → Pollo.ai → Ken Burns."""
    CLIPS_DIR.mkdir(parents=True, exist_ok=True)
    clip_path = str(CLIPS_DIR / f"{project_id}_scene{scene_number:02d}.mp4")

    # 1 — Google Veo 3.1 (uses SDK — confirmed working)
    if GEMINI_API_KEY:
        try:
            _veo_generate(image_path, visual_prompt, clip_path, duration, aspect_ratio)
            logger.info("Veo 3.1 clip saved: %s", clip_path)
            return clip_path
        except Exception as exc:
            logger.warning("Veo 3.1 failed (%s) — trying Kling.ai.", exc)

    # 2 — Kling.ai
    if KLING_ACCESS_KEY and KLING_SECRET_KEY:
        try:
            url = _kling_image_to_video(image_path, visual_prompt, duration)
            _download_file(url, clip_path)
            logger.info("Kling.ai clip saved: %s", clip_path)
            return clip_path
        except Exception as exc:
            logger.warning("Kling.ai failed (%s) — trying Pollo.ai.", exc)

    # 3 — Pollo.ai
    if POLLO_API_KEY:
        try:
            url = _pollo_image_to_video(image_path, visual_prompt, duration)
            _download_file(url, clip_path)
            logger.info("Pollo.ai clip saved: %s", clip_path)
            return clip_path
        except Exception as exc:
            logger.warning("Pollo.ai failed (%s) — using Ken Burns fallback.", exc)

    # 4 — Ken Burns static zoom (always works)
    logger.info("Using Ken Burns static clip for scene %d.", scene_number)
    vid_w, vid_h = _AR_DIMS.get(aspect_ratio, (1024, 576))
    return _moviepy_static_clip(image_path, clip_path, duration, vid_w, vid_h,
                                scene_idx=scene_number - 1)


def assemble_video(
    scenes: list,
    clip_paths: list,
    audio_paths: list,
    project_id: str,
    music_path: str = None,
    aspect_ratio: str = "16:9",
) -> str:
    """Merge scene clips + voiceover + music into final MP4.
    Renders one scene at a time (RAM freed after each), then uses FFmpeg concat.
    """
    vid_w, vid_h = _AR_DIMS.get(aspect_ratio, (1024, 576))
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)

    tmp_dir = Path(tempfile.gettempdir()) / f"mukku_{project_id}"
    tmp_dir.mkdir(parents=True, exist_ok=True)

    scene_files = []

    for i, (scene, clip_path, audio_path) in enumerate(zip(scenes, clip_paths, audio_paths)):
        if not audio_path or not os.path.exists(audio_path):
            logger.warning("Missing audio for scene %d — skipping.", i + 1)
            continue

        narration = scene.get("narration", "") if isinstance(scene, dict) else ""
        scene_out = str(tmp_dir / f"scene_{i:02d}.mp4")
        try:
            _render_scene_to_disk(clip_path, audio_path, scene_out,
                                   vid_w, vid_h, project_id, i, narration)
            scene_files.append(scene_out)
            logger.info("Scene %d rendered → %s", i + 1, scene_out)
        except Exception as exc:
            logger.error("Failed to render scene %d: %s", i + 1, exc)

    if not scene_files:
        raise RuntimeError("No valid clips to assemble.")

    concat_list = str(tmp_dir / "concat.txt")
    with open(concat_list, "w") as fh:
        for sf in scene_files:
            fh.write(f"file '{sf}'\n")

    output = str(VIDEOS_DIR / f"{project_id}_final.mp4")

    if music_path and os.path.exists(music_path):
        concat_out = str(tmp_dir / "concat_raw.mp4")
        _ffmpeg_concat(concat_list, concat_out)
        _ffmpeg_mix_music(concat_out, music_path, output)
    else:
        _ffmpeg_concat(concat_list, output)

    # Apply color grading as a final polish pass
    graded = str(tmp_dir / "graded.mp4")
    try:
        _ffmpeg_color_grade(output, graded)
        os.replace(graded, output)
        logger.info("Color grading applied → %s", output)
    except Exception as exc:
        logger.warning("Color grading skipped: %s", exc)

    for sf in scene_files:
        try:
            os.remove(sf)
        except OSError:
            pass

    logger.info("Final video saved: %s", output)
    return output


# ── Google Veo 3.1 (via SDK) ─────────────────────────────────────────────────

def _veo_generate(image_path: str, prompt: str, output_path: str,
                  duration: int, aspect_ratio: str) -> None:
    """Generate a video clip using the google-genai SDK (sync client)."""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=GEMINI_API_KEY)

    veo_ar    = _VEO_AR.get(aspect_ratio, "16:9")
    clip_secs = min(max(int(duration), 5), 8)

    enhanced = (
        f"{prompt}. "
        "Smooth cinematic motion, professional camera work, "
        "high detail, suitable as a video background with voice-over."
    )

    # Load scene image for visual grounding
    with open(image_path, "rb") as fh:
        img_bytes = fh.read()
    mime = "image/png" if image_path.lower().endswith(".png") else "image/jpeg"

    logger.info("Veo 3.1: submitting job — ar=%s %ds", veo_ar, clip_secs)

    operation = client.models.generate_videos(
        model=VEO_MODEL,
        prompt=enhanced,
        image=types.Image(image_bytes=img_bytes, mime_type=mime),
        config=types.GenerateVideosConfig(
            aspect_ratio=veo_ar,
            number_of_videos=1,
            duration_seconds=clip_secs,
        ),
    )

    # Poll until done (max 10 minutes)
    for attempt in range(60):
        time.sleep(10)
        operation = client.operations.get(operation)
        if operation.done:
            break
        logger.info("Veo 3.1 poll %d/60 — still processing…", attempt + 1)
    else:
        raise TimeoutError("Veo 3.1 timed out after 10 minutes.")

    if not (operation.response and operation.response.generated_videos):
        raise RuntimeError(f"Veo 3.1: no videos in response: {operation.response}")

    video = operation.response.generated_videos[0].video
    logger.info("Veo 3.1: downloading video…")

    # SDK download helper handles auth automatically
    client.files.download(file=video, download_path=output_path)
    logger.info("Veo 3.1 video saved → %s", output_path)


# ── Per-scene MoviePy rendering (one at a time to avoid OOM) ─────────────────

def _render_scene_to_disk(
    clip_path: str,
    audio_path: str,
    output_path: str,
    vid_w: int,
    vid_h: int,
    project_id: str,
    scene_idx: int,
    narration: str = "",
) -> None:
    """Render one (clip + audio + fades) to MP4 then close everything to free RAM.

    Compatible with MoviePy 2.x (dropped moviepy.editor; renamed several methods).
    """
    # MoviePy 2.x: import directly from moviepy, not from moviepy.editor
    from moviepy import VideoFileClip, AudioFileClip, concatenate_videoclips

    audio    = AudioFileClip(audio_path)
    duration = audio.duration

    if clip_path and clip_path.endswith(".mp4") and os.path.exists(clip_path):
        raw = VideoFileClip(clip_path).without_audio()
        if raw.duration < duration:
            loops = int(duration / raw.duration) + 1
            raw = concatenate_videoclips([raw] * loops)
        # subclip → subclipped, resize → resized in MoviePy 2.x
        clip = raw.subclipped(0, duration).resized((vid_w, vid_h))
    else:
        clip = _ken_burns_clip(clip_path or "", duration, vid_w, vid_h, scene_idx)

    clip = clip.with_audio(audio)

    # Apply fade-in/out. MoviePy 2.x dropped .fadein()/.fadeout() as clip methods;
    # they are now FX classes applied via with_effects(). Wrap in try/except so the
    # video still renders correctly even if the FX import path changes between versions.
    try:
        from moviepy.video.fx import FadeIn, FadeOut
        clip = clip.with_effects([FadeIn(duration=FADE_DUR), FadeOut(duration=FADE_DUR)])
    except Exception:
        pass  # fades are cosmetic — video is still valid without them

    tmp_audio = os.path.join(tempfile.gettempdir(),
                              f"{project_id}_s{scene_idx}_tmp.m4a")
    try:
        # verbose param removed in MoviePy 2.x; logger=None suppresses output
        clip.write_videofile(
            output_path,
            fps=FPS, codec="libx264", audio_codec="aac",
            temp_audiofile=tmp_audio, remove_temp=True,
            threads=2, preset="fast",
            ffmpeg_params=["-crf", "23"],
            logger=None,
        )
    finally:
        clip.close()
        audio.close()

    # Burn subtitles onto the rendered scene clip
    if narration:
        sub_out = output_path + ".sub.mp4"
        try:
            _burn_subtitle(output_path, sub_out, narration, vid_w, vid_h)
            os.replace(sub_out, output_path)
        except Exception as exc:
            logger.warning("Subtitle burn for scene %d skipped: %s", scene_idx + 1, exc)
            try:
                os.remove(sub_out)
            except OSError:
                pass


# ── FFmpeg assembly (uses imageio-ffmpeg bundled binary) ──────────────────────

def _ffmpeg_concat(concat_list: str, output: str) -> None:
    ff = _ffmpeg_bin()
    cmd = [ff, "-y", "-f", "concat", "-safe", "0", "-i", concat_list, "-c", "copy", output]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"FFmpeg concat failed:\n{r.stderr[-2000:]}")
    logger.info("FFmpeg concat OK → %s", output)


def _ffmpeg_mix_music(video_path: str, music_path: str, output: str) -> None:
    duration      = _probe_duration(video_path)
    fadeout_start = max(0.0, duration - 2.0)
    filter_str = (
        f"[1:a]volume=0.10,"
        f"afade=t=in:st=0:d=2,"
        f"afade=t=out:st={fadeout_start:.2f}:d=2[music];"
        "[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]"
    )
    ff  = _ffmpeg_bin()
    cmd = [
        ff, "-y",
        "-i", video_path, "-i", music_path,
        "-filter_complex", filter_str,
        "-map", "0:v", "-map", "[aout]",
        "-c:v", "copy", "-c:a", "aac",
        "-shortest", output,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"FFmpeg music mix failed:\n{r.stderr[-2000:]}")
    logger.info("FFmpeg music mix OK → %s", output)


def _probe_duration(path: str) -> float:
    """Get video duration by parsing ffmpeg stderr (no ffprobe needed)."""
    ff = _ffmpeg_bin()
    # ffmpeg prints Duration to stderr when given just -i
    r = subprocess.run([ff, "-i", path, "-hide_banner"],
                       capture_output=True, text=True)
    m = re.search(r"Duration:\s*(\d+):(\d+):([\d.]+)", r.stderr)
    if m:
        h, mi, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
        return h * 3600 + mi * 60 + s
    return 0.0


# ── Kling.ai ──────────────────────────────────────────────────────────────────

def _kling_jwt() -> str:
    import jwt as pyjwt
    payload = {
        "iss": KLING_ACCESS_KEY,
        "exp": int(time.time()) + 1800,
        "nbf": int(time.time()) - 5,
    }
    return pyjwt.encode(payload, KLING_SECRET_KEY, algorithm="HS256")


def _kling_image_to_video(image_path: str, prompt: str, duration: int) -> str:
    token   = _kling_jwt()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    with open(image_path, "rb") as f:
        image_b64 = base64.b64encode(f.read()).decode()

    body = {
        "model_name": "kling-v1",
        "image":      image_b64,
        "prompt":     f"{prompt}, smooth cinematic motion, professional video quality",
        "duration":   str(min(duration, 5)),
        "cfg_scale":  0.5,
        "mode":       "std",
    }

    resp = requests.post(f"{KLING_BASE}/videos/image2video",
                         json=body, headers=headers, timeout=30)
    resp.raise_for_status()
    task_id = resp.json().get("data", {}).get("task_id")
    if not task_id:
        raise RuntimeError(f"Kling.ai no task_id: {resp.text}")
    logger.info("Kling.ai task: %s", task_id)

    for attempt in range(60):
        time.sleep(10)
        headers["Authorization"] = f"Bearer {_kling_jwt()}"
        r = requests.get(f"{KLING_BASE}/videos/image2video/{task_id}",
                         headers=headers, timeout=15)
        r.raise_for_status()
        result = r.json().get("data", {})
        status = result.get("task_status", "")
        if status == "succeed":
            videos = result.get("task_result", {}).get("videos", [])
            if videos:
                return videos[0]["url"]
            raise RuntimeError("Kling: succeed but no URL.")
        if status == "failed":
            raise RuntimeError(f"Kling task failed: {result}")
        logger.debug("Kling poll %d — %s", attempt + 1, status)

    raise TimeoutError("Kling.ai timed out.")


# ── Pollo.ai ──────────────────────────────────────────────────────────────────

def _pollo_image_to_video(image_path: str, prompt: str, duration: int) -> str:
    headers = {"x-api-key": POLLO_API_KEY, "Content-Type": "application/json"}

    with open(image_path, "rb") as f:
        image_b64 = base64.b64encode(f.read()).decode()

    body = {
        "image":    f"data:image/png;base64,{image_b64}",
        "prompt":   f"{prompt}, smooth motion, cinematic, professional",
        "duration": duration,
        "ratio":    "16:9",
    }

    resp = requests.post(f"{POLLO_BASE}/generate/image-to-video",
                         json=body, headers=headers, timeout=30)
    resp.raise_for_status()
    d       = resp.json()
    task_id = d.get("data", {}).get("task_id") or d.get("task_id")
    if not task_id:
        raise RuntimeError(f"Pollo.ai no task_id: {resp.text}")
    logger.info("Pollo.ai task: %s", task_id)

    for attempt in range(60):
        time.sleep(10)
        r = requests.get(f"{POLLO_BASE}/generate/{task_id}",
                         headers=headers, timeout=15)
        r.raise_for_status()
        result = r.json().get("data", {})
        status = result.get("status", "")
        if status in ("completed", "succeed", "success"):
            url = (result.get("video_url")
                   or result.get("output", {}).get("url")
                   or result.get("url"))
            if url:
                return url
            raise RuntimeError("Pollo: success but no URL.")
        if status in ("failed", "error"):
            raise RuntimeError(f"Pollo failed: {result}")
        logger.debug("Pollo poll %d — %s", attempt + 1, status)

    raise TimeoutError("Pollo.ai timed out.")


# ── MoviePy Ken Burns fallback ────────────────────────────────────────────────

def _moviepy_static_clip(image_path: str, clip_path: str, duration: int,
                          vid_w: int = 1024, vid_h: int = 576,
                          scene_idx: int = 0) -> str:
    comp = _ken_burns_clip(image_path, duration, vid_w, vid_h, scene_idx)
    tmp  = os.path.join(tempfile.gettempdir(), "tmp_clip.m4a")
    try:
        # verbose removed in MoviePy 2.x
        comp.write_videofile(
            clip_path, fps=FPS, codec="libx264",
            temp_audiofile=tmp, remove_temp=True,
            threads=2, preset="fast",
            logger=None,
        )
    finally:
        comp.close()
    return clip_path


def _ken_burns_clip(image_path: str, duration: float,
                    vid_w: int = 1024, vid_h: int = 576,
                    scene_idx: int = 0):
    """Animated ImageClip with varied camera motions to give static images life.

    Motion cycles every 4 scenes:
        0 — slow zoom in
        1 — slow zoom out
        2 — pan left  (camera moves left across scene)
        3 — pan right (camera moves right across scene)

    MoviePy 2.x: import from moviepy directly; use resized/with_duration/with_position.
    """
    from moviepy import ImageClip, CompositeVideoClip, ColorClip

    motion = scene_idx % 4
    zoom   = 0.06          # 6 % zoom travel
    pan_ex = 0.18          # 18 % extra image width for pan room

    # Scale image to exactly fill the frame (cover, not fit)
    raw = ImageClip(image_path)
    scale = max(vid_w / raw.w, vid_h / raw.h) * 1.01   # 1% extra to avoid edge gaps
    fit_w = int(raw.w * scale)
    fit_h = int(raw.h * scale)

    bg = ColorClip((vid_w, vid_h), color=[0, 0, 0], duration=duration)

    if motion == 0:   # zoom in
        # resized / with_duration / with_position replace resize/set_duration/set_position in 2.x
        img = raw.resized((fit_w, fit_h)).with_duration(duration)
        img = img.resized(lambda t: 1 + zoom * t / max(duration, 1))
        return CompositeVideoClip([bg, img.with_position("center")], size=(vid_w, vid_h))

    elif motion == 1:  # zoom out
        img = raw.resized((fit_w, fit_h)).with_duration(duration)
        img = img.resized(lambda t: 1 + zoom * (1 - t / max(duration, 1)))
        return CompositeVideoClip([bg, img.with_position("center")], size=(vid_w, vid_h))

    elif motion == 2:  # pan left  (content drifts leftward)
        pan_w = int(fit_w * (1 + pan_ex))
        img   = raw.resized((pan_w, fit_h)).with_duration(duration)
        travel = pan_w - vid_w
        cy     = (fit_h - vid_h) // 2
        def _pos_left(t, tr=travel, oy=cy, dur=duration):
            return (-int(tr * t / max(dur, 1)), -oy)
        img = img.with_position(_pos_left)
        return CompositeVideoClip([bg, img], size=(vid_w, vid_h))

    else:              # pan right (content drifts rightward)
        pan_w = int(fit_w * (1 + pan_ex))
        img   = raw.resized((pan_w, fit_h)).with_duration(duration)
        travel = pan_w - vid_w
        cy     = (fit_h - vid_h) // 2
        def _pos_right(t, tr=travel, oy=cy, dur=duration):
            return (-tr + int(tr * t / max(dur, 1)), -oy)
        img = img.with_position(_pos_right)
        return CompositeVideoClip([bg, img], size=(vid_w, vid_h))


# ── Subtitle & color-grade helpers ────────────────────────────────────────────

def _get_font_path() -> str:
    """Return path to a TTF font usable by FFmpeg drawtext on Windows."""
    candidates = [
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/NirmalaUI.ttf",  # Devanagari/Hindi (Windows 8+)
        "C:/Windows/Fonts/nirmala.ttf",
        "C:/Windows/Fonts/calibri.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/verdana.ttf",
        "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",      # Linux Noto
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",          # Linux fallback
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",     # macOS
        "/System/Library/Fonts/Helvetica.ttc",                       # macOS fallback
    ]
    for p in candidates:
        if os.path.exists(p):
            return p.replace("\\", "/")
    return ""


def _wrap_subtitle(text: str, max_chars: int = 42) -> str:
    """Wrap text into 1–2 subtitle lines, each capped at max_chars.

    The full narration can be hundreds of words — we keep only a short excerpt
    so it fits on screen without overlapping or garbling.
    """
    text = text.strip()
    # Hard-cap total length at 2 lines × max_chars
    max_total = max_chars * 2
    if len(text) > max_total:
        # Trim at last word boundary within limit
        cut = text[:max_total].rsplit(" ", 1)[0]
        text = cut if len(cut) > max_chars // 2 else text[:max_total]

    if len(text) <= max_chars:
        return text

    # Find best word break near max_chars
    idx = text.rfind(" ", 0, max_chars)
    if idx < 5:
        idx = max_chars
    line2 = text[idx:].strip()[:max_chars]
    return text[:idx] + "\n" + line2


def _burn_subtitle(input_path: str, output_path: str,
                   text: str, vid_w: int, vid_h: int) -> None:
    """Burn a caption line onto the clip using FFmpeg drawtext.
    Falls back silently (copies file) if no font is found.
    """
    font_path = _get_font_path()
    if not font_path:
        import shutil
        shutil.copy2(input_path, output_path)
        return

    # Take only the first sentence or first ~90 chars — full narration is too long
    first_sentence_end = min(
        (text.find(". ") + 1) if text.find(". ") != -1 else len(text),
        (text.find("? ") + 1) if text.find("? ") != -1 else len(text),
        (text.find("! ") + 1) if text.find("! ") != -1 else len(text),
        90,
    )
    short_text = text[:first_sentence_end].strip()
    wrapped = _wrap_subtitle(short_text, max_chars=42)

    # Escape special characters for FFmpeg drawtext
    def _esc(s: str) -> str:
        return (s
                .replace("\\", "\\\\")
                .replace("'",  "\u2019")   # smart apostrophe avoids quote issues
                .replace(":",  "\\:")
                .replace("%",  "\\%")
                .replace("\n", "\\n"))     # real newline → FFmpeg line-break escape

    escaped    = _esc(wrapped)
    fontsize   = max(18, vid_h // 22)
    pad_bottom = max(20, int(vid_h * 0.06))

    drawtext = (
        f"drawtext="
        f"fontfile='{font_path}':"
        f"text='{escaped}':"
        f"fontcolor=white:"
        f"fontsize={fontsize}:"
        f"box=1:"
        f"boxcolor=black@0.6:"
        f"boxborderw=10:"
        f"x=(w-text_w)/2:"
        f"y=h-text_h-{pad_bottom}:"
        f"line_spacing=6"
    )

    ff  = _ffmpeg_bin()
    cmd = [
        ff, "-y", "-i", input_path,
        "-vf", drawtext,
        "-c:v", "libx264", "-crf", "23", "-preset", "fast",
        "-c:a", "copy", output_path,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"drawtext failed: {r.stderr[-600:]}")


def _ffmpeg_color_grade(input_path: str, output_path: str) -> None:
    """Apply a subtle cinematic color grade: slight contrast/saturation lift + sharpening."""
    ff  = _ffmpeg_bin()
    cmd = [
        ff, "-y", "-i", input_path,
        "-vf",
        "eq=contrast=1.06:saturation=1.18:brightness=0.01:gamma=0.97,"
        "unsharp=lx=3:ly=3:la=0.6:cx=3:cy=3:ca=0.0",
        "-c:v", "libx264", "-crf", "21", "-preset", "fast",
        "-c:a", "copy", output_path,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"Color grade failed: {r.stderr[-600:]}")


# ── Shared downloader ─────────────────────────────────────────────────────────

def _download_file(url: str, filepath: str, extra_params: dict = None) -> None:
    r = requests.get(url, params=extra_params, timeout=300, stream=True)
    r.raise_for_status()
    with open(filepath, "wb") as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
