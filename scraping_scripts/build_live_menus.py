#!/usr/bin/env python3
"""Write small "live" copies of the scraped menus for the API to load.

The full files (data/*.json) keep 6 weeks of history with ingredient text;
C4C alone is ~18 MB, and parsing it needs ~80 MB of RAM, which crashes the
256 MB Fly machines. The API only ever asks for dates near today and never
reads ingredients, so data/live/*.json keeps just that: minified, no
ingredients, dates from LIVE_PAST_DAYS ago to LIVE_FUTURE_DAYS ahead (MT).
"""

import json
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

DATA_DIR = Path(__file__).parent / "data"
LIVE_DIR = DATA_DIR / "live"
LIVE_PAST_DAYS = 1
LIVE_FUTURE_DAYS = 10
DROP_FIELDS = ("ingredients",)


def slim(data: dict, today) -> dict:
    lo = (today - timedelta(days=LIVE_PAST_DAYS)).isoformat()
    hi = (today + timedelta(days=LIVE_FUTURE_DAYS)).isoformat()
    menus = [m for m in data.get("menus", []) if lo <= m.get("date", "") <= hi]
    for day in menus:
        for items in (day.get("categories") or {}).values():
            for item in items:
                for f in DROP_FIELDS:
                    item.pop(f, None)
    return {k: v for k, v in data.items() if k != "menus"} | {"menus": menus}


def main() -> None:
    today = datetime.now(ZoneInfo("America/Denver")).date()
    LIVE_DIR.mkdir(exist_ok=True)
    for src in sorted(DATA_DIR.glob("*_dining_menus.json")):
        live = slim(json.loads(src.read_text(encoding="utf-8")), today)
        out = LIVE_DIR / src.name
        out.write_text(json.dumps(live, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{out.relative_to(DATA_DIR.parent)}: {len(live['menus'])} days, {out.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
