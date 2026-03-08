"""Video generation — image-to-clip via Kling.ai or Pollo.ai, assembled with MoviePy."""

import os
import time
import base64
import logging
import tempfile
import requests
from pathlib import Path

logger = logging.getLogger(__name__)

ROOT       = Path(__file__).resolve().parent.parent
CLIPS_DIR  = ROOT / "media" / "clips"
VIDEOS_DIR = ROOT / "media" / "videos"

KLING_ACCESS_KEY = os.getenv("KLING_ACCESS_KEY", "").strip()
KLING_SECRET_KEY = os.getenv("KLING_SECRET_KEY", "").strip()
KLING_BASE       = "https://api.klingai.com/v1"

POLLO_API_KEY    = os.getenv("POLLO_API", "").strip()
POLLO_BASE       = "https://api.pollo.ai/v1"

VIDEO_W, VIDEO_H = 1280, 720
FPS              = 24
FADE_DUR         = 0.4


def generate_scene_clip(
    image_path: str,
    visual_prompt: str,
    project_id: str,
    scene_number: int,
    duration: int = 5,
) -> str:
    """Generate a short video clip from a scene image. Returns the MP4 path."""
    CLIPS_DIR.mkdir(parents=True, exist_ok=True)
    clip_path = str(CLIPS_DIR / f"{project_id}_scene{scene_number:02d}.mp4")

    # try Kling.ai first
    if KLING_ACCESS_KEY and KLING_SECRET_KEY:
        try:
            url = _kling_image_to_video(image_path, visual_prompt, duration)
            _download_file(url, clip_path)
            logger.info("Kling.ai clip saved: %s", clip_path)
            return clip_path
        except Exception as exc:
            logger.warning("Kling.ai failed (%s) — trying Pollo.ai.", exc)

    if POLLO_API_KEY:
        try:
            url = _pollo_image_to_video(image_path, visual_prompt, duration)
            _download_file(url, clip_path)
            logger.info("Pollo.ai clip saved: %s", clip_path)
            return clip_path
        except Exception as exc:
            logger.warning("Pollo.ai failed (%s) — using MoviePy static.", exc)

    logger.info("Using MoviePy static clip for scene %d.", scene_number)
    return _moviepy_static_clip(image_path, clip_path, duration)


def assemble_video(
    scenes: list,
    clip_paths: list,
    audio_paths: list,
    project_id: str,
    music_path: str = None,
) -> str:
    """Merge scene clips, voiceover audio, and optional music into the final MP4."""
    from moviepy.editor import (
        VideoFileClip, AudioFileClip, concatenate_videoclips,
    )
    from moviepy.video.fx.all import fadein, fadeout

    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    final_clips = []

    for i, (scene, clip_path, audio_path) in enumerate(
        zip(scenes, clip_paths, audio_paths)
    ):
        if not os.path.exists(audio_path):
            logger.warning("Missing audio for scene %d — skipping.", i + 1)
            continue

        try:
            audio    = AudioFileClip(audio_path)
            duration = audio.duration

            if clip_path and clip_path.endswith(".mp4") and os.path.exists(clip_path):
                raw = VideoFileClip(clip_path).without_audio()
                # loop clip to match audio duration if shorter
                if raw.duration < duration:
                    loops = int(duration / raw.duration) + 1
                    from moviepy.editor import concatenate_videoclips as _cv
                    raw = _cv([raw] * loops)
                clip = raw.subclip(0, duration).resize((VIDEO_W, VIDEO_H))
            else:
                clip = _ken_burns_clip(clip_path or "", duration)

            clip = clip.set_audio(audio)
            clip = fadein(clip, FADE_DUR)
            clip = fadeout(clip, FADE_DUR)
            final_clips.append(clip)

        except Exception as exc:
            logger.error("Failed to build scene %d: %s", i + 1, exc)

    if not final_clips:
        raise RuntimeError("No valid clips to assemble.")

    final = concatenate_videoclips(final_clips, method="compose", padding=-FADE_DUR)

    # mix background music at low volume
    if music_path and os.path.exists(music_path):
        final = _mix_music(final, music_path)

    output = str(VIDEOS_DIR / f"{project_id}_final.mp4")
    _export(final, output, project_id)

    for c in final_clips:
        c.close()
    final.close()

    logger.info("Final video saved: %s", output)
    return output


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

    resp = requests.post(
        f"{KLING_BASE}/videos/image2video",
        json=body, headers=headers, timeout=30,
    )
    resp.raise_for_status()
    task_id = resp.json().get("data", {}).get("task_id")
    if not task_id:
        raise RuntimeError(f"Kling.ai no task_id: {resp.text}")

    logger.info("Kling.ai task queued: %s", task_id)

    for attempt in range(60):  # poll up to 10 minutes
        time.sleep(10)
        # refresh token each poll to avoid expiry
        headers["Authorization"] = f"Bearer {_kling_jwt()}"
        r = requests.get(
            f"{KLING_BASE}/videos/image2video/{task_id}",
            headers=headers, timeout=15,
        )
        r.raise_for_status()
        result = r.json().get("data", {})
        status = result.get("task_status", "")

        if status == "succeed":
            videos = result.get("task_result", {}).get("videos", [])
            if videos:
                return videos[0]["url"]
            raise RuntimeError("Kling succeed but no video URL.")
        if status == "failed":
            raise RuntimeError(f"Kling.ai task failed: {result}")

        logger.debug("Kling.ai poll %d — %s", attempt + 1, status)

    raise TimeoutError("Kling.ai timed out after 10 minutes.")


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

    resp = requests.post(
        f"{POLLO_BASE}/generate/image-to-video",
        json=body, headers=headers, timeout=30,
    )
    resp.raise_for_status()
    d       = resp.json()
    task_id = d.get("data", {}).get("task_id") or d.get("task_id")
    if not task_id:
        raise RuntimeError(f"Pollo.ai no task_id: {resp.text}")

    logger.info("Pollo.ai task queued: %s", task_id)

    for attempt in range(60):
        time.sleep(10)
        r = requests.get(
            f"{POLLO_BASE}/generate/{task_id}",
            headers=headers, timeout=15,
        )
        r.raise_for_status()
        result = r.json().get("data", {})
        status = result.get("status", "")

        if status in ("completed", "succeed", "success"):
            url = (
                result.get("video_url")
                or result.get("output", {}).get("url")
                or result.get("url")
            )
            if url:
                return url
            raise RuntimeError("Pollo.ai success but no video URL.")
        if status in ("failed", "error"):
            raise RuntimeError(f"Pollo.ai failed: {result}")

        logger.debug("Pollo.ai poll %d — %s", attempt + 1, status)

    raise TimeoutError("Pollo.ai timed out after 10 minutes.")


def _moviepy_static_clip(image_path: str, clip_path: str, duration: int) -> str:
    comp = _ken_burns_clip(image_path, duration)
    comp.write_videofile(
        clip_path, fps=FPS, codec="libx264",
        temp_audiofile=os.path.join(tempfile.gettempdir(), "tmp_clip.m4a"),
        remove_temp=True, verbose=False, logger=None,
    )
    comp.close()
    return clip_path


def _ken_burns_clip(image_path: str, duration: float):
    """Return a slow-zoom ImageClip — gives static images some motion."""
    from moviepy.editor import ImageClip, CompositeVideoClip, ColorClip

    img = ImageClip(image_path).resize(height=VIDEO_H)
    if img.w < VIDEO_W:
        img = img.resize(width=VIDEO_W)
    img  = img.set_duration(duration)
    zoom = 0.04
    img  = img.resize(lambda t: 1 + zoom * t / max(duration, 1))
    bg   = ColorClip((VIDEO_W, VIDEO_H), color=[0, 0, 0], duration=duration)
    return CompositeVideoClip([bg, img.set_position("center")],
                              size=(VIDEO_W, VIDEO_H))


def _mix_music(video_clip, music_path: str):
    from moviepy.editor import AudioFileClip
    from moviepy.audio.fx.all import audio_fadein, audio_fadeout
    from moviepy.audio.AudioClip import CompositeAudioClip

    music = AudioFileClip(music_path).volumex(0.10)
    if music.duration < video_clip.duration:
        from moviepy.audio.fx.all import audio_loop
        music = audio_loop(music, duration=video_clip.duration)
    else:
        music = music.subclip(0, video_clip.duration)

    music    = audio_fadein(music, 2.0)
    music    = audio_fadeout(music, 2.0)
    combined = CompositeAudioClip([video_clip.audio, music])
    return video_clip.set_audio(combined)


def _export(clip, output_path: str, project_id: str) -> None:
    tmp = os.path.join(tempfile.gettempdir(), f"{project_id}_tmp.m4a")
    clip.write_videofile(
        output_path, fps=FPS, codec="libx264", audio_codec="aac",
        temp_audiofile=tmp, remove_temp=True,
        threads=4, preset="fast", ffmpeg_params=["-crf", "22"],
        verbose=False, logger=None,
    )


def _download_file(url: str, filepath: str) -> None:
    r = requests.get(url, timeout=300, stream=True)
    r.raise_for_status()
    with open(filepath, "wb") as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
