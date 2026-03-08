"""Orchestrates the full video generation pipeline in a background thread."""

import logging
import traceback

from agents.prompt_agent        import understand_prompt
from agents.script_agent        import generate_script
from agents.scene_agent         import generate_scenes
from generators.image_generator import generate_image
from generators.video_generator import generate_scene_clip, assemble_video
from generators.voice_generator import generate_voice
from generators.music_generator import generate_music
from database.mongo_connection  import update_project

logger = logging.getLogger(__name__)


def run_pipeline(project_id: str, prompt: str, settings: dict | None = None) -> None:
    """Run all pipeline stages. Settings from the UI always win over LLM guesses."""
    if settings is None:
        settings = {}

    logger.info("Pipeline started — project: %s  settings: %s", project_id, settings)

    try:
        _set_stage(project_id, "analyzing_prompt", 5)
        analysis = understand_prompt(prompt)

        # User-selected settings always override the LLM's extracted values
        if settings.get("duration"):
            analysis["duration"] = settings["duration"]
        if settings.get("tone"):
            analysis["tone"] = settings["tone"]

        _set_stage(project_id, "analyzing_prompt", 12, {"analysis": analysis})

        _set_stage(project_id, "generating_script", 14)
        script = generate_script(prompt, analysis)
        _set_stage(project_id, "generating_script", 24, {"script": script})

        _set_stage(project_id, "planning_scenes", 26)
        scenes = generate_scenes(script, analysis, settings.get("scene_count", 0))
        _set_stage(project_id, "planning_scenes", 35, {"scenes": scenes})

        n         = len(scenes)
        topic     = analysis.get("topic", prompt[:80])
        tone      = analysis.get("tone", "professional")
        duration  = analysis.get("duration", 60)
        img_style = settings.get("image_style", "photorealistic")
        ar        = settings.get("aspect_ratio", "16:9")
        voice_gen = settings.get("voice_gender", "auto")

        _set_stage(project_id, "generating_images", 37)
        image_paths: list[str] = []
        for i, scene in enumerate(scenes):
            vp       = scene.get("visual_prompt", f"professional scene {i + 1}")
            img_path = generate_image(vp, project_id, i + 1,
                                      image_style=img_style, aspect_ratio=ar)
            image_paths.append(img_path)
            _set_stage(project_id, "generating_images",
                       37 + int(13 * (i + 1) / n), {"image_paths": image_paths})

        _set_stage(project_id, "generating_clips", 50)
        clip_paths: list[str] = []
        for i, (scene, img_path) in enumerate(zip(scenes, image_paths)):
            vp        = scene.get("visual_prompt", f"professional scene {i + 1}")
            scene_dur = int(scene.get("duration", max(5, duration // n)))
            clip_path = generate_scene_clip(img_path, vp, project_id, i + 1,
                                            duration=scene_dur)
            clip_paths.append(clip_path)
            _set_stage(project_id, "generating_clips",
                       50 + int(13 * (i + 1) / n), {"clip_paths": clip_paths})

        _set_stage(project_id, "generating_voices", 63)
        audio_paths: list[str] = []
        for i, scene in enumerate(scenes):
            narration  = scene.get("narration", f"Scene {i + 1}.")
            audio_path = generate_voice(narration, project_id, i + 1,
                                        voice_gender=voice_gen)
            audio_paths.append(audio_path)
            _set_stage(project_id, "generating_voices",
                       63 + int(10 * (i + 1) / n), {"audio_paths": audio_paths})

        music_path = None
        if settings.get("include_music", True):
            _set_stage(project_id, "generating_music", 74)
            music_path = generate_music(topic, tone, duration, project_id)
            _set_stage(project_id, "generating_music", 80, {"music_path": music_path})
        else:
            _set_stage(project_id, "generating_music", 80)

        _set_stage(project_id, "assembling_video", 82)
        video_path = assemble_video(scenes, clip_paths, audio_paths,
                                    project_id, music_path=music_path, aspect_ratio=ar)

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
    logger.debug("[%s] %-22s %d%%", project_id, step, progress)
