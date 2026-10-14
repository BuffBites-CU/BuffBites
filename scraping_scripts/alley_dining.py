#!/usr/bin/env python3
# Link: https://colorado-diningmenus.nutrislice.com/menu/the-alley/the-alley-at-farrand-s-all-day-id2009

from datetime import timedelta

import requests

from halls import HALLS
from nutrislice import (
    API_BASE, DATA_DIR, MAX_WEEKS, TIMEOUT,
    fetch_weeks, load_previous, make_session, save, start_date, to_menus, today_mt,
)

HALL = HALLS["alley"]
# The Alley at Farrand closed for remodel (CU Dining lists it as expected to
# reopen Aug 2028), which is why every scrape since August has been empty. We
# keep scraping so the menu shows up automatically when it reopens: discover the
# live school + menu types from the schools index, then fall back to these.
FALLBACK_SOURCES: list[tuple[str | int, str | int]] = [
    *((HALL.school, slug) for slug, _ in HALL.menus),
    (38643, 8911),
]
DISCOVERY_KEYWORDS = ("alley", "farrand")


def discover_sources(session: requests.Session) -> list[tuple[str | int, str | int]]:
    """Find every active menu type for any school matching The Alley / Farrand."""
    sources: list[tuple[str | int, str | int]] = []
    try:
        resp = session.get(f"{API_BASE}/menu/api/schools/", timeout=TIMEOUT)
        resp.raise_for_status()
        schools = resp.json()
    except Exception as exc:
        print(f"Discovery failed — {exc}")
        return sources

    if not isinstance(schools, list):
        print(f"Discovery: unexpected schools response ({type(schools).__name__}), using fallbacks")
        return sources

    for school in schools:
        haystack = f"{school.get('name', '')} {school.get('slug', '')}".lower()
        if not any(k in haystack for k in DISCOVERY_KEYWORDS):
            continue
        for mt in school.get("active_menu_types") or school.get("menu_types") or []:
            mt_key = mt.get("slug") or mt.get("id")
            if mt_key:
                sources.append((school.get("slug") or school.get("id"), mt_key))
                print(f"Discovered: {school.get('name')} → {mt.get('name')} ({mt_key})")
    if not sources:
        print(f"Discovery: no school matching {DISCOVERY_KEYWORDS} among {len(schools)} schools")
    return sources


def main() -> None:
    today   = today_mt()
    start   = start_date(today)
    output  = DATA_DIR / HALL.file
    session = make_session()

    sources = discover_sources(session)
    for fb in FALLBACK_SOURCES:
        if fb not in sources:
            sources.append(fb)

    weeks, failures = fetch_weeks(
        session, [(school, menu_type, None) for school, menu_type in sources], start, load_previous(output)
    )
    result = {
        "dining_location": HALL.name,
        "url": HALL.url,
        "date_range": {
            "start": start.isoformat(),
            "end":   (start + timedelta(weeks=MAX_WEEKS, days=-1)).isoformat(),
            "weeks": MAX_WEEKS,
        },
        "menus": to_menus(weeks),
    }
    # Closed for remodel, so an empty scrape is expected. menu_guard still refuses
    # to overwrite real data with an empty scrape if Nutrislice glitches later.
    save(output, result, failures, closed=HALL.closed, today=today)


if __name__ == "__main__":
    main()
