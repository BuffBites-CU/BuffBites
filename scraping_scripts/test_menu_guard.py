"""Run with: python -m pytest scraping_scripts/test_menu_guard.py"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
from menu_guard import guarded_write  # noqa: E402

FULL = {"menus": [{"date": "2026-10-09", "categories": {"Grill": [{"name": "Burger"}]}}]}
EMPTY = {"menus": [{"date": "2026-10-09", "categories": {}}]}


def test_writes_real_data(tmp_path):
    out = tmp_path / "m.json"
    assert guarded_write(out, FULL)
    assert json.loads(out.read_text()) == FULL


def test_refuses_to_wipe_real_data(tmp_path):
    out = tmp_path / "m.json"
    out.write_text(json.dumps(FULL))
    with pytest.raises(SystemExit) as exc:
        guarded_write(out, EMPTY)
    assert exc.value.code == 1
    assert json.loads(out.read_text()) == FULL


def test_refuses_to_wipe_real_data_even_for_closed_hall(tmp_path):
    out = tmp_path / "m.json"
    out.write_text(json.dumps(FULL))
    with pytest.raises(SystemExit):
        guarded_write(out, EMPTY, allow_empty=True)
    assert json.loads(out.read_text()) == FULL


def test_empty_scrape_fails_for_open_hall(tmp_path):
    with pytest.raises(SystemExit) as exc:
        guarded_write(tmp_path / "m.json", EMPTY)
    assert exc.value.code == 1


def test_empty_scrape_ok_for_closed_hall(tmp_path):
    out = tmp_path / "m.json"
    assert guarded_write(out, EMPTY, allow_empty=True)
    assert json.loads(out.read_text()) == EMPTY


def test_live_menus_keep_window_and_drop_ingredients():
    from datetime import date
    from build_live_menus import slim
    data = {"dining_location": "X", "menus": [
        {"date": d, "categories": {"Grill": [{"name": "Burger", "ingredients": "beef, bun"}]}}
        for d in ["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-19", "2026-10-20"]]}
    live = slim(data, date(2026, 10, 9))
    assert [m["date"] for m in live["menus"]] == ["2026-10-08", "2026-10-09", "2026-10-19"]
    assert "ingredients" not in live["menus"][0]["categories"]["Grill"][0]
    assert live["dining_location"] == "X"
