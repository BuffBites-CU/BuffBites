#!/usr/bin/env python3
"""Sanity-check the scraped menu JSON after a scrape run.

Prints one row per dining hall (items today, last scraped date) and writes the
same table to the GitHub Actions job summary. Exits 1 if a hall that should be
serving has no menu for today (Mountain Time), so a broken scrape is visible in
the Actions tab instead of surfacing as an empty screen in the app.
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

DATA_DIR = Path(__file__).parent / "data"
HALLS = {
    "alley":          "alley_dining_menus.json",
    "c4c":            "c4c_dining_menus.json",
    "libby":          "libby_dining_menus.json",
    "seec":           "seec_dining_menus.json",
    "sewall":         "sewall_dining_menus.json",
    "village_center": "village_center_dining_menus.json",
}
# SEEC is weekday-only and The Alley's menu is intermittently unpublished, so
# they warn instead of failing the run.
OPTIONAL = {"seec", "alley"}


def main() -> int:
    today = datetime.now(ZoneInfo("America/Denver")).date().isoformat()
    rows, failed = [], []
    for key, fname in HALLS.items():
        path = DATA_DIR / fname
        try:
            menus = json.loads(path.read_text(encoding="utf-8")).get("menus", [])
        except (OSError, ValueError) as exc:
            rows.append((key, "—", "—", f"unreadable: {exc}"))
            failed.append(key)
            continue
        by_date = {
            m["date"]: sum(len(v) for v in (m.get("categories") or {}).values())
            for m in menus
        }
        n_today = by_date.get(today, 0)
        last = max((d for d, n in by_date.items() if n), default="—")
        ok = n_today > 0 or key in OPTIONAL
        status = "ok" if n_today else ("warn: empty today" if ok else "FAIL: empty today")
        rows.append((key, str(n_today), last, status))
        if not ok:
            failed.append(key)

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
