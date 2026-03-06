"""
Image Generation Engine.

Primary  : Stable Diffusion 2.1 via Hugging Face diffusers.
Fallback : PIL-based placeholder image (for CPU-only / dev environments).

The pipeline is loaded once and cached in memory.
"""

import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

ROOT       = Path(__file__).resolve().parent.parent
IMAGES_DIR = ROOT / "media" / "images"
SD_MODEL   = os.getenv("SD_MODEL", "stabilityai/stable-diffusion-2-1")

_sd_pipeline = None   # cached after first load


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

def generate_image(visual_prompt: str, project_id: str, scene_number: int) -> str:
    """
    Generate an image for a scene and save it to disk.

    Returns
    -------
    str  - absolute path of the saved PNG file
    """
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{project_id}_scene{scene_number:02d}.png"
    filepath = str(IMAGES_DIR / filename)

    try:
        image = _generate_with_sd(visual_prompt)
        image.save(filepath)
        logger.info("Image saved: %s", filepath)
    except Exception as exc:
        logger.warning("Stable Diffusion failed (%s). Using placeholder.", exc)
        filepath = _generate_placeholder(visual_prompt, filepath, scene_number)

    return filepath


# ──────────────────────────────────────────────────────────────────────────────
# Stable Diffusion (primary)
# ──────────────────────────────────────────────────────────────────────────────

def _get_sd_pipeline():
    global _sd_pipeline
    if _sd_pipeline is not None:
        return _sd_pipeline

    import torch
    from diffusers import StableDiffusionPipeline

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype  = torch.float16 if device == "cuda" else torch.float32

    logger.info("Loading Stable Diffusion model '%s' on %s …", SD_MODEL, device)
    pipe = StableDiffusionPipeline.from_pretrained(
        SD_MODEL,
        torch_dtype=dtype,
        safety_checker=None,
        requires_safety_checker=False,
    ).to(device)

    if device == "cuda":
        pipe.enable_attention_slicing()

    _sd_pipeline = pipe
    return _sd_pipeline


def _generate_with_sd(visual_prompt: str):
    import torch

    enhanced_prompt = (
        f"{visual_prompt}, high quality, professional photography, "
        "sharp focus, 4k resolution, cinematic lighting"
    )
    negative_prompt = (
        "blurry, low quality, distorted, deformed, ugly, bad anatomy, "
        "watermark, text, duplicate, extra limbs"
    )

    pipe = _get_sd_pipeline()
    with torch.no_grad():
        result = pipe(
            enhanced_prompt,
            negative_prompt=negative_prompt,
            num_inference_steps=30,
            guidance_scale=7.5,
            width=768,
            height=432,   # 16:9
        )
    return result.images[0]


# ──────────────────────────────────────────────────────────────────────────────
# PIL placeholder (fallback)
# ──────────────────────────────────────────────────────────────────────────────

def _generate_placeholder(prompt: str, filepath: str, scene_number: int) -> str:
    from PIL import Image, ImageDraw, ImageFont

    WIDTH, HEIGHT = 1280, 720
    COLORS = [
        (30, 60, 90), (20, 80, 60), (80, 40, 80),
        (90, 50, 20), (20, 70, 90), (70, 20, 50),
    ]
    bg_color = COLORS[(scene_number - 1) % len(COLORS)]

    img  = Image.new("RGB", (WIDTH, HEIGHT), bg_color)
    draw = ImageDraw.Draw(img)

    # Gradient-like overlay
    for y in range(HEIGHT):
        alpha = int(30 * y / HEIGHT)
        draw.line([(0, y), (WIDTH, y)], fill=(alpha, alpha, alpha))

    # Scene label
    label = f"Scene {scene_number}"
    try:
        font_large = ImageFont.truetype("arial.ttf", 60)
        font_small = ImageFont.truetype("arial.ttf", 28)
    except OSError:
        font_large = ImageFont.load_default()
        font_small = font_large

    # Center the scene number
    draw.text((WIDTH // 2, HEIGHT // 2 - 60), label, fill=(255, 255, 255), font=font_large, anchor="mm")

    # Wrap and draw prompt text
    words  = prompt.split()
    lines  = []
    line   = ""
    for w in words:
        if len(line) + len(w) + 1 > 70:
            lines.append(line)
            line = w
        else:
            line = (line + " " + w).strip()
    if line:
        lines.append(line)

    y_start = HEIGHT // 2 + 20
    for i, text_line in enumerate(lines[:4]):
        draw.text(
            (WIDTH // 2, y_start + i * 36),
            text_line,
            fill=(200, 220, 255),
            font=font_small,
            anchor="mm",
        )

    img.save(filepath)
    logger.info("Placeholder image saved: %s", filepath)
    return filepath
