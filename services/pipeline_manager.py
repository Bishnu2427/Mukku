"""
Pipeline Manager — orchestrates the full AI content generation pipeline.

Stages
------
  1. analyzing_prompt    → prompt_agent
  2. generating_script   → script_agent
  3. planning_scenes     → scene_agent
  4. generating_images   → image_generator  (Leonardo.ai → SD → placeholder)
  5. generating_clips    → video_generator  (Kling.ai → Pollo.ai → MoviePy)
  6. generating_voices   → voice_generator  (pyttsx3 → gTTS)
  7. generating_music    → music_generator  (Suno API)
  8. assembling_video    → video_generator  (MoviePy + FFmpeg)
  9. completed / failed

Each stage updates MongoDB so the frontend can poll progress in real time.
"""

import logging
import traceback

from agents.prompt_agent         import understand_prompt
from agents.script_agent         import generate_script
from agents.scene_agent          import generate_scenes
from generators.image_generator  import generate_image
from generators.video_generator  import generate_scene_clip, assemble_video
from generators.voice_generator  import generate_voice
from generators.music_generator  import generate_music
from database.mongo_connection   import update_project

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# Main entry point (runs in a background thread)
# ──────────────────────────────────────────────────────────────────────────────

def run_pipeline(project_id: str, prompt: str) -> None:
    """Execute all pipeline stages for a given project."""
    logger.info("Pipeline started — project: %s", project_id)

    try:
        # ── Stage 1: Understand prompt ─────────────────────────────────────
        _set_stage(project_id, "analyzing_prompt", 5)
        analysis = understand_prompt(prompt)
        _set_stage(project_id, "analyzing_prompt", 12, {"analysis": analysis})

        # ── Stage 2: Generate script ───────────────────────────────────────
        _set_stage(project_id, "generating_script", 14)
        script = generate_script(prompt, analysis)
        _set_stage(project_id, "generating_script", 24, {"script": script})

        # ── Stage 3: Plan scenes ───────────────────────────────────────────
        _set_stage(project_id, "planning_scenes", 26)
        scenes = generate_scenes(script, analysis)
        _set_stage(project_id, "planning_scenes", 35, {"scenes": scenes})

        n        = len(scenes)
        topic    = analysis.get("topic", prompt[:80])
        tone     = analysis.get("tone", "professional")
        duration = analysis.get("duration", 60)

        # ── Stage 4: Generate images (Leonardo.ai) ────────────────────────
        _set_stage(project_id, "generating_images", 37)
        image_paths: list[str] = []
        for i, scene in enumerate(scenes):
            visual_prompt = scene.get("visual_prompt", f"professional scene {i + 1}")
            img_path = generate_image(visual_prompt, project_id, i + 1)
            image_paths.append(img_path)
            progress = 37 + int(13 * (i + 1) / n)
            _set_stage(project_id, "generating_images", progress,
                       {"image_paths": image_paths})

        # ── Stage 5: Generate video clips (Kling.ai / Pollo.ai) ───────────
        _set_stage(project_id, "generating_clips", 50)
        clip_paths: list[str] = []
        for i, (scene, img_path) in enumerate(zip(scenes, image_paths)):
            visual_prompt = scene.get("visual_prompt", f"professional scene {i + 1}")
            scene_dur     = int(scene.get("duration", max(5, duration // n)))
            clip_path = generate_scene_clip(
                img_path, visual_prompt, project_id, i + 1, duration=scene_dur
            )
            clip_paths.append(clip_path)
            progress = 50 + int(13 * (i + 1) / n)
            _set_stage(project_id, "generating_clips", progress,
                       {"clip_paths": clip_paths})

        # ── Stage 6: Generate voiceovers ───────────────────────────────────
        _set_stage(project_id, "generating_voices", 63)
        audio_paths: list[str] = []
        for i, scene in enumerate(scenes):
            narration  = scene.get("narration", f"Scene {i + 1}.")
            audio_path = generate_voice(narration, project_id, i + 1)
            audio_paths.append(audio_path)
            progress = 63 + int(10 * (i + 1) / n)
            _set_stage(project_id, "generating_voices", progress,
                       {"audio_paths": audio_paths})

        # ── Stage 7: Generate background music (Suno) ─────────────────────
        _set_stage(project_id, "generating_music", 74)
        music_path = generate_music(topic, tone, duration, project_id)
        _set_stage(project_id, "generating_music", 80,
                   {"music_path": music_path})

        # ── Stage 8: Assemble final video ──────────────────────────────────
        _set_stage(project_id, "assembling_video", 82)
        video_path = assemble_video(
            scenes, clip_paths, audio_paths,
            project_id, music_path=music_path,
        )

        # ── Done ───────────────────────────────────────────────────────────
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


# ──────────────────────────────────────────────────────────────────────────────
# Internal helper
# ──────────────────────────────────────────────────────────────────────────────

def _set_stage(
    project_id: str,
    step: str,
    progress: int,
    extra: dict | None = None,
) -> None:
    updates = {
        "status":       "processing",
        "current_step": step,
        "progress":     progress,
    }
    if extra:
        updates.update(extra)
    update_project(project_id, updates)
    logger.debug("[%s] %-22s %d%%", project_id, step, progress)
