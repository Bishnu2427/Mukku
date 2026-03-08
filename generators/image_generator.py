"""Image generation — tries Leonardo.ai, falls back to local SD, then a PIL placeholder."""

import os
import time
import logging
import requests
from pathlib import Path

logger = logging.getLogger(__name__)

ROOT             = Path(__file__).resolve().parent.parent
IMAGES_DIR       = ROOT / "media" / "images"

LEONARDO_API_KEY = os.getenv("LEONARDO_API", "").strip()
LEONARDO_BASE    = "https://cloud.leonardo.ai/api/rest/v1"
# Leonardo Phoenix — photorealistic, cinematic quality
LEONARDO_MODEL   = os.getenv("LEONARDO_MODEL", "6b645e3a-d64f-4341-a6d8-7a3690fbf042")

_sd_pipeline = None


def generate_image(visual_prompt: str, project_id: str, scene_number: int) -> str:
    """Generate a scene image and return the local file path of the saved PNG."""
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{project_id}_scene{scene_number:02d}.png"
    filepath = str(IMAGES_DIR / filename)

    # try Leonardo.ai first
    if LEONARDO_API_KEY:
        try:
            url = _leonardo_generate(visual_prompt)
            _download_file(url, filepath)
            logger.info("Leonardo.ai image saved: %s", filepath)
            return filepath
        except Exception as exc:
            logger.warning("Leonardo.ai failed (%s) — trying local SD.", exc)

    # fall back to local Stable Diffusion
    try:
        return _generate_with_sd(visual_prompt, filepath)
    except Exception as exc:
        logger.warning("Stable Diffusion failed (%s) — using placeholder.", exc)

    return _generate_placeholder(visual_prompt, filepath, scene_number)


def _leonardo_generate(prompt: str) -> str:
    """Submit a generation job to Leonardo.ai and return the image URL when ready."""
    headers = {
        "Authorization": f"Bearer {LEONARDO_API_KEY}",
        "Content-Type": "application/json",
    }

    enhanced = (
        f"{prompt}, cinematic photography, ultra sharp, professional lighting, "
        "8k resolution, high detail, award-winning photograph"
    )
    negative = (
        "blurry, low quality, distorted, deformed, ugly, watermark, "
        "text overlay, duplicate, bad composition"
    )

    body = {
        "prompt":              enhanced,
        "negative_prompt":     negative,
        "modelId":             LEONARDO_MODEL,
        "width":               1024,
        "height":              576,        # 16:9
        "num_images":          1,
        "guidance_scale":      7,
        "num_inference_steps": 20,
        "alchemy":             True,
        "highResolution":      False,
    }

    resp = requests.post(
        f"{LEONARDO_BASE}/generations",
        json=body, headers=headers, timeout=30,
    )
    resp.raise_for_status()
    gen_id = resp.json()["sdGenerationJob"]["generationId"]
    logger.info("Leonardo.ai generation queued: %s", gen_id)

    # poll until complete (max 5 minutes)
    for attempt in range(30):
        time.sleep(10)
        r = requests.get(
            f"{LEONARDO_BASE}/generations/{gen_id}",
            headers=headers, timeout=15,
        )
        r.raise_for_status()
        data   = r.json().get("generations_by_pk", {})
        status = data.get("status", "")

        if status == "COMPLETE":
            images = data.get("generated_images", [])
            if not images:
                raise RuntimeError("Leonardo returned COMPLETE but no images.")
            return images[0]["url"]

        if status == "FAILED":
            raise RuntimeError("Leonardo generation job failed.")

        logger.debug("Leonardo.ai poll %d — status: %s", attempt + 1, status)

    raise TimeoutError("Leonardo.ai timed out after 5 minutes.")


def _get_sd_pipeline():
    global _sd_pipeline
    if _sd_pipeline is not None:
        return _sd_pipeline

    import torch
    from diffusers import StableDiffusionPipeline

    sd_model = os.getenv("SD_MODEL", "stabilityai/stable-diffusion-2-1")
    device   = "cuda" if torch.cuda.is_available() else "cpu"
    dtype    = torch.float16 if device == "cuda" else torch.float32

    logger.info("Loading Stable Diffusion '%s' on %s …", sd_model, device)
    pipe = StableDiffusionPipeline.from_pretrained(
        sd_model, torch_dtype=dtype,
        safety_checker=None, requires_safety_checker=False,
    ).to(device)

    if device == "cuda":
        pipe.enable_attention_slicing()

    _sd_pipeline = pipe
    return _sd_pipeline


def _generate_with_sd(prompt: str, filepath: str) -> str:
    import torch

    pipe     = _get_sd_pipeline()
    enhanced = f"{prompt}, high quality, professional photography, sharp, 4k"
    negative = "blurry, low quality, distorted, watermark, text"

    with torch.no_grad():
        image = pipe(
            enhanced, negative_prompt=negative,
            num_inference_steps=30, guidance_scale=7.5,
            width=768, height=432,
        ).images[0]

    image.save(filepath)
    logger.info("Stable Diffusion image saved: %s", filepath)
    return filepath


def _generate_placeholder(prompt: str, filepath: str, scene_number: int) -> str:
    from PIL import Image, ImageDraw, ImageFont

    W, H = 1024, 576
    PALETTE = [
        (28, 58, 90), (18, 78, 58), (78, 38, 80),
        (88, 48, 18), (18, 68, 88), (68, 18, 48),
    ]
    bg   = PALETTE[(scene_number - 1) % len(PALETTE)]
    img  = Image.new("RGB", (W, H), bg)
    draw = ImageDraw.Draw(img)

    for y in range(H):
        v = int(25 * y / H)
        draw.line([(0, y), (W, y)], fill=(v, v, v + 10))

    try:
        f_big = ImageFont.truetype("arial.ttf", 56)
        f_sm  = ImageFont.truetype("arial.ttf", 26)
    except OSError:
        f_big = f_sm = ImageFont.load_default()

    draw.text((W // 2, H // 2 - 55), f"Scene {scene_number}",
              fill=(255, 255, 255), font=f_big, anchor="mm")

    words, lines, line = prompt.split(), [], ""
    for w in words:
        if len(line) + len(w) + 1 > 65:
            lines.append(line); line = w
        else:
            line = (line + " " + w).strip()
    if line:
        lines.append(line)

    for i, ln in enumerate(lines[:4]):
        draw.text((W // 2, H // 2 + 18 + i * 34), ln,
                  fill=(190, 215, 255), font=f_sm, anchor="mm")

    img.save(filepath)
    logger.info("Placeholder image saved: %s", filepath)
    return filepath


def _download_file(url: str, filepath: str) -> None:
    r = requests.get(url, timeout=120, stream=True)
    r.raise_for_status()
    with open(filepath, "wb") as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
