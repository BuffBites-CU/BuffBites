"""Run with: python -m pytest scraping_scripts/test_menu_guard.py"""
import json
import sys
from datetime import date
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


def _days(*dates):
    return {"menus": [{"date": d, "categories": {"Grill": [{"name": "Burger"}]}} for d in dates]}


TODAY = date(2026, 10, 13)
OLD = _days("2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15")


def test_refuses_scrape_with_nothing_from_today_on(tmp_path):
    out = tmp_path / "m.json"
    out.write_text(json.dumps(OLD))
    with pytest.raises(SystemExit) as exc:
        guarded_write(out, _days("2026-10-11", "2026-10-12"), today=TODAY)
    assert exc.value.code == 1
    assert json.loads(out.read_text()) == OLD


def test_incomplete_scrape_with_fewer_upcoming_days_is_refused(tmp_path):
    out = tmp_path / "m.json"
    out.write_text(json.dumps(OLD))
    with pytest.raises(SystemExit):
        guarded_write(out, _days("2026-10-13", "2026-10-14"), incomplete=True, today=TODAY)
    assert json.loads(out.read_text()) == OLD


def test_incomplete_scrape_covering_as_many_upcoming_days_is_written(tmp_path):
    out = tmp_path / "m.json"
    out.write_text(json.dumps(OLD))
    new = _days("2026-10-13", "2026-10-14", "2026-10-16")
    assert guarded_write(out, new, incomplete=True, today=TODAY)
    assert json.loads(out.read_text()) == new


def test_complete_scrape_may_drop_upcoming_days(tmp_path):
    out = tmp_path / "m.json"
    out.write_text(json.dumps(OLD))
    new = _days("2026-10-13")
    assert guarded_write(out, new, today=TODAY)
    assert json.loads(out.read_text()) == new


def test_live_menus_keep_window_and_drop_ingredients():
    from build_live_menus import slim
    data = {"dining_location": "X", "menus": [
        {"date": d, "categories": {"Grill": [{"name": "Burger", "ingredients": "beef, bun"}]}}
        for d in ["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-19", "2026-10-20"]]}
    live = slim(data, date(2026, 10, 9))
    assert [m["date"] for m in live["menus"]] == ["2026-10-08", "2026-10-09", "2026-10-19"]
    assert "ingredients" not in live["menus"][0]["categories"]["Grill"][0]
    assert live["dining_location"] == "X"


def test_live_menus_are_built_for_every_registered_hall(tmp_path, monkeypatch, capsys):
    import build_live_menus
    from halls import HALLS
    monkeypatch.setattr(build_live_menus, "DATA_DIR", tmp_path)
    monkeypatch.setattr(build_live_menus, "LIVE_DIR", tmp_path / "live")
    (tmp_path / HALLS["c4c"].file).write_text(json.dumps(FULL))
    (tmp_path / "old_hall_dining_menus.json").write_text(json.dumps(FULL))
    build_live_menus.main()
    assert [p.name for p in (tmp_path / "live").iterdir()] == [HALLS["c4c"].file]
    assert "libby_dining_menus.json: missing" in capsys.readouterr().err
