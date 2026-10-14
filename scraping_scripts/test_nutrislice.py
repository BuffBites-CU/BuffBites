"""Run with: python -m pytest scraping_scripts/test_nutrislice.py"""
import json
import sys
from datetime import date, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import nutrislice  # noqa: E402
from halls import HALLS, Hall  # noqa: E402
from nutrislice import merge_categories, parse_day, scrape  # noqa: E402

TODAY = date(2026, 10, 13)            # a Tuesday
START = date(2026, 9, 28)             # Monday two weeks before
WINDOW = [START - timedelta(days=1) + timedelta(days=i) for i in range(42)]  # Sun 9/27 .. Sat 11/7
FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "libby_day.json").read_text(encoding="utf-8"))

NUTRITION_KEYS = {
    "fat_g": "g_fat", "saturated_fat_g": "g_saturated_fat", "trans_fat_g": "g_trans_fat",
    "cholesterol_mg": "mg_cholesterol", "sodium_mg": "mg_sodium", "carbohydrates_g": "g_carbs",
    "fiber_g": "g_fiber", "added_sugar_g": "g_added_sugar", "total_sugar_g": "g_sugar",
    "protein_g": "g_protein", "potassium_mg": "mg_potassium", "calcium_mg": "mg_calcium",
    "iron_mg": "mg_iron", "vitamin_d_mcg": "mcg_vitamin_d", "calories": "calories",
}


def raw_food(item: dict) -> dict:
    """The Nutrislice `food` object a saved item was parsed from."""
    rounded = {NUTRITION_KEYS[k]: v for k, v in item["nutrition"].items()}
    rounded["calories"] = item["calories"]
    return {
        "name": item["name"],
        "description": item["description"],
        "ingredients": item["ingredients"],
        "serving_size_info": {"serving_size_amount": item["serving_size"]},
        "rounded_nutrition_info": rounded,
        "icons": {"food_icons": [
            {"slug": n.lower().replace(" ", "-"), "name": n}
            for n in item["allergens"] + item["dietary_labels"]
        ]},
    }


def raw_items(categories: dict) -> list:
    out = []
    for station, items in categories.items():
        out.append({"is_station_header": True, "text": station})
        out += [{"food": raw_food(i)} for i in items]
    return out


def dish(name: str) -> list:
    return [{"is_station_header": True, "text": "Grill"}, {"food": {"name": name}}]


class FakeAPI:
    """Stands in for nutrislice.fetch_week: menu(menu_type, day) -> menu_items."""

    def __init__(self, menu, fail=()):
        self.menu = menu
        self.fail = set(fail)          # {(menu_type, week start)}
        self.calls = []

    def __call__(self, session, school, menu_type, wk_start):
        self.calls.append((menu_type, wk_start))
        if (menu_type, wk_start) in self.fail:
            raise TimeoutError("read timed out")
        days = [wk_start + timedelta(days=d) for d in range(-1, 6)]
        return {"days": [{"date": d.isoformat(), "menu_items": self.menu(menu_type, d)} for d in days]}


@pytest.fixture
def run(tmp_path, monkeypatch):
    monkeypatch.setattr(nutrislice, "DATA_DIR", tmp_path)
    monkeypatch.setattr(nutrislice.time, "sleep", lambda s: None)

    def _run(hall: Hall, api: FakeAPI) -> dict:
        monkeypatch.setattr(nutrislice, "fetch_week", api)
        scrape(hall, today=TODAY)
        return json.loads((tmp_path / hall.file).read_text(encoding="utf-8"))
    return _run


def write_previous(tmp_path, hall: Hall, days) -> Path:
    out = tmp_path / hall.file
    menus = [{"date": d.isoformat(), "day_of_week": d.strftime("%A"),
              "categories": {"Grill": [{"name": f"old {d}"}]}} for d in days]
    out.write_text(json.dumps({"menus": menus}), encoding="utf-8")
    return out


# --- parsing and merging ---------------------------------------------------

def test_parse_day_reproduces_saved_items_exactly():
    parsed = parse_day(raw_items(FIXTURE["categories"]))
    assert json.dumps(parsed, ensure_ascii=False) == json.dumps(FIXTURE["categories"], ensure_ascii=False)


def test_parse_day_prefixes_station_names():
    items = [{"food": {"name": "Garlic Knots"}}, {"is_station_header": True, "text": "Pizza Bar"},
             {"food": {"name": "Cheese Pizza"}}, {"food": {"name": "  "}}, {"food": None}]
    assert {k: [i["name"] for i in v] for k, v in parse_day(items, "Italian").items()} == {
        "Italian": ["Garlic Knots"], "Italian - Pizza Bar": ["Cheese Pizza"]}


def test_merge_keeps_every_menus_dishes_under_a_reused_header():
    base = parse_day(dish("Toast Special") + [{"food": {"name": "Hash Browns"}}])
    merge_categories(base, parse_day(dish("Curry Special") + [{"food": {"name": "hash browns"}}]))
    assert [i["name"] for i in base["Grill"]] == ["Toast Special", "Hash Browns", "Curry Special"]


# --- whole-hall scrapes ----------------------------------------------------

def test_output_shape_matches_the_existing_files(run):
    libby = run(HALLS["libby"], FakeAPI(lambda mt, d: raw_items(FIXTURE["categories"]) if d.weekday() < 5 else []))
    assert list(libby) == ["dining_location", "url", "scrape_start_date", "repeat_info", "menus"]
    assert libby["dining_location"] == "Libby Dining" and libby["scrape_start_date"] == "2026-09-28"
    # Weekend days (no items) are left out, like a day Nutrislice doesn't list.
    assert [m["date"] for m in libby["menus"]] == [d.isoformat() for d in WINDOW if d.weekday() < 5]
    day = next(m for m in libby["menus"] if m["date"] == FIXTURE["date"])
    assert json.dumps(day, ensure_ascii=False) == json.dumps(FIXTURE, ensure_ascii=False)

    c4c = run(HALLS["c4c"], FakeAPI(lambda mt, d: dish(f"{mt} dish")))
    assert list(c4c) == ["dining_location", "url", "scrape_start_date", "stations_scraped", "repeat_info", "menus"]
    assert c4c["stations_scraped"][0] == "italian" and len(c4c["stations_scraped"]) == 9
    assert "Italian - Grill" in c4c["menus"][0]["categories"]


def test_village_center_keeps_dishes_from_every_station_menu(run):
    out = run(HALLS["village_center"], FakeAPI(lambda mt, d: dish(f"{mt} entree")))
    day = next(m for m in out["menus"] if m["date"] == TODAY.isoformat())
    assert [i["name"] for i in day["categories"]["Grill"]] == [f"{slug} entree" for slug, _ in HALLS["village_center"].menus]


def test_failed_week_keeps_the_previous_days_and_fails_the_step(run, tmp_path):
    hall = HALLS["libby"]
    write_previous(tmp_path, hall, WINDOW)
    current_week = START + timedelta(weeks=2)
    api = FakeAPI(lambda mt, d: dish(f"new {d}"), fail={(hall.menus[0][0], current_week)})

    with pytest.raises(SystemExit) as exc:
        run(hall, api)
    assert exc.value.code == 1
    out = json.loads((tmp_path / hall.file).read_text(encoding="utf-8"))
    names = {m["date"]: m["categories"]["Grill"][0]["name"] for m in out["menus"]}
    assert len(api.calls) == 6                      # later weeks were still fetched
    assert list(names) == [d.isoformat() for d in WINDOW]
    assert names[TODAY.isoformat()] == f"old {TODAY}"
    assert names["2026-10-10"] == "new 2026-10-10" and names["2026-10-18"] == "new 2026-10-18"


def test_failed_scrape_with_fewer_upcoming_days_is_not_written(run, tmp_path):
    hall = HALLS["sewall"]
    before = write_previous(tmp_path, hall, WINDOW).read_bytes()
    slug = hall.menus[0][0]
    last_week = START + timedelta(weeks=5)
    # The current week fails, and the last week comes back empty.
    api = FakeAPI(lambda mt, d: [] if d >= last_week - timedelta(days=1) else dish(f"new {d}"),
                  fail={(slug, START + timedelta(weeks=2))})

    with pytest.raises(SystemExit) as exc:
        run(hall, api)
    assert exc.value.code == 1
    assert (tmp_path / hall.file).read_bytes() == before


def test_one_failed_station_keeps_last_runs_dishes_for_that_week(run, tmp_path):
    hall = HALLS["c4c"]
    out = tmp_path / hall.file
    out.write_text(json.dumps({"menus": [{"date": TODAY.isoformat(), "day_of_week": "Tuesday", "categories": {
        "Asia - Grill": [{"name": "Orange Chicken"}], "Italian - Grill": [{"name": "Old Lasagna"}]}}]}))
    api = FakeAPI(lambda mt, d: dish(f"{mt} dish"), fail={("c4c-asia-all-day", START + timedelta(weeks=2))})

    with pytest.raises(SystemExit):
        run(hall, api)
    day = next(m for m in json.loads(out.read_text())["menus"] if m["date"] == TODAY.isoformat())
    assert [i["name"] for i in day["categories"]["Asia - Grill"]] == ["Orange Chicken"]
    assert [i["name"] for i in day["categories"]["Italian - Grill"]] == ["italian dish", "Old Lasagna"]


def test_closed_hall_writes_empty_scrape_without_failing(run):
    hall = HALLS["alley"]
    out = run(hall, FakeAPI(lambda mt, d: [], fail={(hall.menus[0][0], START)}))
    assert out["menus"] == [] and out["repeat_info"] is None


def test_repeat_is_recorded_and_empty_weeks_are_skipped(run, capsys):
    # Week 1 is a break, weeks 2-6 alternate between two menus.
    def menu(mt, d):
        wk = (d - (START - timedelta(days=1))).days // 7 + 1
        return [] if wk == 1 else dish("A" if wk % 2 else "B")

    out = run(HALLS["seec"], FakeAPI(menu))
    assert out["repeat_info"] == {"first_seen_week": 2, "first_seen_start": "2026-10-05",
                                  "repeat_week": 4, "repeat_start": "2026-10-19", "gap_weeks": 2}
    assert "No repeat found" not in capsys.readouterr().out


def test_no_repeat_is_reported(run, capsys):
    out = run(HALLS["seec"], FakeAPI(lambda mt, d: dish(f"dish {d}")))
    assert out["repeat_info"] is None
    assert "No repeat found within 6 weeks" in capsys.readouterr().out


def test_session_retries_transient_errors():
    retry = nutrislice.make_session().get_adapter("https://colorado-diningmenus.api.nutrislice.com").max_retries
    assert retry.total == 3 and retry.read == 1
    assert {429, 502, 503, 504} <= set(retry.status_forcelist)
    assert retry.allowed_methods == frozenset({"GET"})
