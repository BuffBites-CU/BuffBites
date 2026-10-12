"""In-memory menu store with periodic refresh from the scraped JSON on GitHub.

The daily scrape workflow commits fresh JSON to the repo, but the Docker image
only contains whatever JSON existed at deploy time. Without a refresh, the
deployed API serves stale menus (and eventually 404s "No menu found") until
someone redeploys. This module:

- loads each dining hall's JSON from the bundled data dir once and keeps it in
  memory (the C4C file alone is ~17 MB — re-parsing it per request is slow);
- every MENU_REFRESH_SECONDS, re-downloads each file from MENU_DATA_URL
  (defaults to the public repo's raw main branch) and swaps it in if it parses
  and has items. Any failure keeps the last good copy.

Set MENU_DATA_URL="" to disable remote refresh (e.g. local dev offline).
"""

import asyncio
import gc
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from threading import Lock
from zoneinfo import ZoneInfo

DINING_FILES: dict[str, str] = {
    "alley":          "alley_dining_menus.json",
    "c4c":            "c4c_dining_menus.json",
    "libby":          "libby_dining_menus.json",
    "seec":           "seec_dining_menus.json",
    "sewall":         "sewall_dining_menus.json",
    "village_center": "village_center_dining_menus.json",
}

# Halls that aren't serving. Requests for them get a clear 404 instead of
# "No menu found". Remove the entry when the hall reopens.
CLOSED_HALLS: dict[str, str] = {
    "alley": "The Alley is closed for remodel (expected to reopen Aug 2028). Try C4C or Sewall.",
}

MENU_DATA_URL = os.getenv(
    "MENU_DATA_URL",
    # The small live copies (scraping_scripts/build_live_menus.py), not the full
    # 6-week files: parsing full C4C needs ~80 MB and OOM-killed the 256 MB VMs.
    "https://raw.githubusercontent.com/BuffBites-CU/BuffBites/main/scraping_scripts/data/live",
).rstrip("/")
MENU_REFRESH_SECONDS = int(os.getenv("MENU_REFRESH_SECONDS", "3600"))
# Let the machine pass its health checks before the first download.
MENU_REFRESH_INITIAL_DELAY = int(os.getenv("MENU_REFRESH_INITIAL_DELAY", "60"))

# In Docker the data is copied to backend/scraping_scripts/data; in local dev it
# lives at the repo root. Pick whichever exists so both layouts work.
_BACKEND_DIR = Path(__file__).parent
DATA_DIR = next(
    (
        p
        for p in (
            _BACKEND_DIR / "scraping_scripts" / "data",
            _BACKEND_DIR.parent / "scraping_scripts" / "data",
        )
        if p.is_dir()
    ),
    _BACKEND_DIR / "scraping_scripts" / "data",
)

# Fly machines have 256 MB. Keep only the dates the app can ask for and drop
# fields the API never reads (ingredients is most of the file size).
_KEEP_PAST_DAYS = 7
_KEEP_FUTURE_DAYS = 28
_DROP_FIELDS = ("ingredients",)

_cache: dict[str, dict] = {}
_etags: dict[str, str] = {}
_lock = Lock()


def _slim(data: dict) -> dict:
    today = datetime.now(ZoneInfo("America/Denver")).date()
    lo = (today - timedelta(days=_KEEP_PAST_DAYS)).isoformat()
    hi = (today + timedelta(days=_KEEP_FUTURE_DAYS)).isoformat()
    menus = [m for m in data.get("menus", []) if lo <= m.get("date", "") <= hi]
    for day in menus:
        for items in (day.get("categories") or {}).values():
            for item in items:
                for f in _DROP_FIELDS:
                    item.pop(f, None)
    data["menus"] = menus
    return data


def _has_items(data: dict) -> bool:
    return any(
        items
        for day in data.get("menus", [])
        for items in (day.get("categories") or {}).values()
    )


def load_menu(dining: str) -> dict:
    """Return the parsed menu JSON for a dining hall (cached in memory)."""
    with _lock:
        cached = _cache.get(dining)
    if cached is not None:
        return cached
    live = DATA_DIR / "live" / DINING_FILES[dining]
    path = live if live.exists() else DATA_DIR / DINING_FILES[dining]
    data = _slim(json.loads(path.read_text(encoding="utf-8")))
    with _lock:
        _cache.setdefault(dining, data)
        return _cache[dining]


class _NotModified(Exception):
    pass


def _fetch_remote(dining: str) -> dict | None:
    url = f"{MENU_DATA_URL}/{DINING_FILES[dining]}"
    headers = {"User-Agent": "buffbites-backend"}
    if dining in _etags:
        headers["If-None-Match"] = _etags[dining]
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            etag = resp.headers.get("ETag")
    except urllib.error.HTTPError as e:
        if e.code == 304:  # unchanged since last pull: skip the download and parse
            raise _NotModified from None
        raise
    data = json.loads(raw)
    del raw
    if not isinstance(data, dict) or not isinstance(data.get("menus"), list):
        return None
    if etag:
        _etags[dining] = etag
    return _slim(data)


def refresh_all() -> dict[str, str]:
    """Pull every hall from MENU_DATA_URL. Returns {dining: status} for logging."""
    status: dict[str, str] = {}
    if not MENU_DATA_URL:
        return {d: "disabled" for d in DINING_FILES}
    for dining in DINING_FILES:
        try:
            data = _fetch_remote(dining)
        except _NotModified:
            status[dining] = "unchanged"
            continue
        except Exception as exc:  # network, JSON, HTTP errors — keep last good copy
            status[dining] = f"error: {exc}"
            continue
        if data is None or not _has_items(data):
            status[dining] = "skipped: empty"
            continue
        with _lock:
            old = _cache.get(dining)
            _cache[dining] = data
        del old, data
        gc.collect()  # return the replaced copy's memory before the next hall
        status[dining] = "ok"
    return status


async def refresh_loop() -> None:
    """Background task: refresh menus shortly after boot, then every MENU_REFRESH_SECONDS."""
    await asyncio.sleep(MENU_REFRESH_INITIAL_DELAY)
    while True:
        status = await asyncio.to_thread(refresh_all)
        print(f"[MENU REFRESH] {status}", file=sys.stderr)
        await asyncio.sleep(MENU_REFRESH_SECONDS)
