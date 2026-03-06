"""
Pipeline Manager — orchestrates the full AI content generation pipeline.

Stages
------
  1. analyzing_prompt   → prompt_agent.understand_prompt
  2. generating_script  → script_agent.generate_script
  3. planning_scenes    → scene_agent.generate_scenes
  4. generating_images  → image_generator.generate_image  (per scene)
  5. generating_voices  → voice_generator.generate_voice  (per scene)
  6. assembling_video   → video_generator.assemble_video
  7. completed / failed

Each stage updates MongoDB so the frontend can poll progress in real time.
"""

import logging
import traceback

from agents.prompt_agent    import understand_prompt
from agents.script_agent    import generate_script
from agents.scene_agent     import generate_scenes
from generators.image_generator import generate_image
from generators.voice_generator import generate_voice
from generators.video_generator import assemble_video
from database.mongo_connection  import update_project

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# Main entry point (runs in a background thread)
# ──────────────────────────────────────────────────────────────────────────────

def run_pipeline(project_id: str, prompt: str) -> None:
    """Execute all pipeline stages for a given project."""
    logger.info("Pipeline started for project %s", project_id)

    try:
        # ── Stage 1: Understand prompt ─────────────────────────────────────
        _set_stage(project_id, "analyzing_prompt", 5)
        analysis = understand_prompt(prompt)
        _set_stage(project_id, "analyzing_prompt", 15, {"analysis": analysis})

        # ── Stage 2: Generate script ───────────────────────────────────────
        _set_stage(project_id, "generating_script", 18)
        script = generate_script(prompt, analysis)
        _set_stage(project_id, "generating_script", 30, {"script": script})

        # ── Stage 3: Plan scenes ───────────────────────────────────────────
        _set_stage(project_id, "planning_scenes", 33)
        scenes = generate_scenes(script, analysis)
        _set_stage(project_id, "planning_scenes", 45, {"scenes": scenes})

        n = len(scenes)

        # ── Stage 4: Generate images ───────────────────────────────────────
        _set_stage(project_id, "generating_images", 47)
        image_paths: list[str] = []
        for i, scene in enumerate(scenes):
            visual_prompt = scene.get("visual_prompt", f"professional scene {i + 1}")
            img_path = generate_image(visual_prompt, project_id, i + 1)
            image_paths.append(img_path)
            progress = 47 + int(16 * (i + 1) / n)
            _set_stage(project_id, "generating_images", progress, {"image_paths": image_paths})

        # ── Stage 5: Generate voices ───────────────────────────────────────
        _set_stage(project_id, "generating_voices", 63)
        audio_paths: list[str] = []
        for i, scene in enumerate(scenes):
            narration  = scene.get("narration", f"Scene {i + 1}.")
            audio_path = generate_voice(narration, project_id, i + 1)
            audio_paths.append(audio_path)
            progress = 63 + int(16 * (i + 1) / n)
            _set_stage(project_id, "generating_voices", progress, {"audio_paths": audio_paths})

        # ── Stage 6: Assemble video ────────────────────────────────────────
        _set_stage(project_id, "assembling_video", 80)
        video_path = assemble_video(scenes, image_paths, audio_paths, project_id)

        # ── Done ───────────────────────────────────────────────────────────
        update_project(project_id, {
            "status":       "completed",
            "current_step": "completed",
            "progress":     100,
            "video_path":   video_path,
        })
        logger.info("Pipeline completed for project %s → %s", project_id, video_path)

    except Exception:
        err = traceback.format_exc()
        logger.error("Pipeline failed for project %s:\n%s", project_id, err)
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
    logger.debug("[%s] %s — %d%%", project_id, step, progress)
