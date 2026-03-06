"""
Video Assembly Engine.

Combines scene images + narration audio into a final MP4 video using
MoviePy + FFmpeg.

Features:
  - Ken Burns zoom-pan effect on images
  - Cross-fade transitions between scenes
  - Optional background music (place media/bg_music.mp3 to enable)
  - 1280×720 @ 24 fps output
"""

import os
import logging
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

ROOT       = Path(__file__).resolve().parent.parent
VIDEOS_DIR = ROOT / "media" / "videos"
BG_MUSIC   = ROOT / "media" / "bg_music.mp3"

VIDEO_WIDTH  = 1280
VIDEO_HEIGHT = 720
FPS          = 24
FADE_DUR     = 0.5   # seconds


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

def assemble_video(
    scenes: list[dict],
    image_paths: list[str],
    audio_paths: list[str],
    project_id: str,
) -> str:
    """
    Assemble the final video from scene images and audio files.

    Returns
    -------
    str  - absolute path of the final MP4 file
    """
    from moviepy.editor import (
        ImageClip, AudioFileClip, CompositeVideoClip,
        ColorClip, concatenate_videoclips,
    )
    from moviepy.audio.AudioClip import CompositeAudioClip
    from moviepy.audio.fx.all import audio_fadein, audio_fadeout

    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)

    clips = []

    for i, (scene, img_path, audio_path) in enumerate(
        zip(scenes, image_paths, audio_paths)
    ):
        if not os.path.exists(img_path):
            logger.warning("Missing image: %s — skipping scene %d", img_path, i + 1)
            continue
        if not os.path.exists(audio_path):
            logger.warning("Missing audio: %s — skipping scene %d", audio_path, i + 1)
            continue

        try:
            clip = _build_scene_clip(img_path, audio_path, i)
            clips.append(clip)
        except Exception as exc:
            logger.error("Failed to build scene %d clip: %s", i + 1, exc)

    if not clips:
        raise RuntimeError("No valid scene clips were produced.")

    logger.info("Concatenating %d scene clips …", len(clips))
    final = concatenate_videoclips(clips, method="compose", padding=-FADE_DUR)

    # Optional background music
    if BG_MUSIC.exists():
        final = _add_background_music(final)

    output_path = str(VIDEOS_DIR / f"{project_id}_final.mp4")
    _export(final, output_path, project_id)

    for clip in clips:
        clip.close()
    final.close()

    logger.info("Final video saved: %s", output_path)
    return output_path


# ──────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ──────────────────────────────────────────────────────────────────────────────

def _build_scene_clip(img_path: str, audio_path: str, index: int):
    from moviepy.editor import (
        ImageClip, AudioFileClip, CompositeVideoClip, ColorClip,
    )
    from moviepy.video.fx.all import fadein, fadeout

    audio    = AudioFileClip(audio_path)
    duration = audio.duration

    # Load and resize image to cover the frame
    img_clip = (
        ImageClip(img_path)
        .resize(height=VIDEO_HEIGHT)
    )
    # If still narrower than frame after height resize, resize by width
    if img_clip.w < VIDEO_WIDTH:
        img_clip = img_clip.resize(width=VIDEO_WIDTH)

    img_clip = img_clip.set_duration(duration)

    # Ken Burns effect: gentle zoom-in
    zoom = 0.04   # 4% zoom over the scene
    img_clip = img_clip.resize(lambda t: 1 + zoom * t / max(duration, 1))

    # Black background to avoid letterboxing artifacts
    bg = ColorClip((VIDEO_WIDTH, VIDEO_HEIGHT), color=[0, 0, 0], duration=duration)

    scene = CompositeVideoClip(
        [bg, img_clip.set_position("center")],
        size=(VIDEO_WIDTH, VIDEO_HEIGHT),
    )
    scene = scene.set_audio(audio)
    scene = fadein(scene, FADE_DUR)
    scene = fadeout(scene, FADE_DUR)

    return scene


def _add_background_music(video_clip):
    from moviepy.editor import AudioFileClip
    from moviepy.audio.fx.all import audio_loop, audio_fadein, audio_fadeout
    from moviepy.audio.AudioClip import CompositeAudioClip

    music = AudioFileClip(str(BG_MUSIC)).volumex(0.12)
    if music.duration < video_clip.duration:
        music = audio_loop(music, duration=video_clip.duration)
    else:
        music = music.subclip(0, video_clip.duration)

    music    = audio_fadein(music, 1.5)
    music    = audio_fadeout(music, 2.0)
    combined = CompositeAudioClip([video_clip.audio, music])
    return video_clip.set_audio(combined)


def _export(clip, output_path: str, project_id: str):
    tmp_audio = os.path.join(tempfile.gettempdir(), f"{project_id}_tmp_audio.m4a")
    clip.write_videofile(
        output_path,
        fps=FPS,
        codec="libx264",
        audio_codec="aac",
        temp_audiofile=tmp_audio,
        remove_temp=True,
        threads=4,
        preset="fast",
        ffmpeg_params=["-crf", "23"],
        verbose=False,
        logger=None,
    )
