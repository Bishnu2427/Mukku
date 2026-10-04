"""Orchestrates the full video generation pipeline in a background thread."""

import os
import time
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
from database.mongo_connection  import update_project, get_project
from database.user_model        import increment_video_count

logger = logging.getLogger(__name__)

# T1-5 — render deadline.
#
# Clip animation polls a provider 60 times at 10s intervals, per scene, two
# scenes at a time. Six scenes therefore serialise into three batches of up to
# ten minutes: ~30 minutes in the clip stage alone, with nothing bounding it
# from the user's point of view. Past this budget the pipeline stops asking
# providers for motion and finishes on the Ken Burns fallback instead.
#
# A finished video in eight minutes beats a perfect one in forty.
RENDER_BUDGET_SECONDS = int(os.getenv("RENDER_BUDGET_SECONDS", "900"))   # 15 min

# T3-2 — which tiers may spend money on AI motion.
#
# A Veo clip costs roughly $0.40/second, so one 8-second scene is about $3.20.
# Six scenes is ~$19 against a ₹577 (~$7) Pro subscription — underwater on a
# single render. Free and Starter therefore render motion locally with Ken
# Burns, which costs nothing and still produces a finished video.
#
# Override per deployment once you have measured real numbers from cost_lines.
AI_MOTION_TIERS = set(
    t.strip() for t in os.getenv("AI_MOTION_TIERS", "pro,enterprise,super_admin").split(",")
    if t.strip()
)

# project_id -> human-readable stage, so a failure can say WHERE it broke
# without leaking a traceback to the user.
_current_stage: dict[str, str] = {}

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

    started_at = time.monotonic()

    def _budget_left() -> float:
        return RENDER_BUDGET_SECONDS - (time.monotonic() - started_at)

    logger.info("Pipeline started — project: %s  settings: %s  budget: %ds",
                project_id, settings, RENDER_BUDGET_SECONDS)
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

        # Decide the motion strategy BEFORE defining the worker that reads it.
        tier = str(settings.get("tier", "free"))
        ai_motion = tier in AI_MOTION_TIERS
        if not ai_motion:
            logger.info("Tier '%s' renders motion locally — no paid provider.", tier)

        def _gen_clip(idx: int, scene: dict, img_path: str | None):
            # Two separate reasons to render locally: the tier does not include
            # AI motion at all, or this render has spent its time budget.
            local_only = (not ai_motion) or _budget_left() <= 0
            if local_only and img_path and ai_motion:
                logger.warning(
                    "Render budget spent — scene %d renders locally instead of "
                    "waiting on a provider.", idx + 1)
            if idx < len(user_videos):
                scene_dur = int(scene.get("duration", max(5, duration // n)))
                path = _prepare_user_video(user_videos[idx], project_id, idx + 1, ar, scene_dur)
                return idx, path
            if not img_path:
                return idx, None
            vp        = scene.get("visual_prompt", f"professional scene {idx + 1}")
            scene_dur = int(scene.get("duration", max(5, duration // n)))
            return idx, generate_scene_clip(img_path, vp, project_id, idx + 1,
                                            duration=scene_dur, aspect_ratio=ar,
                                            force_fallback=local_only)

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

        # Quota is charged HERE, on success, not at request time. A render that
        # fails on a provider outage must not cost the user one of their three
        # monthly videos. increment_video_count also rolls the monthly window
        # over when the calendar month changes.
        try:
            proj = get_project(project_id) or {}
            owner = proj.get("user_id")
            if owner:
                increment_video_count(owner)
                logger.info("Quota charged to user %s for project %s", owner, project_id)
        except Exception as exc:
            logger.error("Could not charge quota for %s: %s", project_id, exc)

        # Tell the user it is done. Failures here are logged and ignored: the
        # render already succeeded and must not be marked failed over email.
        try:
            from services import notify
            from database.user_model import get_user_by_id
            owner_doc = get_user_by_id((get_project(project_id) or {}).get("user_id", ""))
            if owner_doc:
                notify.video_ready(
                    owner_doc.get("email", ""), owner_doc.get("name", ""),
                    project_id, prompt, time.monotonic() - started_at,
                )
        except Exception as exc:
            logger.warning("Completion notification failed for %s: %s", project_id, exc)

    except Exception as exc:
        # OWASP A09 / A05: the full traceback used to be written to
        # project.error, which /status returns verbatim to the browser. That
        # leaks absolute filesystem paths, package versions and internal module
        # names to any user who can trigger a failure. Keep the detail in the
        # server log, give the user something actionable, and stash the
        # traceback in a field the API never serialises.
        err = traceback.format_exc()
        logger.error("Pipeline FAILED — project: %s\n%s", project_id, err)
        update_project(project_id, {
            "status":       "failed",
            "current_step": "failed",
            "progress":     0,
            "error": (
                f"Generation failed during '{_current_stage.get(project_id, 'processing')}'. "
                f"({type(exc).__name__}) Please try again — if it keeps failing, "
                f"contact support with project id {project_id}."
            ),
            "error_internal": err,
        })
        try:
            from services import notify
            from database.user_model import get_user_by_id
            proj = get_project(project_id) or {}
            owner_doc = get_user_by_id(proj.get("user_id", ""))
            if owner_doc:
                notify.video_failed(owner_doc.get("email", ""), owner_doc.get("name", ""),
                                    project_id, proj.get("error", ""))
        except Exception as notify_exc:
            logger.warning("Failure notification failed for %s: %s", project_id, notify_exc)

    finally:
        _current_stage.pop(project_id, None)


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
    _current_stage[project_id] = step.replace("_", " ")
    updates = {"status": "processing", "current_step": step, "progress": progress}
    if extra:
        updates.update(extra)
    update_project(project_id, updates)
    logger.info("[%s] %-22s %d%%  %s", project_id, step, progress,
                extra.get("step_detail", "") if extra else "")
