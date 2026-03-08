"""Orchestrates the full video generation pipeline in a background thread."""

import logging
import traceback
import concurrent.futures

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


def run_pipeline(project_id: str, prompt: str, settings: dict | None = None) -> None:
    """Run all pipeline stages. Settings from the UI always win over LLM guesses."""
    if settings is None:
        settings = {}

    logger.info("Pipeline started — project: %s  settings: %s", project_id, settings)

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
        _set_stage(project_id, "generating_images", 37,
                   {"step_detail": f"Generating {n} images in parallel…"})
        image_paths: list[str | None] = [None] * n

        def _gen_image(idx: int, scene: dict):
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

        # ── Stage 6: Voices (sequential — pyttsx3 is not thread-safe) ────────
        _set_stage(project_id, "generating_voices", 63,
                   {"step_detail": f"Generating {n} voice tracks…"})
        audio_paths: list[str] = []
        for i, scene in enumerate(scenes):
            narration  = scene.get("narration", f"Scene {i + 1}.")
            audio_path = generate_voice(narration, project_id, i + 1,
                                        voice_gender=voice_gen, language=language)
            audio_paths.append(audio_path)
            _set_stage(project_id, "generating_voices",
                       63 + int(10 * (i + 1) / n),
                       {"step_detail": f"Voice {i + 1}/{n} done",
                        "audio_paths": audio_paths})

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


def _set_stage(project_id: str, step: str, progress: int, extra: dict | None = None) -> None:
    updates = {"status": "processing", "current_step": step, "progress": progress}
    if extra:
        updates.update(extra)
    update_project(project_id, updates)
    logger.info("[%s] %-22s %d%%  %s", project_id, step, progress,
                extra.get("step_detail", "") if extra else "")
