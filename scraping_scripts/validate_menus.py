#!/usr/bin/env python3
"""Sanity-check the scraped menu JSON after a scrape run.

Prints one row per dining hall (items today, last scraped date) and writes the
same table to the GitHub Actions job summary. Exits 1 only when a scrape looks
broken (no menus in the coming week, or data about to run out), so a hall that
is simply closed today, like Libby on weekends, doesn't turn the run red.
"""

import json
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from halls import HALLS as REGISTRY

DATA_DIR = Path(__file__).parent / "data"
HALLS = {key: hall.file for key, hall in REGISTRY.items()}
# Halls that are closed for a long stretch (`closed` in halls.py). Reported,
# never failed.
CLOSED = {key for key, hall in REGISTRY.items() if hall.closed}

# A hall that is merely closed today (Libby and Sewall on weekends, SEEC on
# weekends) is normal. A broken scrape looks different: nothing at all in the
# coming week, or data that runs out within a few days.
LOOKAHEAD_DAYS = 7
MIN_DAYS_AHEAD = 3


def check(halls: dict[str, list[dict]], today: date) -> tuple[list[tuple], list[str]]:
    """Return (table rows, failed hall keys) for {hall: menus}."""
    rows, failed = [], []
    week = {(today + timedelta(days=i)).isoformat() for i in range(LOOKAHEAD_DAYS)}
    min_last = (today + timedelta(days=MIN_DAYS_AHEAD)).isoformat()
    for key, menus in halls.items():
        by_date = {
            m["date"]: sum(len(v) for v in (m.get("categories") or {}).values())
            for m in menus
        }
        n_today = by_date.get(today.isoformat(), 0)
        n_week = sum(n for d, n in by_date.items() if d in week)
        last = max((d for d, n in by_date.items() if n), default="—")

        if key in CLOSED:
            status = "closed (expected)"
        elif n_week == 0:
            status = f"FAIL: no menus in the next {LOOKAHEAD_DAYS} days"
        elif last < min_last:
            status = f"FAIL: data ends {last}"
        elif n_today == 0:
            status = "closed today"
        else:
            status = "ok"
        if status.startswith("FAIL"):
            failed.append(key)
        rows.append((key, str(n_today), last, status))
    return rows, failed


def main() -> int:
    today = datetime.now(ZoneInfo("America/Denver")).date()
    halls: dict[str, list[dict]] = {}
    unreadable: list[tuple] = []
    for key, fname in HALLS.items():
        try:
            halls[key] = json.loads((DATA_DIR / fname).read_text(encoding="utf-8")).get("menus", [])
        except (OSError, ValueError) as exc:
            unreadable.append((key, "—", "—", f"FAIL: unreadable: {exc}"))

    rows, failed = check(halls, today)
    rows += unreadable
    failed += [r[0] for r in unreadable]

    table = [f"### Menu check — {today} (MT)", "", "| Hall | Items today | Last day with items | Status |", "|---|---|---|---|"]
    table += [f"| {r[0]} | {r[1]} | {r[2]} | {r[3]} |" for r in rows]
    out = "\n".join(table)
    print(out)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write(out + "\n")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
