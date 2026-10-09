"""Safe-write helper shared by every dining scraper.

Nutrislice occasionally returns empty weeks (outage, renamed menu, break week).
Without a guard, one bad scrape overwrites a good JSON file with empty days and
the app shows "no menu" until someone notices. `guarded_write` refuses to
replace a file that has items with one that has none, and exits non-zero so the
GitHub Actions step is flagged.
"""

import json
import sys
from pathlib import Path


def count_items(result: dict) -> int:
    return sum(
        len(items)
        for day in result.get("menus", [])
        for items in (day.get("categories") or {}).values()
    )


def guarded_write(output: Path, result: dict) -> bool:
    """Write `result` to `output` unless it would wipe out existing menu data.

    Returns True if the file was written. Exits with status 1 when the new
    scrape is empty, so CI surfaces the failure instead of silently committing
    blank menus.
    """
    new_count = count_items(result)
    old_count = 0
    if output.exists():
        try:
            old_count = count_items(json.loads(output.read_text(encoding="utf-8")))
        except (ValueError, OSError):
            old_count = 0

    if new_count == 0:
        if old_count > 0:
            print(
                f"\n[guard] Scrape returned 0 items — keeping existing {output.name} "
                f"({old_count} items). Check the Nutrislice slugs.",
                file=sys.stderr,
            )
            sys.exit(1)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\n[guard] Scrape returned 0 items for {output.name}.", file=sys.stderr)
        sys.exit(1)

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    return True
