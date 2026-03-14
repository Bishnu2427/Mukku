"""Orchestrates the full video generation pipeline in a background thread."""

import logging
import traceback
import concurrent.futures
from pathlib import Path

from agents.prompt_agent        import understand_prompt
from agents.script_agent        import generate_script
from agents.scene_agent         import generate_scenes
from generators.image_generator import generate_image
from generators.video_generator import generate_scene_clip, assemble_video
from generators.voice_generator import generate_voice
from generators.music_generator import generate_music
from database.mongo_connection  import update_project

logger = logging.getLogger(__name__)

# Max scenes per duration bracket — keeps pipeline fast and clip count sane
_SCENE_CAP = [
    (30,  4),
    (60,  6),
    (90,  8),
    (120, 10),
    (999, 12),
]


def run_pipeline(project_id: str, prompt: str, settings: dict | None = None, user_media: list | None = None) -> None:
    """Run all pipeline stages. Settings from the UI always win over LLM guesses."""
    if settings is None:
        settings = {}

    user_media = user_media or []
    _IMG_EXT = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}
    _VID_EXT = {'.mp4', '.mov', '.webm', '.avi', '.mkv'}
    user_images = [p for p in user_media if Path(p).suffix.lower() in _IMG_EXT]
    user_videos = [p for p in user_media if Path(p).suffix.lower() in _VID_EXT]

    logger.info("Pipeline started — project: %s  settings: %s", project_id, settings)
    if user_media:
        logger.info("User media — %d image(s): %s  |  %d video(s): %s",
                    len(user_images), user_images, len(user_videos), user_videos)

    try:
        # ── Stage 1: Analyze prompt ───────────────────────────────────────────
        _set_stage(project_id, "analyzing_prompt", 5)
        analysis = understand_prompt(prompt)

        if settings.get("duration"):
            analysis["duration"] = settings["duration"]
        if settings.get("tone"):
            analysis["tone"] = settings["tone"]

        _set_stage(project_id, "analyzing_prompt", 12, {"analysis": analysis})

        # ── Stage 2: Script ───────────────────────────────────────────────────
        _set_stage(project_id, "generating_script", 14)
        script = generate_script(prompt, analysis, language=settings.get("language", "en"))
        _set_stage(project_id, "generating_script", 24, {"script": script})

        # ── Stage 3: Scenes ───────────────────────────────────────────────────
        _set_stage(project_id, "planning_scenes", 26)
        duration  = analysis.get("duration", 60)
        max_scenes = next(cap for thresh, cap in _SCENE_CAP if duration <= thresh)
        scenes = generate_scenes(script, analysis, settings.get("scene_count", max_scenes))
        _set_stage(project_id, "planning_scenes", 35, {"scenes": scenes})

        n         = len(scenes)
        topic     = analysis.get("topic", prompt[:80])
        tone      = analysis.get("tone", "professional")
        img_style = settings.get("image_style", "photorealistic")
        ar        = settings.get("aspect_ratio", "16:9")
        voice_gen = settings.get("voice_gender", "auto")
        language  = settings.get("language", "en")

        # ── Music: kick off in background immediately ─────────────────────────
        music_future   = None
        music_executor = None
        if settings.get("include_music", True):
            music_executor = concurrent.futures.ThreadPoolExecutor(max_workers=1,
                                                                    thread_name_prefix="music")
            music_future = music_executor.submit(generate_music, topic, tone, duration, project_id)
            logger.info("Music generation started in background.")

        # ── Stage 4: Images (parallel) ────────────────────────────────────────
        detail = f"Generating {n} images"
        if user_images:
            detail += f" ({len(user_images)} from your uploads)"
        _set_stage(project_id, "generating_images", 37, {"step_detail": detail + "…"})
        image_paths: list[str | None] = [None] * n

        def _gen_image(idx: int, scene: dict):
            if idx < len(user_images):
                path = _prepare_user_image(user_images[idx], project_id, idx + 1, ar)
                return idx, path
            vp = scene.get("visual_prompt", f"professional scene {idx + 1}")
            return idx, generate_image(vp, project_id, idx + 1,
                                       image_style=img_style, aspect_ratio=ar)

        img_done = 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=5,
                                                    thread_name_prefix="img") as pool:
            futs = {pool.submit(_gen_image, i, s): i for i, s in enumerate(scenes)}
            for fut in concurrent.futures.as_completed(futs):
                try:
                    idx, path = fut.result()
                    image_paths[idx] = path
                except Exception as exc:
                    logger.error("Image future failed: %s", exc)
                img_done += 1
                _set_stage(project_id, "generating_images",
                           37 + int(13 * img_done / n),
                           {"step_detail": f"Images: {img_done}/{n} done",
                            "image_paths": [p for p in image_paths if p]})

        # ── Stage 5: Clips (parallel, max 2 to avoid OOM) ────────────────────
        _set_stage(project_id, "generating_clips", 50,
                   {"step_detail": f"Generating {n} clips…"})
        clip_paths: list[str | None] = [None] * n

        def _gen_clip(idx: int, scene: dict, img_path: str | None):
            if idx < len(user_videos):
                scene_dur = int(scene.get("duration", max(5, duration // n)))
                path = _prepare_user_video(user_videos[idx], project_id, idx + 1, ar, scene_dur)
                return idx, path
            if not img_path:
                return idx, None
            vp        = scene.get("visual_prompt", f"professional scene {idx + 1}")
            scene_dur = int(scene.get("duration", max(5, duration // n)))
            return idx, generate_scene_clip(img_path, vp, project_id, idx + 1,
                                            duration=scene_dur, aspect_ratio=ar)

        clip_done = 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=2,
                                                    thread_name_prefix="clip") as pool:
            futs = {pool.submit(_gen_clip, i, s, image_paths[i]): i
                    for i, s in enumerate(scenes)}
            for fut in concurrent.futures.as_completed(futs):
                try:
                    idx, path = fut.result()
                    clip_paths[idx] = path
                except Exception as exc:
                    logger.error("Clip future failed: %s", exc)
                clip_done += 1
                _set_stage(project_id, "generating_clips",
                           50 + int(13 * clip_done / n),
                           {"step_detail": f"Clips: {clip_done}/{n} done"})

        # ── Stage 6: Voices ───────────────────────────────────────────────────
        # gTTS (used for all non-English, or when TTS_ENGINE=gtts) is thread-safe.
        # pyttsx3 uses Windows COM and must stay sequential.
        import os as _os
        _tts_engine = _os.getenv("TTS_ENGINE", "pyttsx3").lower()
        use_parallel_voice = (language != "en") or (_tts_engine == "gtts")
        voice_workers = min(n, 4) if use_parallel_voice else 1

        _set_stage(project_id, "generating_voices", 63,
                   {"step_detail": f"Generating {n} voice tracks…"})
        audio_paths: list[str | None] = [None] * n

        def _gen_voice(idx: int, scene: dict):
            narration = scene.get("narration", f"Scene {idx + 1}.")
            return idx, generate_voice(narration, project_id, idx + 1,
                                       voice_gender=voice_gen, language=language)

        voice_done = 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=voice_workers,
                                                    thread_name_prefix="voice") as pool:
            futs = {pool.submit(_gen_voice, i, s): i for i, s in enumerate(scenes)}
            for fut in concurrent.futures.as_completed(futs):
                try:
                    idx, path = fut.result()
                    audio_paths[idx] = path
                except Exception as exc:
                    logger.error("Voice future failed: %s", exc)
                voice_done += 1
                _set_stage(project_id, "generating_voices",
                           63 + int(10 * voice_done / n),
                           {"step_detail": f"Voice {voice_done}/{n} done"})

        # ── Stage 7: Music (collect background result) ────────────────────────
        music_path = None
        if music_future is not None:
            _set_stage(project_id, "generating_music", 74,
                       {"step_detail": "Waiting for background music…"})
            try:
                music_path = music_future.result(timeout=360)  # up to 6 min
            except Exception as exc:
                logger.warning("Music generation failed: %s — continuing without.", exc)
            finally:
                music_executor.shutdown(wait=False)
            _set_stage(project_id, "generating_music", 80, {"music_path": music_path})
        else:
            _set_stage(project_id, "generating_music", 80)

        # ── Stage 8: Assemble ─────────────────────────────────────────────────
        _set_stage(project_id, "assembling_video", 82,
                   {"step_detail": "Merging clips with FFmpeg…"})
        video_path = assemble_video(
            scenes, clip_paths, audio_paths,
            project_id, music_path=music_path, aspect_ratio=ar,
        )

        update_project(project_id, {
            "status":       "completed",
            "current_step": "completed",
            "progress":     100,
            "video_path":   video_path,
        })
        logger.info("Pipeline completed — project: %s  video: %s", project_id, video_path)

    except Exception:
        err = traceback.format_exc()
        logger.error("Pipeline FAILED — project: %s\n%s", project_id, err)
        update_project(project_id, {
            "status":       "failed",
            "current_step": "failed",
            "progress":     0,
            "error":        err,
        })


def _prepare_user_image(src: str, project_id: str, scene_num: int, aspect_ratio: str) -> str | None:
    """Copy + resize a user-uploaded image to the images directory."""
    try:
        from PIL import Image as _PILImage
        ar_map = {"16:9": (1024, 576), "9:16": (576, 1024), "1:1": (768, 768)}
        w, h   = ar_map.get(aspect_ratio, (1024, 576))
        img    = _PILImage.open(src).convert("RGB")
        img    = img.resize((w, h), _PILImage.LANCZOS)
        dest   = Path(src).parent.parent.parent / "media" / "images" / f"{project_id}_scene{scene_num:02d}.jpg"
        dest.parent.mkdir(parents=True, exist_ok=True)
        img.save(str(dest), "JPEG", quality=92)
        logger.info("User image prepared: %s", dest)
        return str(dest)
    except Exception as exc:
        logger.warning("Failed to prepare user image %s: %s", src, exc)
        return None


def _prepare_user_video(src: str, project_id: str, scene_num: int, aspect_ratio: str, duration: int) -> str | None:
    """Re-encode a user-uploaded video clip to match pipeline format."""
    import subprocess as _sp
    try:
        from imageio_ffmpeg import get_ffmpeg_exe
        ff = get_ffmpeg_exe()
    except Exception:
        ff = "ffmpeg"
    try:
        ar_map = {"16:9": "1024:576", "9:16": "576:1024", "1:1": "768:768"}
        scale  = ar_map.get(aspect_ratio, "1024:576")
        dest   = Path(src).parent.parent.parent / "media" / "clips" / f"{project_id}_scene{scene_num:02d}.mp4"
        dest.parent.mkdir(parents=True, exist_ok=True)
        cmd = [ff, "-y", "-i", src, "-t", str(duration),
               "-vf", f"scale={scale}:force_original_aspect_ratio=decrease,pad={scale}:(ow-iw)/2:(oh-ih)/2",
               "-c:v", "libx264", "-preset", "fast", "-crf", "23",
               "-an", str(dest)]
        r = _sp.run(cmd, capture_output=True, timeout=120)
        if r.returncode == 0:
            logger.info("User video prepared: %s", dest)
            return str(dest)
        logger.warning("ffmpeg user video re-encode failed: %s", r.stderr.decode())
        return None
    except Exception as exc:
        logger.warning("Failed to prepare user video %s: %s", src, exc)
        return None


def _set_stage(project_id: str, step: str, progress: int, extra: dict | None = None) -> None:
    updates = {"status": "processing", "current_step": step, "progress": progress}
    if extra:
        updates.update(extra)
    update_project(project_id, updates)
    logger.info("[%s] %-22s %d%%  %s", project_id, step, progress,
                extra.get("step_detail", "") if extra else "")
