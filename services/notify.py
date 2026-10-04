"""User notifications for long-running renders.

A video can take many minutes. Nobody watches a progress bar that long — they
close the tab and forget the product exists. Telling them when it is ready is
the cheapest retention work available, and the SMTP path is already proven:
backend/auth.py sends OTP and password-reset mail through it today.

Never raises. A mail failure must not affect a render that already succeeded.
"""

import os
import logging

logger = logging.getLogger(__name__)


def _app_url() -> str:
    return os.getenv("APP_URL", "http://localhost:7000").rstrip("/")


def _enabled() -> bool:
    if os.getenv("NOTIFY_ON_COMPLETE", "true").lower() != "true":
        return False
    return bool(os.getenv("SMTP_USERNAME") and os.getenv("SMTP_PASSWORD"))


def _shell(title: str, body_html: str, cta_label: str, cta_url: str) -> str:
    """Shared email chrome, matching the product's dusk palette."""
    return f"""<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0e1119;font-family:Inter,Segoe UI,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#161b28;border:1px solid rgba(100,120,212,0.18);border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#6478D4,#A99BC8);height:3px;"></div>
    <div style="padding:36px 34px;">
      <h1 style="color:#e5eaf6;font-size:1.35rem;font-weight:700;margin:0 0 10px;letter-spacing:-0.02em;">{title}</h1>
      {body_html}
      <a href="{cta_url}" style="display:inline-block;margin-top:26px;background:linear-gradient(135deg,#6478D4,#A99BC8);color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:600;font-size:0.92rem;">{cta_label}</a>
      <p style="color:rgba(229,234,246,0.34);font-size:0.72rem;margin:28px 0 0;line-height:1.6;">
        You're getting this because you started a render on Mukku AI Studio.
        Turn these off in Dashboard &rarr; Profile.
      </p>
    </div>
  </div>
</body></html>"""


def video_ready(to_addr: str, name: str, project_id: str, prompt: str,
                duration_seconds: float | None = None) -> bool:
    """Tell a user their video finished."""
    if not _enabled() or not to_addr:
        return False

    try:
        from backend.auth import _send_email
    except Exception as exc:
        logger.debug("Notification skipped — mailer unavailable: %s", exc)
        return False

    excerpt = (prompt or "").strip()
    if len(excerpt) > 120:
        excerpt = excerpt[:117].rstrip() + "…"

    took = ""
    if duration_seconds:
        mins = int(duration_seconds // 60)
        took = f" It took {mins} minute{'' if mins == 1 else 's'}." if mins else ""

    url = f"{_app_url()}/dashboard"
    first = (name or "there").split(" ")[0]

    text = (
        f"Hi {first},\n\nYour video is ready.\n\n"
        f'"{excerpt}"\n\n{url}\n\n— Mukku AI Studio'
    )
    html = _shell(
        "Your video is ready",
        f'<p style="color:rgba(229,234,246,0.62);font-size:0.92rem;line-height:1.7;margin:0;">'
        f'Hi {first}, the video you asked for has finished rendering.{took}</p>'
        f'<div style="margin-top:18px;padding:14px 16px;background:rgba(0,0,0,0.25);'
        f'border-left:2px solid #6478D4;border-radius:0 8px 8px 0;color:rgba(229,234,246,0.72);'
        f'font-size:0.86rem;line-height:1.6;">{excerpt}</div>',
        "Watch it now", url,
    )

    ok = _send_email(to_addr, "Your Mukku video is ready", html, text)
    logger.info("Completion email to %s for %s: %s", to_addr, project_id,
                "sent" if ok else "failed")
    return ok


def video_failed(to_addr: str, name: str, project_id: str, reason: str) -> bool:
    """Tell a user a render failed, so they retry instead of assuming it hung."""
    if not _enabled() or not to_addr:
        return False

    try:
        from backend.auth import _send_email
    except Exception:
        return False

    url = f"{_app_url()}/studio"
    first = (name or "there").split(" ")[0]
    safe_reason = (reason or "").split("\n")[0][:160]

    text = (
        f"Hi {first},\n\nA video you started could not be completed.\n\n"
        f"{safe_reason}\n\nThis did not use up any of your monthly quota. "
        f"Try again here: {url}\n\n— Mukku AI Studio"
    )
    html = _shell(
        "That render didn't finish",
        f'<p style="color:rgba(229,234,246,0.62);font-size:0.92rem;line-height:1.7;margin:0;">'
        f'Hi {first}, a video you started could not be completed.</p>'
        f'<div style="margin-top:18px;padding:14px 16px;background:rgba(0,0,0,0.25);'
        f'border-left:2px solid #E0A85C;border-radius:0 8px 8px 0;color:rgba(229,234,246,0.72);'
        f'font-size:0.86rem;">{safe_reason}</div>'
        f'<p style="color:rgba(229,234,246,0.5);font-size:0.85rem;margin:16px 0 0;">'
        f'This did not use any of your monthly quota.</p>',
        "Try again", url,
    )

    return _send_email(to_addr, "Your Mukku render didn't finish", html, text)
