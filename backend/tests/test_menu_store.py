import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import menu_store


def _today(offset: int = 0) -> str:
    return (datetime.now(ZoneInfo("America/Denver")).date() + timedelta(days=offset)).isoformat()


def _menu(dates: list[str], items: int = 1) -> dict:
    return {
        "dining_location": "Test Hall",
        "menus": [
            {
                "date": d,
                "day_of_week": "Monday",
                "categories": {"Grill": [{"name": f"Dish {i}", "ingredients": "x" * 50} for i in range(items)]},
            }
            for d in dates
        ],
    }


def test_slim_drops_old_dates_and_ingredients():
    data = menu_store._slim(_menu([_today(-30), _today(), _today(60)]))
    assert [m["date"] for m in data["menus"]] == [_today()]
    assert "ingredients" not in data["menus"][0]["categories"]["Grill"][0]


def test_refresh_keeps_last_good_copy_on_empty(monkeypatch):
    menu_store._cache["c4c"] = _menu([_today()])
    monkeypatch.setattr(menu_store, "MENU_DATA_URL", "https://example.invalid")
    monkeypatch.setattr(menu_store, "_fetch_remote", lambda d: _menu([_today()], items=0))
    status = menu_store.refresh_all()
    assert status["c4c"] == "skipped: empty"
    assert menu_store.load_menu("c4c")["menus"][0]["categories"]["Grill"]


def test_refresh_keeps_last_good_copy_on_error(monkeypatch):
    menu_store._cache["c4c"] = _menu([_today()])

    def boom(_):
        raise OSError("network down")

    monkeypatch.setattr(menu_store, "MENU_DATA_URL", "https://example.invalid")
    monkeypatch.setattr(menu_store, "_fetch_remote", boom)
    status = menu_store.refresh_all()
    assert status["c4c"].startswith("error")
    assert menu_store.load_menu("c4c")["dining_location"] == "Test Hall"


def test_refresh_swaps_in_new_data(monkeypatch):
    menu_store._cache["c4c"] = _menu([_today()])
    fresh = _menu([_today()], items=3)
    fresh["dining_location"] = "Fresh Hall"
    monkeypatch.setattr(menu_store, "MENU_DATA_URL", "https://example.invalid")
    monkeypatch.setattr(menu_store, "_fetch_remote", lambda d: json.loads(json.dumps(fresh)))
    menu_store.refresh_all()
    assert menu_store.load_menu("c4c")["dining_location"] == "Fresh Hall"


def test_refresh_skips_unchanged_files(monkeypatch):
    menu_store._cache["c4c"] = _menu([_today()])
    monkeypatch.setattr(menu_store, "MENU_DATA_URL", "https://example.invalid")

    def not_modified(_d):
        raise menu_store._NotModified
    monkeypatch.setattr(menu_store, "_fetch_remote", not_modified)
    assert menu_store.refresh_all()["c4c"] == "unchanged"
    assert menu_store.load_menu("c4c")["dining_location"] == "Test Hall"


def test_load_prefers_small_live_file(monkeypatch, tmp_path):
    (tmp_path / "live").mkdir()
    (tmp_path / "c4c_dining_menus.json").write_text(json.dumps({**_menu([_today()]), "dining_location": "Full"}))
    (tmp_path / "live" / "c4c_dining_menus.json").write_text(json.dumps({**_menu([_today()]), "dining_location": "Live"}))
    monkeypatch.setattr(menu_store, "DATA_DIR", tmp_path)
    menu_store._cache.pop("c4c", None)
    assert menu_store.load_menu("c4c")["dining_location"] == "Live"
