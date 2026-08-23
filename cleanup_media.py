"""
Cleanup script — deletes generated media files older than MAX_AGE_HOURS.
Skips user uploads so they aren't deleted without warning.

Run manually:    python cleanup_media.py
Cron (daily 3am): 0 3 * * * /opt/mukku/venv/bin/python /opt/mukku/cleanup_media.py
"""

import os
import time
import logging
import argparse
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
)
logger = logging.getLogger("cleanup")

ROOT      = Path(__file__).resolve().parent
MEDIA_DIR = ROOT / "media"

# Directories to clean and their individual age limits (hours)
# uploads/ is excluded — those belong to users
CLEANUP_TARGETS = {
    "images":  24,   # generated scene images
    "clips":   24,   # generated video clips
    "audio":   24,   # generated narration WAVs
    "music":   48,   # background music tracks
    "thumbs":  72,   # thumbnails (lightweight, keep longer)
    "videos":  72,   # final MP4s (users may want to re-download)
}


def cleanup(dry_run: bool = False) -> None:
    now     = time.time()
    removed = 0
    freed   = 0

    for folder, max_age_hours in CLEANUP_TARGETS.items():
        target = MEDIA_DIR / folder
        if not target.exists():
            continue

        cutoff = now - (max_age_hours * 3600)

        for path in target.iterdir():
            if not path.is_file():
                continue
            try:
                mtime = path.stat().st_mtime
                size  = path.stat().st_size
            except OSError:
                continue

            if mtime < cutoff:
                age_h = (now - mtime) / 3600
                if dry_run:
                    logger.info("DRY-RUN  would delete %s  (%.1fh old, %.1f KB)",
                                path.relative_to(ROOT), age_h, size / 1024)
                else:
                    try:
                        path.unlink()
                        logger.info("Deleted  %s  (%.1fh old, %.1f KB)",
                                    path.relative_to(ROOT), age_h, size / 1024)
                        removed += 1
                        freed   += size
                    except OSError as exc:
                        logger.warning("Could not delete %s: %s", path, exc)

    # Also remove empty project upload subdirectories (not files)
    uploads_dir = MEDIA_DIR / "uploads"
    if uploads_dir.exists():
        for project_dir in uploads_dir.iterdir():
            if project_dir.is_dir() and not any(project_dir.iterdir()):
                if dry_run:
                    logger.info("DRY-RUN  would remove empty dir %s", project_dir.name)
                else:
                    try:
                        project_dir.rmdir()
                        logger.info("Removed empty upload dir: %s", project_dir.name)
                    except OSError:
                        pass

    if not dry_run:
        logger.info("Done — removed %d files, freed %.1f MB", removed, freed / 1024 / 1024)
    else:
        logger.info("Dry run complete — no files were deleted")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Clean up old generated media files")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be deleted without deleting anything")
    args = parser.parse_args()
    cleanup(dry_run=args.dry_run)
