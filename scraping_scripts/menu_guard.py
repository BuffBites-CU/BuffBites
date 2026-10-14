"""Safe-write helper shared by every dining scraper.

Nutrislice occasionally returns empty weeks (outage, renamed menu, break week)
or fails a request outright. Without a guard, one bad scrape overwrites a good
JSON file with empty or missing days and the app shows "no menu" until someone
notices. `guarded_write` refuses to replace a file that has menus with one that
has none (in total, or from today on), or with an incomplete scrape that covers
fewer upcoming days, and exits non-zero so the GitHub Actions step is flagged.
"""

import json
import sys
from datetime import date, datetime
from pathlib import Path
from typing import NoReturn
from zoneinfo import ZoneInfo


def count_items(result: dict) -> int:
    return sum(
        len(items)
        for day in result.get("menus", [])
        for items in (day.get("categories") or {}).values()
    )


def upcoming_days(result: dict, today: date) -> int:
    """Days from `today` on that have at least one item."""
    return sum(
        1
        for day in result.get("menus", [])
        if day.get("date", "") >= today.isoformat() and any((day.get("categories") or {}).values())
    )


def _refuse(message: str) -> NoReturn:
    print(f"\n[guard] {message}", file=sys.stderr)
    sys.exit(1)


def guarded_write(
    output: Path,
    result: dict,
    allow_empty: bool = False,
    incomplete: bool = False,
    today: date | None = None,
) -> bool:
    """Write `result` to `output` unless it would wipe out existing menu data.

    Returns True if the file was written. Exits with status 1 when the new
    scrape is empty, so CI surfaces the failure instead of silently committing
    blank menus. `allow_empty=True` is for halls that are known to be closed:
    an empty scrape is expected there, as long as it isn't replacing real data.
    `incomplete=True` means some requests failed: the file is then only
    replaced if the scrape still has at least as many upcoming days with menus.
    """
    old: dict = {}
    if output.exists():
        try:
            old = json.loads(output.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            old = {}
    new_count = count_items(result)
    old_count = count_items(old)

    if new_count == 0:
        if old_count > 0:
            _refuse(
                f"Scrape returned 0 items — keeping existing {output.name} "
                f"({old_count} items). Check the Nutrislice slugs."
            )
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
        if allow_empty:
            print(f"\n[guard] {output.name}: no menu published (hall is closed).")
            return True
        _refuse(f"Scrape returned 0 items for {output.name}.")

    today = today or datetime.now(ZoneInfo("America/Denver")).date()
    old_upcoming = upcoming_days(old, today)
    new_upcoming = upcoming_days(result, today)
    if old_upcoming and not new_upcoming:
        _refuse(
            f"Scrape has no menus from {today} on — keeping existing {output.name} "
            f"({old_upcoming} upcoming days). Check the Nutrislice slugs."
        )
    if incomplete and new_upcoming < old_upcoming:
        _refuse(
            f"Some requests failed and the scrape has {new_upcoming} upcoming days with "
            f"menus — keeping existing {output.name} ({old_upcoming})."
        )

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    return True
