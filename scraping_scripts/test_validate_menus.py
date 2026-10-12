"""Run with: python -m pytest scraping_scripts/test_validate_menus.py"""
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from validate_menus import check  # noqa: E402

SUNDAY = date(2026, 10, 11)


def days(start: date, n: int, items_on=lambda d: True) -> list[dict]:
    out = []
    for i in range(n):
        d = start + timedelta(days=i)
        cats = {"Grill": [{"name": "Burger"}]} if items_on(d) else {}
        out.append({"date": d.isoformat(), "categories": cats})
    return out


weekdays_only = lambda d: d.weekday() < 5  # noqa: E731


def test_hall_closed_on_weekend_is_not_a_failure():
    rows, failed = check({"libby": days(SUNDAY - timedelta(days=7), 28, weekdays_only)}, SUNDAY)
    assert failed == [] and rows[0][3] == "closed today"


def test_open_hall_with_menu_today_is_ok():
    rows, failed = check({"c4c": days(SUNDAY - timedelta(days=7), 28)}, SUNDAY)
    assert failed == [] and rows[0][3] == "ok"


def test_nothing_in_the_coming_week_fails():
    menus = days(SUNDAY - timedelta(days=14), 28, lambda d: d < SUNDAY)
    rows, failed = check({"sewall": menus}, SUNDAY)
    assert failed == ["sewall"] and rows[0][3].startswith("FAIL: no menus")


def test_data_about_to_run_out_fails():
    menus = days(SUNDAY - timedelta(days=20), 22)  # last day = tomorrow
    rows, failed = check({"c4c": menus}, SUNDAY)
    assert failed == ["c4c"] and rows[0][3].startswith("FAIL: data ends")


def test_long_term_closed_hall_never_fails():
    rows, failed = check({"alley": days(SUNDAY, 14, lambda d: False)}, SUNDAY)
    assert failed == [] and rows[0][3] == "closed (expected)"
