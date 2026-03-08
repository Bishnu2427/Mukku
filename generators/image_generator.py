"""Image generation — tries Leonardo.ai, falls back to PIL placeholder.

NOTE: Stable Diffusion local fallback is disabled by default because it is
extremely slow on CPU (20–30 min/image) and blocks the pipeline for hours.
Set SKIP_SD=false in .env to re-enable it if you have a CUDA GPU available.
"""

import os
import time
import logging
import requests
import concurrent.futures
from pathlib import Path

logger = logging.getLogger(__name__)

ROOT             = Path(__file__).resolve().parent.parent
IMAGES_DIR       = ROOT / "media" / "images"

LEONARDO_API_KEY = os.getenv("LEONARDO_API", "").strip()
LEONARDO_BASE    = "https://cloud.leonardo.ai/api/rest/v1"
# Leonardo Phoenix — photorealistic, cinematic quality
LEONARDO_MODEL   = os.getenv("LEONARDO_MODEL", "6b645e3a-d64f-4341-a6d8-7a3690fbf042")

_sd_pipeline = None


# Maps aspect ratio string → (width, height) for Leonardo
_AR_SIZES = {
    "16:9": (1024, 576),
    "9:16": (576, 1024),
    "1:1":  (768, 768),
}

# Per-style prompt suffixes and Leonardo presets
_STYLE_CONFIG = {
    "photorealistic": {
        "suffix":      "realistic photograph, natural lighting, sharp focus, shot on Canon EOS R5, 4k",
        "negative":    "painting, illustration, cartoon, anime, drawing, CGI, render, blurry, watermark, text, distorted, deformed",
        "presetStyle": "PHOTOGRAPHY",
    },
    "cinematic": {
        "suffix":      "cinematic film still, anamorphic lens, dramatic lighting, shallow depth of field, 4k",
        "negative":    "blurry, low quality, watermark, text, distorted, deformed, cartoon, anime",
        "presetStyle": "CINEMATIC",
    },
    "documentary": {
        "suffix":      "documentary photography, candid shot, natural daylight, photojournalism style, 4k",
        "negative":    "posed, studio lighting, artificial, cartoon, anime, illustration, watermark, text, blurry",
        "presetStyle": "PHOTOGRAPHY",
    },
}


def generate_image(visual_prompt: str, project_id: str, scene_number: int,
                   image_style: str = "photorealistic", aspect_ratio: str = "16:9") -> str:
    """Generate a scene image and return the local file path of the saved PNG.

    Pipeline:
      1. Leonardo.ai (hard 3-minute per-image timeout)
      2. Local Stable Diffusion (only if SKIP_SD=false AND CUDA is available)
      3. PIL gradient placeholder (always succeeds immediately)
    """
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{project_id}_scene{scene_number:02d}.png"
    filepath = str(IMAGES_DIR / filename)

    # Skip SD by default — it is catastrophically slow on CPU and blocks the
    # entire pipeline for hours when Leonardo.ai fails.
    skip_sd = os.getenv("SKIP_SD", "true").lower() != "false"

    if LEONARDO_API_KEY:
        try:
            # Wrap in a thread so we can enforce a hard wall-clock timeout.
            # Leonardo polls up to 150 s internally; outer limit is 3 minutes.
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
                fut = ex.submit(_leonardo_generate, visual_prompt, image_style, aspect_ratio)
                url = fut.result(timeout=180)
            _download_file(url, filepath)
            logger.info("Leonardo.ai image saved: %s", filepath)
            return filepath
        except concurrent.futures.TimeoutError:
            logger.warning("Leonardo.ai hard-timeout (180 s) for scene %d — using placeholder.", scene_number)
        except Exception as exc:
            logger.warning("Leonardo.ai failed (%s) — skipping to placeholder.", exc)

    if not skip_sd:
        try:
            return _generate_with_sd(visual_prompt, filepath)
        except Exception as exc:
            logger.warning("Stable Diffusion failed (%s) — using placeholder.", exc)

    return _generate_placeholder(visual_prompt, filepath, scene_number)


def _leonardo_generate(prompt: str, image_style: str = "photorealistic",
                        aspect_ratio: str = "16:9") -> str:
    """Submit a generation job to Leonardo.ai and return the image URL when ready."""
    headers = {
        "Authorization": f"Bearer {LEONARDO_API_KEY}",
        "Content-Type": "application/json",
    }

    style_cfg = _STYLE_CONFIG.get(image_style, _STYLE_CONFIG["photorealistic"])
    w, h      = _AR_SIZES.get(aspect_ratio, (1024, 576))

    enhanced = f"{prompt}, {style_cfg['suffix']}"
    negative = style_cfg["negative"]

    body = {
        "prompt":              enhanced,
        "negative_prompt":     negative,
        "modelId":             LEONARDO_MODEL,
        "width":               w,
        "height":              h,
        "num_images":          1,
        "guidance_scale":      7,
        "num_inference_steps": 25,
        "alchemy":             True,
        "highResolution":      False,
        "presetStyle":         style_cfg.get("presetStyle", "NONE"),
    }

    resp = requests.post(
        f"{LEONARDO_BASE}/generations",
        json=body, headers=headers, timeout=30,
    )
    resp.raise_for_status()
    gen_id = resp.json()["sdGenerationJob"]["generationId"]
    logger.info("Leonardo.ai generation queued: %s", gen_id)

    # poll until complete (max ~2 minutes; outer wrapper enforces 3-min hard cap)
    for attempt in range(12):
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

        logger.info("Leonardo.ai poll %d/12 — status: %s", attempt + 1, status)

    raise TimeoutError("Leonardo.ai timed out — falling back to placeholder.")


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
